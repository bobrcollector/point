import { api } from './api'
import { isLanHostname } from './env'
import {
  getServiceWorkerError,
  initServiceWorker,
  probePushSwScript,
  swWaitTimeoutMs,
  waitForAppServiceWorker,
} from './serviceWorker'

const PUSH_ASKED_KEY = 'point_push_asked'

type VapidKeyResponse = {
  enabled: boolean
  public_key: string
}

export type PushPlatform = 'windows' | 'android' | 'ios' | 'macos' | 'firefox' | 'other'

export function isFirefoxBrowser(): boolean {
  return typeof navigator !== 'undefined' && /Firefox\//i.test(navigator.userAgent)
}

export type PushEnableResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'no-vapid' | 'denied' | 'no-sw' | 'ios-not-installed' | 'insecure' | 'error'; message: string }

export type PushCapability = {
  supported: boolean
  platform: PushPlatform
  permission: NotificationPermission | 'unsupported'
  vapidEnabled: boolean
  subscribed: boolean
  standalone: boolean
  secureContext: boolean
  hint: string | null
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

export function detectPushPlatform(): PushPlatform {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent
  if (/Firefox\//i.test(ua)) return 'firefox'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  if (/Windows/i.test(ua)) return 'windows'
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macos'
  return 'other'
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isInAppBrowser(): boolean {
  const ua = navigator.userAgent
  return /FBAN|FBAV|Instagram|Line\/|MicroMessenger|Telegram|Twitter|VKontakte/i.test(ua)
}

function explainMissingPushApis(platform: PushPlatform, standalone: boolean): string {
  if (platform === 'ios') {
    if (!standalone) {
      return 'На iPhone/iPad push работает только в установленном приложении: Safari → Поделиться → «На экран Домой», затем откройте Point оттуда.'
    }
    return 'Обновите iOS до 16.4+ и откройте Point с экрана «Домой» (не из вкладки Safari).'
  }
  if (platform === 'android') {
    if (isInAppBrowser()) {
      return 'Откройте сайт в Chrome (не во встроенном браузере Telegram/VK), затем включите push.'
    }
    return 'Используйте Chrome на Android. Разрешите уведомления для сайта в настройках браузера.'
  }
  return 'Этот браузер не поддерживает Web Push. Попробуйте Chrome, Edge или Safari.'
}

function explainAndroidSwOnLan(swError: string | null): string {
  const host = typeof window !== 'undefined' ? window.location.hostname : ''
  const port = typeof window !== 'undefined' && window.location.port ? `:${window.location.port}` : ''
  const origin = `${window.location.protocol}//${host}${port}`
  const err = swError ? ` (${swError})` : ''
  if (host === 'localhost' || host === '127.0.0.1') {
    return `Service worker не активен${err}. Обновите страницу. Адрес должен быть http://localhost${port || ':5173'} (режим adb).`
  }
  return (
    `Chrome на Android не регистрирует service worker на самоподписанном ${origin}${err}. ` +
    'Push с телефона: подключите USB, на ПК выполните npm run dev:android:push, в Chrome откройте http://localhost:5173. ' +
    'Либо установите mkcert: npm run setup:mkcert.'
  )
}

function explainInsecureContext(_platform: PushPlatform): string {
  const host = typeof window !== 'undefined' ? window.location.hostname : ''
  if (isLanHostname(host)) {
    return `Push на телефоне требует HTTPS. Откройте https://${host}${window.location.port ? `:${window.location.port}` : ''} (примите предупреждение о сертификате) — не http://.`
  }
  return 'Push доступен только по HTTPS (или localhost на компьютере).'
}

async function fetchVapidKey(): Promise<VapidKeyResponse | null> {
  const res = await api.get<VapidKeyResponse>('/api/v1/push/vapid-public-key').catch(() => null)
  return res?.data ?? null
}

export async function getPushCapability(): Promise<PushCapability> {
  const platform = detectPushPlatform()
  const standalone = isStandalonePwa()
  const secureContext = typeof window !== 'undefined' && window.isSecureContext

  if (!secureContext) {
    return {
      supported: false,
      platform,
      permission: 'Notification' in window ? Notification.permission : 'unsupported',
      vapidEnabled: false,
      subscribed: false,
      standalone,
      secureContext: false,
      hint: explainInsecureContext(platform),
    }
  }

  if (platform === 'ios' && !standalone) {
    return {
      supported: false,
      platform,
      permission: 'Notification' in window ? Notification.permission : 'unsupported',
      vapidEnabled: false,
      subscribed: false,
      standalone,
      secureContext: true,
      hint: explainMissingPushApis(platform, standalone),
    }
  }

  const hasNotification = 'Notification' in window
  const hasPushManager = 'PushManager' in window
  const hasServiceWorker = 'serviceWorker' in navigator

  if (!hasNotification || !hasPushManager || !hasServiceWorker) {
    return {
      supported: false,
      platform,
      permission: hasNotification ? Notification.permission : 'unsupported',
      vapidEnabled: false,
      subscribed: false,
      standalone,
      secureContext: true,
      hint: explainMissingPushApis(platform, standalone),
    }
  }

  const vapid = await fetchVapidKey()
  await initServiceWorker()
  const registration = await waitForAppServiceWorker(swWaitTimeoutMs())
  const swError = getServiceWorkerError()
  let subscribed = false
  if (registration) {
    const sub = await registration.pushManager.getSubscription()
    subscribed = Boolean(sub)
  }

  const vapidEnabled = Boolean(vapid?.enabled && vapid.public_key)
  const supported = vapidEnabled && Boolean(registration)

  let hint: string | null = null
  if (!vapidEnabled) {
    hint = 'Push на сервере не настроен. Запустите npm run generate:vapid и перезапустите API.'
  } else if (!registration) {
    if (platform === 'android') {
      const probe = await probePushSwScript()
      hint = explainAndroidSwOnLan(swError ?? (probe.ok ? null : probe.detail))
    } else {
      hint = swError
        ? `Service worker: ${swError}. Обновите страницу.`
        : 'Service worker ещё не готов. Обновите страницу и подождите несколько секунд.'
    }
  } else if (Notification.permission === 'denied') {
    hint = 'Уведомления заблокированы. Разрешите их в настройках браузера для этого сайта.'
  } else if (platform === 'android') {
    hint = 'Chrome на Android: включите push и разрешите уведомления для Point.'
  } else if (platform === 'ios') {
    hint = 'iOS: push работает в приложении с экрана «Домой».'
  } else if (platform === 'firefox') {
    hint =
      'Firefox: включите push отдельно в этом браузере (не переносится из Chrome). Сворачивайте окно — при активной вкладке уведомление может не всплыть.'
  } else if (platform === 'windows') {
    hint = 'Windows: уведомления появятся в центре уведомлений Edge/Chrome.'
  }

  return {
    supported,
    platform,
    permission: Notification.permission,
    vapidEnabled,
    subscribed,
    standalone,
    secureContext: true,
    hint,
  }
}

export async function enablePwaPush(options?: { forcePermission?: boolean }): Promise<PushEnableResult> {
  const platform = detectPushPlatform()

  if (!window.isSecureContext) {
    return { ok: false, reason: 'insecure', message: explainInsecureContext(platform) }
  }

  if (platform === 'ios' && !isStandalonePwa()) {
    return {
      ok: false,
      reason: 'ios-not-installed',
      message: explainMissingPushApis(platform, false),
    }
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { ok: false, reason: 'unsupported', message: explainMissingPushApis(platform, isStandalonePwa()) }
  }

  const vapid = await fetchVapidKey()
  if (!vapid?.enabled || !vapid.public_key) {
    return { ok: false, reason: 'no-vapid', message: 'Сервер не настроен для push.' }
  }

  if (Notification.permission === 'denied') {
    return { ok: false, reason: 'denied', message: 'Разрешите уведомления в настройках браузера.' }
  }

  if (Notification.permission === 'default') {
    if (!options?.forcePermission && localStorage.getItem(PUSH_ASKED_KEY)) {
      return { ok: false, reason: 'denied', message: 'Нужно разрешение на уведомления.' }
    }
    localStorage.setItem(PUSH_ASKED_KEY, '1')
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      return { ok: false, reason: 'denied', message: 'Вы не разрешили уведомления.' }
    }
  }

  const registration = await waitForAppServiceWorker(swWaitTimeoutMs())
  if (!registration) {
    return {
      ok: false,
      reason: 'no-sw',
      message:
        platform === 'android'
          ? explainAndroidSwOnLan(getServiceWorkerError())
          : getServiceWorkerError()
            ? `Service worker: ${getServiceWorkerError()}`
            : 'Service worker не активен. Обновите страницу.',
    }
  }

  try {
    const existing = await registration.pushManager.getSubscription()
    if (existing) {
      await existing.unsubscribe()
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(vapid.public_key) as BufferSource,
    })

    await api.post('/api/v1/push/subscribe', subscription.toJSON())
    return { ok: true }
  } catch {
    return { ok: false, reason: 'error', message: 'Не удалось подписаться на push.' }
  }
}

export async function disablePwaPush(): Promise<void> {
  let endpoint: string | undefined
  if ('serviceWorker' in navigator) {
    try {
      const registration = await waitForAppServiceWorker()
      if (!registration) return
      const sub = await registration.pushManager.getSubscription()
      if (sub) {
        endpoint = sub.endpoint
        await sub.unsubscribe()
      }
    } catch {
      // ignore
    }
  }
  if (endpoint) {
    await api.delete('/api/v1/push/subscribe', { params: { endpoint } }).catch(() => null)
  }
}

let syncInFlight: Promise<void> | null = null

export async function syncPushSubscription(): Promise<void> {
  if (syncInFlight) return syncInFlight

  syncInFlight = (async () => {
    if (!window.isSecureContext) return
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    const vapid = await fetchVapidKey()
    if (!vapid?.enabled || !vapid.public_key) return

    const registration = await waitForAppServiceWorker(5_000)
    if (!registration) return

    try {
      const existing = await registration.pushManager.getSubscription()
      if (existing) {
        await api.post('/api/v1/push/subscribe', existing.toJSON())
        return
      }
      await enablePwaPush({ forcePermission: true })
    } catch {
      // ignore background sync errors
    }
  })().finally(() => {
    syncInFlight = null
  })

  return syncInFlight
}

export type TestPushResult =
  | { ok: true; sent: number; failed: number }
  | { ok: false; message: string; hint?: string }

export async function sendTestPush(): Promise<TestPushResult> {
  const res = await api.post<{ detail: string; sent?: number; failed?: number; hint?: string }>('/api/v1/push/test')
  const { detail, sent = 0, failed = 0, hint } = res.data
  if (detail === 'sent' && sent > 0) {
    return { ok: true, sent, failed }
  }
  if (detail === 'push_failed') {
    return {
      ok: false,
      message: 'Сервер не смог доставить push (подписка устарела).',
      hint: hint ?? 'Отключите и снова включите push в настройках.',
    }
  }
  if (detail === 'no_subscriptions') {
    return {
      ok: false,
      message: 'Нет активной подписки в браузере.',
      hint: hint ?? 'Включите push и разрешите уведомления.',
    }
  }
  return { ok: false, message: 'Не удалось отправить тестовое уведомление.' }
}

export function clearPushAskedFlag(): void {
  localStorage.removeItem(PUSH_ASKED_KEY)
}

export async function syncPushSubscriptionFromSwMessage(subscription: PushSubscriptionJSON): Promise<void> {
  await api.post('/api/v1/push/subscribe', subscription)
}
