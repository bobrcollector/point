type Env = {

  API_BASE_URL: string

  YANDEX_MAPS_API_KEY: string

}



/** Локальная сеть: телефон должен ходить в API через тот же origin (proxy Vite), не на :8000. */

export function isLanHostname(host: string): boolean {

  return /^(192\.168\.|10\.)/.test(host)

}



/** Dev-сервер или LAN-preview: API проксируется тем же хостом, service worker лучше отключить. */

export function isLocalDevAccess(): boolean {

  if (typeof window === 'undefined') return import.meta.env.DEV

  const { hostname, port } = window.location

  if (import.meta.env.DEV) return true

  if (hostname === 'localhost' || hostname === '127.0.0.1') return true

  if (isLanHostname(hostname) && (port === '5173' || port === '4173')) return true

  return false

}



function shouldUseProxiedApi(): boolean {

  if (import.meta.env.DEV) return true

  if (typeof window === 'undefined') return false

  const raw = import.meta.env.VITE_API_BASE_URL

  if (typeof raw === 'string' && raw.trim() !== '') return false

  return isLanHostname(window.location.hostname)

}



function resolveDefaultApiBaseUrl(): string {

  if (typeof window === 'undefined') return 'http://localhost:8000'



  const host = window.location.hostname

  if (shouldUseProxiedApi() || host === 'localhost' || host === '127.0.0.1') {

    return ''

  }

  if (isLanHostname(host)) {

    return ''

  }

  // Production за reverse proxy (nginx): пустой VITE_API_BASE_URL → тот же origin (/api).
  const configuredBase = import.meta.env.VITE_API_BASE_URL
  if (!import.meta.env.DEV && (typeof configuredBase !== 'string' || configuredBase.trim() === '')) {

    return ''

  }

  return 'http://localhost:8000'

}



export function env(): Env {

  const raw = import.meta.env.VITE_API_BASE_URL

  const explicitBase = typeof raw === 'string' && raw.trim() !== ''



  const API_BASE_URL = shouldUseProxiedApi()

    ? ''

    : explicitBase

      ? raw.trim()

      : resolveDefaultApiBaseUrl()



  return {

    API_BASE_URL,

    YANDEX_MAPS_API_KEY: import.meta.env.VITE_YANDEX_MAPS_API_KEY ?? '',

  }

}


