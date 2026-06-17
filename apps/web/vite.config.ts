import fs from 'node:fs'

import path from 'node:path'

import { defineConfig, loadEnv } from 'vite'

import react from '@vitejs/plugin-react'

import basicSsl from '@vitejs/plugin-basic-ssl'

import { VitePWA } from 'vite-plugin-pwa'



function readLanCert(): { cert: Buffer; key: Buffer } | null {

  const certDir = path.resolve(process.cwd(), '.lan-cert')

  const certPath = path.join(certDir, 'cert.pem')

  const keyPath = path.join(certDir, 'key.pem')

  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) return null

  return {

    cert: fs.readFileSync(certPath),

    key: fs.readFileSync(keyPath),

  }

}



/** Vite 8: https — только объект сертификата; без .lan-cert HTTPS даёт @vitejs/plugin-basic-ssl. */

function resolveDevHttps(useLanHttps: boolean, lanCert: { cert: Buffer; key: Buffer } | null) {

  if (!useLanHttps || !lanCert) return undefined

  return lanCert

}



// https://vite.dev/config/

export default defineConfig(({ mode }) => {

  const env = loadEnv(mode, process.cwd(), '')

  const lanHost = env.VITE_LAN_HOST?.trim()

  const androidAdbPush = env.VITE_ANDROID_ADB_PUSH === 'true'

  const useLanHttps = Boolean(lanHost) && !androidAdbPush

  const lanCert = useLanHttps ? readLanCert() : null

  // adb reverse: http://localhost на телефоне → secure context для service worker.

  const devHost = androidAdbPush ? true : lanHost ? '0.0.0.0' : true



  return {

    server: {

      host: devHost,

      port: 5173,

      strictPort: false,

      allowedHosts: true,

      https: resolveDevHttps(useLanHttps, lanCert),

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

      host: devHost,

      port: 4173,

      strictPort: false,

      allowedHosts: true,

      https: resolveDevHttps(useLanHttps, lanCert),

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

      ...(useLanHttps && !lanCert ? [basicSsl()] : []),

      VitePWA({

        registerType: 'autoUpdate',

        injectRegister: false,

        includeAssets: ['favicon.svg', 'icons.svg'],

        devOptions: {

          enabled: false,

          suppressWarnings: true,

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


