import { env } from './env'

export type YmapsApi = {
  ready: (cb: () => void) => void
  Map: new (
    parent: HTMLElement | string,
    state: { center: number[]; zoom: number; controls?: string[] },
    options?: Record<string, unknown>
  ) => YmapsMap
  Clusterer: new (options?: Record<string, unknown>) => YmapsClusterer
  Placemark: new (geometry: number[], properties?: Record<string, unknown>, options?: Record<string, unknown>) => unknown
  templateLayoutFactory: {
    createClass: (template: string, methods?: Record<string, unknown>) => unknown
  }
  geocode: (
    query: string | number[],
    options?: Record<string, unknown>
  ) => Promise<{ geoObjects: { each: (cb: (obj: YmapsGeoObject) => void) => void } }>
}

export type YmapsMap = {
  geoObjects: { add: (obj: unknown) => void; remove: (obj: unknown) => void }
  events: { add: (name: string, cb: (e: YmapsEvent) => void) => void; remove: (name: string, cb: (e: YmapsEvent) => void) => void }
  setCenter: (center: number[], zoom?: number, options?: Record<string, unknown>) => void
  getCenter: () => number[]
  getZoom: () => number
  getBounds: () => number[][]
  setBounds: (bounds: number[][], options?: Record<string, unknown>) => void
  destroy: () => void
}

export type YmapsClusterer = {
  add: (items: unknown[]) => void
  removeAll: () => void
  getGeoObjects: () => { each: (cb: (obj: unknown) => void) => void }
}

export type YmapsEvent = {
  get: (name: string) => number[]
}

export type YmapsGeoObject = {
  geometry: { getCoordinates: () => number[] }
  properties: { get: (name: string) => unknown }
  getAddressLine?: () => string
}

declare global {
  interface Window {
    ymaps?: YmapsApi
  }
}

let loadPromise: Promise<YmapsApi> | null = null

export function loadYandexMaps(): Promise<YmapsApi> {
  if (loadPromise) return loadPromise

  loadPromise = new Promise<YmapsApi>((resolve, reject) => {
    const apiKey = env().YANDEX_MAPS_API_KEY
    if (!apiKey) {
      reject(new Error('VITE_YANDEX_MAPS_API_KEY не задан (см. apps/web/.env)'))
      return
    }

    const finish = (ymaps: YmapsApi) => {
      ymaps.ready(() => resolve(ymaps))
    }

    if (window.ymaps) {
      finish(window.ymaps)
      return
    }

    const src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`
    const existing = document.querySelector<HTMLScriptElement>('script[src^="https://api-maps.yandex.ru/2.1/"]')

    const onReady = () => {
      if (window.ymaps) finish(window.ymaps)
      else reject(new Error('Скрипт Яндекс.Карт загружен, но API недоступно (проверьте ограничения ключа по домену).'))
    }

    const onError = () => {
      loadPromise = null
      reject(new Error('Не удалось загрузить Яндекс.Карты (проверьте API-ключ и доступ к api-maps.yandex.ru).'))
    }

    if (existing) {
      if (existing.dataset.loaded === 'true') {
        onReady()
        return
      }
      existing.addEventListener('load', () => {
        existing.dataset.loaded = 'true'
        onReady()
      }, { once: true })
      existing.addEventListener('error', onError, { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = () => {
      script.dataset.loaded = 'true'
      onReady()
    }
    script.onerror = onError
    document.head.appendChild(script)
  }).catch((err: unknown) => {
    loadPromise = null
    throw err
  }) as Promise<YmapsApi>

  return loadPromise
}
