import axios from 'axios'

const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api'

const api = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
})

/**
 * Является ли URL запросом к кабинету клиента.
 * Только /cabinet/... — это кабинет.
 * URL вроде /clients/{id}/reset_cabinet_password/ — это НЕ кабинет,
 * это админский эндпоинт (использует staff-токен).
 */
function isCabinetUrl(url) {
  if (!url) return false
  const path = url.replace(/^https?:\/\/[^/]+/, '').replace(/^\/api/, '')
  return path.startsWith('/cabinet/') || path.startsWith('cabinet/')
}

api.interceptors.request.use(cfg => {
  const token = isCabinetUrl(cfg.url)
    ? localStorage.getItem('cabinet_access_token')
    : localStorage.getItem('access_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// ── Refresh-token coordination ───────────────────────────────────────────────
// Multiple concurrent 401s used to fire multiple refresh requests in parallel.
// With ROTATE_REFRESH_TOKENS=True, the second refresh would arrive with a
// token that the first refresh just invalidated → both sessions would die.
// We coordinate them: the first 401 starts a refresh, every subsequent 401
// subscribes and waits for the same result.
let refreshInFlight = null   // Promise<string|null> while a refresh is running
let refreshSubscribers = []  // queued requests waiting for a fresh access token

function notifySubscribers(newToken) {
  const queued = refreshSubscribers
  refreshSubscribers = []
  queued.forEach(cb => cb(newToken))
}

async function runStaffRefresh() {
  const refreshToken = localStorage.getItem('refresh_token')
  if (!refreshToken) return null
  try {
    const r = await axios.post(`${BASE}/accounts/token/refresh/`, {
      refresh: refreshToken,
    })
    localStorage.setItem('access_token', r.data.access)
    // ROTATE_REFRESH_TOKENS=True on the backend — persist the new refresh too
    if (r.data.refresh) {
      localStorage.setItem('refresh_token', r.data.refresh)
    }
    return r.data.access
  } catch {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    return null
  }
}

api.interceptors.response.use(
  r => r,
  async err => {
    const originalRequest = err.config
    if (err.response?.status === 401 && !originalRequest._retry) {
      const isCabinet = isCabinetUrl(originalRequest?.url)
      const isLoginUrl = originalRequest?.url?.includes?.('/accounts/token') ||
                         originalRequest?.url?.includes?.('cabinet/login')

      if (isLoginUrl) {
        return Promise.reject(err)
      }

      if (isCabinet) {
        // Cabinet has no refresh endpoint — bounce to the cabinet login page,
        // which knows how to render the login form when tokens are missing.
        localStorage.removeItem('cabinet_access_token')
        localStorage.removeItem('cabinet_refresh_token')
        window.location.href = '/cabinet'
        return Promise.reject(err)
      }

      // Staff path — coordinate refreshes across concurrent 401s.
      originalRequest._retry = true

      // If a refresh is already in flight, queue up and resume when it lands.
      if (refreshInFlight) {
        return new Promise((resolve, reject) => {
          refreshSubscribers.push(token => {
            if (!token) { reject(err); return }
            originalRequest.headers.Authorization = `Bearer ${token}`
            api(originalRequest).then(resolve).catch(reject)
          })
        })
      }

      refreshInFlight = runStaffRefresh()
      const newToken = await refreshInFlight
      refreshInFlight = null
      notifySubscribers(newToken)

      if (!newToken) {
        window.location.href = '/login'
        return Promise.reject(err)
      }

      originalRequest.headers.Authorization = `Bearer ${newToken}`
      return api(originalRequest)
    }
    return Promise.reject(err)
  }
)

export default api
