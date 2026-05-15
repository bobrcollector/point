import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      // В dev фронт ходит на тот же origin (/api/...), Vite пересылает на FastAPI.
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true
      }
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false },
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Point — Афиша событий',
        short_name: 'Point',
        description: 'Поиск, организация и управление офлайн‑событиями.',
        theme_color: '#512BD4',
        background_color: '#F8F9FA',
        display: 'standalone',
        start_url: '/',
        lang: 'ru',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      }
    })
  ],
})
