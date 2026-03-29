import axios from 'axios'

const api = axios.create({
  baseURL: 'http://83.222.10.148:8090/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use(cfg => {
  const url = cfg.url || ''
  const token = url.includes('cabinet') ? localStorage.getItem('cabinet_access_token') : localStorage.getItem('access_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      const isCabinet = err.config?.url?.includes?.('cabinet')
      const isLoginRequest = err.config?.url?.includes?.('cabinet/login')
      if (isCabinet && !isLoginRequest) {
        localStorage.removeItem('cabinet_access_token')
        localStorage.removeItem('cabinet_refresh_token')
        window.location.href = '/cabinet'
      } else if (!isCabinet) {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export default api

