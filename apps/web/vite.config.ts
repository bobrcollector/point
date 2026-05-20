import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const pwaInDev = env.VITE_PWA_DEV === 'true'

  return {
    server: {
      port: 5173,
      strictPort: false,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
          ws: true,
        },
        '/uploads': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 4173,
      strictPort: false,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
          ws: true,
        },
        '/uploads': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false,
        includeAssets: ['favicon.svg', 'icons.svg'],
        devOptions: {
          enabled: pwaInDev,
          navigateFallback: 'index.html',
          suppressWarnings: true,
          type: 'module',
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,ico,woff2}'],
          navigateFallbackDenylist: [/^\/api\//],
          importScripts: ['/sw-push.js'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-stylesheets',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
          ],
        },
        manifest: {
          id: '/',
          name: 'Point — Афиша событий',
          short_name: 'Point',
          description: 'Поиск, организация и управление офлайн-мероприятиями.',
          theme_color: '#512BD4',
          background_color: '#f7f7fb',
          display: 'standalone',
          display_override: ['standalone', 'minimal-ui'],
          orientation: 'portrait-primary',
          scope: '/',
          start_url: '/',
          lang: 'ru',
          dir: 'ltr',
          categories: ['entertainment', 'lifestyle'],
          icons: [
            {
              src: '/favicon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            {
              src: '/favicon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'maskable',
            },
          ],
        },
      }),
    ],
  }
})
