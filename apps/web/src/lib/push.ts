import { api } from './api'

const PUSH_ASKED_KEY = 'point_push_asked'

type VapidKeyResponse = {
  enabled: boolean
  public_key: string
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}

export async function enablePwaPush(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return
  }

  const res = await api.get<VapidKeyResponse>('/api/v1/push/vapid-public-key').catch(() => null)
  const vapid = res?.data
  if (!vapid?.enabled || !vapid.public_key) return

  if (Notification.permission === 'denied') return
  if (Notification.permission === 'default') {
    if (localStorage.getItem(PUSH_ASKED_KEY)) return
    localStorage.setItem(PUSH_ASKED_KEY, '1')
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return
  }

  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(vapid.public_key) as BufferSource,
    }))

  await api.post('/api/v1/push/subscribe', subscription.toJSON())
}
