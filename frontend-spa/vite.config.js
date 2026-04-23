import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['vite.svg'],
      workbox: {
        // ── КРИТИЧНО: исключаем backend-роуты из navigation fallback.
        // Без этого SW при клике на https://host/media/receipts/...jpeg
        // считает это SPA-переходом, подставляет index.html → React не знает
        // такой маршрут → редирект на /login. То же самое для /api/ и /admin/.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          /^\/media\//,
          /^\/api\//,
          /^\/admin\//,
          /^\/static\//,
          /\.(?:png|jpg|jpeg|gif|webp|svg|pdf|zip)$/i,
        ],
        // Не кэшировать медиа и API — они всегда свежие с сервера
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/[^/]+\/media\//,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https?:\/\/[^/]+\/api\//,
            handler: 'NetworkOnly',
          },
        ],
      },
      manifest: {
        name: 'Асылзада CRM',
        short_name: 'Асылзада CRM',
        description: 'Мобильное приложение Асылзада CRM',
        theme_color: '#2563eb',
        background_color: '#f9fafb',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        icons: [{ src: '/vite.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
      }
    })
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      // ✅ Прокси для медиафайлов (чеки, фото)
      // Без этого ссылки /media/... уходили на :5173 и редиректили на /login
      '/media': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    }
  }
})
