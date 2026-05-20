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
// We coordinate per-auth-type so staff and cabinet don't interfere.
const refreshState = {
  staff:   { inFlight: null, subscribers: [] },
  cabinet: { inFlight: null, subscribers: [] },
}

function notifySubscribers(type, newToken) {
  const queued = refreshState[type].subscribers
  refreshState[type].subscribers = []
  queued.forEach(cb => cb(newToken))
}

async function runStaffRefresh() {
  const refreshToken = localStorage.getItem('refresh_token')
  if (!refreshToken) return null
  try {
    const r = await axios.post(`${BASE}/accounts/token/refresh/`, { refresh: refreshToken })
    localStorage.setItem('access_token', r.data.access)
    if (r.data.refresh) localStorage.setItem('refresh_token', r.data.refresh)
    return r.data.access
  } catch {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    return null
  }
}

async function runCabinetRefresh() {
  const refreshToken = localStorage.getItem('cabinet_refresh_token')
  if (!refreshToken) return null
  try {
    const r = await axios.post(`${BASE}/cabinet/token/refresh/`, { refresh: refreshToken })
    localStorage.setItem('cabinet_access_token', r.data.access)
    return r.data.access
  } catch {
    localStorage.removeItem('cabinet_access_token')
    localStorage.removeItem('cabinet_refresh_token')
    return null
  }
}

async function doRefresh(type) {
  const state = refreshState[type]
  if (state.inFlight) return state.inFlight
  state.inFlight = type === 'cabinet' ? runCabinetRefresh() : runStaffRefresh()
  const token = await state.inFlight
  state.inFlight = null
  notifySubscribers(type, token)
  return token
}

api.interceptors.response.use(
  r => r,
  async err => {
    const originalRequest = err.config
    if (err.response?.status === 401 && !originalRequest._retry) {
      const isCabinet = isCabinetUrl(originalRequest?.url)
      const isLoginUrl = originalRequest?.url?.includes?.('/accounts/token') ||
                         originalRequest?.url?.includes?.('cabinet/login') ||
                         originalRequest?.url?.includes?.('cabinet/token/refresh')

      if (isLoginUrl) return Promise.reject(err)

      originalRequest._retry = true
      const type = isCabinet ? 'cabinet' : 'staff'
      const redirectUrl = isCabinet ? '/cabinet' : '/login'

      // If a refresh is already in flight, queue up and wait for it.
      if (refreshState[type].inFlight) {
        return new Promise((resolve, reject) => {
          refreshState[type].subscribers.push(token => {
            if (!token) { reject(err); return }
            originalRequest.headers.Authorization = `Bearer ${token}`
            api(originalRequest).then(resolve).catch(reject)
          })
        })
      }

      const newToken = await doRefresh(type)
      if (!newToken) {
        window.location.href = redirectUrl
        return Promise.reject(err)
      }

      originalRequest.headers.Authorization = `Bearer ${newToken}`
      return api(originalRequest)
    }
    return Promise.reject(err)
  }
)

export default api
