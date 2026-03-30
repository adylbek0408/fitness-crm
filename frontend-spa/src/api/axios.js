import axios from 'axios'

const BASE = 'http://83.222.10.148:8090/api'

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

api.interceptors.response.use(
  r => r,
  async err => {
    const originalRequest = err.config
    if (err.response?.status === 401 && !originalRequest._retry) {
      const isCabinet = isCabinetUrl(originalRequest?.url)
      const isLoginUrl = originalRequest?.url?.includes?.('/accounts/token') ||
                         originalRequest?.url?.includes?.('cabinet/login')

      if (isLoginUrl) {
        // Логин-запросы — не перехватываем, пусть ошибка идёт в catch формы
        return Promise.reject(err)
      }

      if (isCabinet) {
        // Cabinet 401 — разлогиниваем из кабинета
        localStorage.removeItem('cabinet_access_token')
        localStorage.removeItem('cabinet_refresh_token')
        window.location.href = '/cabinet'
      } else {
        // Staff 401 — пробуем refresh
        const refreshToken = localStorage.getItem('refresh_token')
        if (refreshToken) {
          originalRequest._retry = true
          try {
            const r = await axios.post(`${BASE}/accounts/token/refresh/`, {
              refresh: refreshToken
            })
            localStorage.setItem('access_token', r.data.access)
            originalRequest.headers.Authorization = `Bearer ${r.data.access}`
            return api(originalRequest)
          } catch {
            localStorage.removeItem('access_token')
            localStorage.removeItem('refresh_token')
            window.location.href = '/login'
          }
        } else {
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(err)
  }
)

export default api
