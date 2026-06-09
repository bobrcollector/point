/* Push-only service worker (dev + fallback). Без importScripts — надёжнее на Android Chrome. */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

function notificationOptions(payload) {
  const targetUrl = payload.url || '/notifications'
  return {
    body: payload.body || 'Новое уведомление',
    tag: payload.tag || 'point-notification',
    data: { url: targetUrl },
  }
}

async function showPushNotification(title, payload) {
  const options = notificationOptions(payload)
  try {
    await self.registration.showNotification(title, {
      ...options,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
    })
  } catch {
    // Firefox не поддерживает SVG-иконки в уведомлениях — показываем без icon.
    await self.registration.showNotification(title, options)
  }
}

self.addEventListener('push', (event) => {
  let payload = {}
  if (event.data) {
    try {
      payload = event.data.json()
    } catch {
      payload = { body: event.data.text() }
    }
  }

  const title = payload.title || 'Point'
  event.waitUntil(showPushNotification(title, payload))
})

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const sub = event.newSubscription ?? (await self.registration.pushManager.getSubscription())
      if (!sub) return
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clients) {
        client.postMessage({ type: 'push-subscription-changed', subscription: sub.toJSON() })
      }
    })(),
  )
})

async function openNotificationUrl(targetUrl) {
  const absolute = new URL(targetUrl, self.location.origin).href
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

  for (const client of clients) {
    if (!client.url.startsWith(self.location.origin)) continue
    if ('focus' in client) {
      await client.focus()
      if ('navigate' in client) {
        await client.navigate(absolute)
      }
      return
    }
  }

  if (self.clients.openWindow) {
    await self.clients.openWindow(absolute)
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/notifications'
  event.waitUntil(openNotificationUrl(targetUrl))
})
