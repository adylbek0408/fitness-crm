import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'

// Регистрируем Service Worker в production.
// immediate: true + onNeedRefresh — сразу применять новый SW, не ждать ручного обновления.
// Это важно после фиксов роутинга медиафайлов, чтобы у пользователей пропал старый баг.
if (import.meta.env.PROD) {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // Автоматически обновляем SW — у пользователя обновится без клика
      updateSW(true)
    },
    onOfflineReady() {},
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
