import { registerSW } from 'virtual:pwa-register'

let initPromise: Promise<ServiceWorkerRegistration | null> | null = null
let lastRegisterError: string | null = null

const usePushOnlyDevSw = import.meta.env.DEV
const SW_RELOAD_KEY = 'point:sw-reload-done'
const PUSH_SW_PATH = '/push-sw.js'

function isPushSwScript(url: string): boolean {
  return url.includes('push-sw')
}

export function getServiceWorkerError(): string | null {
  return lastRegisterError
}

export async function probePushSwScript(): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(PUSH_SW_PATH, { cache: 'no-store' })
    if (!res.ok) return { ok: false, detail: `push-sw.js: HTTP ${res.status}` }
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('javascript') && !ct.includes('ecmascript')) {
      return { ok: false, detail: `push-sw.js: неверный Content-Type (${ct || 'пусто'})` }
    }
    return { ok: true, detail: 'push-sw.js доступен' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, detail: `push-sw.js: ${msg}` }
  }
}

function waitForActiveWorker(
  registration: ServiceWorkerRegistration,
  timeoutMs: number,
): Promise<ServiceWorkerRegistration | null> {
  if (registration.active) return Promise.resolve(registration)

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      resolve(registration.active ? registration : null)
    }, timeoutMs)

    const onActivated = () => {
      window.clearTimeout(timeout)
      resolve(registration)
    }

    const attach = (worker: ServiceWorker | null) => {
      if (!worker) return
      if (worker.state === 'activated') {
        onActivated()
        return
      }
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated') onActivated()
      })
    }

    attach(registration.installing)
    attach(registration.waiting)

    registration.addEventListener('updatefound', () => {
      attach(registration.installing)
    })
  })
}

async function purgeStaleWorkers(): Promise<void> {
  if (!('serviceWorker' in navigator)) return

  const regs = await navigator.serviceWorker.getRegistrations()
  const hasPushActive = regs.some((reg) => {
    const script = reg.active?.scriptURL ?? ''
    return reg.active && isPushSwScript(script)
  })
  if (hasPushActive) return

  await Promise.all(regs.map((reg) => reg.unregister()))

  if ('caches' in window) {
    const names = await caches.keys()
    await Promise.all(names.map((name) => caches.delete(name)))
  }
}

function setupControllerReload(): void {
  if (!('serviceWorker' in navigator)) return
  if (navigator.serviceWorker.controller) return
  try {
    if (sessionStorage.getItem(SW_RELOAD_KEY) === '1') return
  } catch {
    // ignore
  }

  navigator.serviceWorker.addEventListener(
    'controllerchange',
    () => {
      try {
        if (sessionStorage.getItem(SW_RELOAD_KEY) === '1') return
        sessionStorage.setItem(SW_RELOAD_KEY, '1')
      } catch {
        // ignore
      }
      window.location.reload()
    },
    { once: true },
  )
}

async function registerPushOnlySw(): Promise<ServiceWorkerRegistration | null> {
  lastRegisterError = null
  await purgeStaleWorkers()

  const probe = await probePushSwScript()
  if (!probe.ok) {
    lastRegisterError = probe.detail
    return null
  }

  const existing = await navigator.serviceWorker.getRegistration()
  const existingScript = existing?.active?.scriptURL ?? ''
  if (existing?.active && isPushSwScript(existingScript)) {
    return existing
  }

  try {
    const registration = await navigator.serviceWorker.register(PUSH_SW_PATH, {
      scope: '/',
      updateViaCache: 'none',
    })
    setupControllerReload()
    const active = await waitForActiveWorker(registration, 15_000)
    if (!active?.active) {
      lastRegisterError = 'Service worker зарегистрирован, но не активировался'
    }
    return active
  } catch (err) {
    lastRegisterError = err instanceof Error ? err.message : String(err)
    return null
  }
}

async function registerProductionSw(): Promise<ServiceWorkerRegistration | null> {
  lastRegisterError = null
  const existing = await navigator.serviceWorker.getRegistration()
  if (existing?.active) return existing

  let registered: ServiceWorkerRegistration | undefined

  await new Promise<void>((resolve) => {
    const fallback = window.setTimeout(resolve, 8_000)

    registerSW({
      immediate: true,
      onRegisteredSW(_swUrl, registration) {
        window.clearTimeout(fallback)
        registered = registration
        resolve()
      },
      onRegisterError(err) {
        window.clearTimeout(fallback)
        lastRegisterError = String(err ?? 'register failed')
        resolve()
      },
    })
  })

  const registration = registered ?? (await navigator.serviceWorker.getRegistration())
  if (!registration) return null

  return waitForActiveWorker(registration, 12_000)
}

export function initServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (initPromise) return initPromise

  if (!('serviceWorker' in navigator)) {
    lastRegisterError = 'Браузер не поддерживает service worker'
    initPromise = Promise.resolve(null)
    return initPromise
  }

  initPromise = usePushOnlyDevSw ? registerPushOnlySw() : registerProductionSw()
  return initPromise
}

export function swWaitTimeoutMs(): number {
  if (typeof navigator === 'undefined') return 8_000
  return /Android/i.test(navigator.userAgent) ? 20_000 : 12_000
}

export async function waitForAppServiceWorker(timeoutMs?: number): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null

  const limit = timeoutMs ?? swWaitTimeoutMs()
  const fromInit = await initServiceWorker()
  if (fromInit?.active) return fromInit

  const registration = await navigator.serviceWorker.getRegistration()
  if (registration?.active) return registration
  if (registration) {
    const active = await waitForActiveWorker(registration, limit)
    if (active?.active) return active
  }

  try {
    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), limit)),
    ])
    return ready
  } catch {
    return null
  }
}

/** Сброс SW и кэшей (dev / Android). */
export async function resetDevServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  initPromise = null
  lastRegisterError = null
  try {
    sessionStorage.removeItem(SW_RELOAD_KEY)
  } catch {
    // ignore
  }

  const regs = await navigator.serviceWorker.getRegistrations()
  await Promise.all(regs.map((reg) => reg.unregister()))

  if ('caches' in window) {
    const names = await caches.keys()
    await Promise.all(names.map((name) => caches.delete(name)))
  }

  return initServiceWorker()
}
