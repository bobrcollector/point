type Env = {
  API_BASE_URL: string
  YANDEX_MAPS_API_KEY: string
}

export function env(): Env {
  const raw = import.meta.env.VITE_API_BASE_URL
  const explicitBase = typeof raw === 'string' && raw.trim() !== ''
  // В dev без явного URL запросы идут на тот же хост что и Vite; см. proxy в vite.config.ts.
  const API_BASE_URL = explicitBase
    ? raw.trim()
    : import.meta.env.DEV
      ? ''
      : 'http://localhost:8000'

  return {
    API_BASE_URL,
    YANDEX_MAPS_API_KEY: import.meta.env.VITE_YANDEX_MAPS_API_KEY ?? ''
  }
}

