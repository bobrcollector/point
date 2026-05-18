import { useCallback, useEffect, useRef, useState } from 'react'
import { env } from '../lib/env'
import { boundsToParam } from '../lib/cities'
import { categoryGroupId } from '../features/catalog/categoryGroups'
import { appendCategoryIcon } from './MapCategoryIcons'
import { IconCrosshair, IconExpandMap, IconMinus, IconPlus } from './MapControlIcons'

declare global {
  interface Window {
    ymaps3?: {
      ready: Promise<void>
      import: (pkg: string) => Promise<any>
      YMap: new (el: HTMLElement, opts: any, children?: any[]) => any
      YMapDefaultSchemeLayer: new (opts: any) => any
      YMapDefaultFeaturesLayer: new (opts: any) => any
      YMapListener: new (opts: any) => any
      YMapMarker: new (opts: any, element: HTMLElement) => any
    }
  }
}

export type MapPoint = {
  id: string
  title: string
  lat: number
  lon: number
  participants?: number
  /** Короткая подпись на метке (необязательно) */
  shortLabel?: string
  category?: string
  coverUrl?: string
  startAt?: string
  place?: string
  priceLabel?: string
}

async function loadYandexMaps(): Promise<void> {
  if (window.ymaps3) return
  const apiKey = env().YANDEX_MAPS_API_KEY
  if (!apiKey) throw new Error('VITE_YANDEX_MAPS_API_KEY не задан (см. apps/web/.env)')

  const src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src^="https://api-maps.yandex.ru/v3/"]`)
    if (existing) {
      if (window.ymaps3) {
        resolve()
        return
      }
      if (existing.dataset.loaded === 'true') {
        reject(new Error('Скрипт Яндекс.Карт загружен, но API недоступно (проверьте ограничения API-ключа по домену).'))
        return
      }
      existing.addEventListener(
        'load',
        () => {
          existing.dataset.loaded = 'true'
          if (window.ymaps3) resolve()
          else reject(new Error('Яндекс.Карты загружены некорректно (проверьте API-ключ и доступ к api-maps.yandex.ru).'))
        },
        { once: true }
      )
      existing.addEventListener('error', () => reject(new Error('Не удалось загрузить Яндекс.Карты (проверьте API-ключ, ограничения по домену и доступ к api-maps.yandex.ru).')), { once: true })
      return
    }

    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => {
      s.dataset.loaded = 'true'
      if (window.ymaps3) resolve()
      else reject(new Error('Скрипт Яндекс.Карт загружен, но API недоступно (проверьте ограничения API-ключа по домену).'))
    }
    s.onerror = () => reject(new Error('Не удалось загрузить Яндекс.Карты (проверьте API-ключ, ограничения по домену и доступ к api-maps.yandex.ru).'))
    document.head.appendChild(s)
  })
}

type MapCenter = {
  lat: number
  lon: number
  zoom: number
}

type Props = {
  points: MapPoint[]
  center?: MapCenter
  onBoundsChange?: (bounds: string) => void
  onPointClick?: (point: MapPoint) => void
  /** Клик по карте — выбор координат (режим организатора) */
  onLocationPick?: (lat: number, lon: number) => void
}

const GROUP_PIN_CLASS: Record<string, string> = {
  culture: 'mapPin--culture',
  games: 'mapPin--games',
  sport: 'mapPin--sport',
  food: 'mapPin--food',
  social: 'mapPin--social',
  festivals: 'mapPin--festivals',
  health: 'mapPin--health',
}

function pinCategoryClass(category?: string): string {
  if (!category) return 'mapPin--default'
  return GROUP_PIN_CLASS[categoryGroupId(category)] ?? 'mapPin--default'
}

function pinPriceShort(priceLabel?: string): string | null {
  if (!priceLabel) return null
  if (priceLabel === 'Бесплатно') return '0 ₽'
  return priceLabel.replace(/\s+/g, ' ')
}

function buildClusterBubble(content: HTMLElement): { halo: HTMLSpanElement; body: HTMLSpanElement } {
  const halo = document.createElement('span')
  halo.className = 'mapMarkerHalo'
  halo.setAttribute('aria-hidden', 'true')
  const body = document.createElement('span')
  body.className = 'mapMarkerBody'
  body.setAttribute('aria-hidden', 'true')
  body.append(content)
  return { halo, body }
}

function buildPinShell(content: HTMLElement): HTMLSpanElement {
  const shell = document.createElement('span')
  shell.className = 'mapPinShell'
  shell.setAttribute('aria-hidden', 'true')

  const headWrap = document.createElement('span')
  headWrap.className = 'mapPinHeadWrap'

  const headRing = document.createElement('span')
  headRing.className = 'mapPinHeadRing'

  const head = document.createElement('span')
  head.className = 'mapPinHead'
  head.append(content)

  headWrap.append(headRing, head)

  const tail = document.createElement('span')
  tail.className = 'mapPinTail'

  shell.append(headWrap, tail)
  return shell
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readMapView(map: any): { center: [number, number]; zoom: number } {
  try {
    const loc = map?.location
    if (loc && Array.isArray(loc.center) && loc.center.length >= 2) {
      const z = typeof loc.zoom === 'number' ? loc.zoom : 12
      return { center: [loc.center[0], loc.center[1]] as [number, number], zoom: z }
    }
  } catch {
    /* ignore */
  }
  return { center: [37.6173, 55.7558], zoom: 11 }
}

async function loadClustererPkg(ymaps3: NonNullable<typeof window.ymaps3>) {
  try {
    const pkg = await import('@yandex/ymaps3-clusterer')
    return { YMapClusterer: pkg.YMapClusterer, clusterByGrid: pkg.clusterByGrid }
  } catch {
    const registerCdn = (ymaps3 as { import?: { registerCdn?: (template: string, pkg: string) => void } }).import
      ?.registerCdn
    registerCdn?.('https://cdn.jsdelivr.net/npm/{package}', '@yandex/ymaps3-clusterer@0.0.12')
    return ymaps3.import('@yandex/ymaps3-clusterer')
  }
}

export function YandexMap({ points, center, onBoundsChange, onPointClick, onLocationPick }: Props) {
  const elRef = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [geoPending, setGeoPending] = useState(false)
  const mapRef = useRef<unknown | null>(null)
  const listenerRef = useRef<unknown | null>(null)
  const clustererRef = useRef<unknown | null>(null)
  const userLocationMarkerRef = useRef<unknown | null>(null)
  const markerRefs = useRef<unknown[]>([])
  const onBoundsChangeRef = useRef<Props['onBoundsChange']>(onBoundsChange)
  const onPointClickRef = useRef<Props['onPointClick']>(onPointClick)
  const onLocationPickRef = useRef<Props['onLocationPick']>(onLocationPick)
  const pickListenerRef = useRef<unknown | null>(null)
  const pointsRef = useRef<MapPoint[]>(points)
  const lastBoundsRef = useRef<string | null>(null)
  const clusterPkgRef = useRef<{ YMapClusterer: any; clusterByGrid: any } | null>(null)
  const clusterMethodRef = useRef<unknown | null>(null)

  const initialCenterRef = useRef(
    (() => {
      if (center) return { lat: center.lat, lon: center.lon, zoom: center.zoom }
      if (!points.length) return { lat: 55.751574, lon: 37.573856, zoom: 10 }
      return { lat: points[0].lat, lon: points[0].lon, zoom: 12 }
    })()
  )

  useEffect(() => {
    if (!center) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = mapRef.current as any
    if (!map?.update) return
    try {
      map.update({ location: { center: [center.lon, center.lat], zoom: center.zoom } })
    } catch {
      // ignore
    }
  }, [center?.lat, center?.lon, center?.zoom])

  useEffect(() => {
    onBoundsChangeRef.current = onBoundsChange
  }, [onBoundsChange])

  useEffect(() => {
    onPointClickRef.current = onPointClick
  }, [onPointClick])

  useEffect(() => {
    onLocationPickRef.current = onLocationPick
  }, [onLocationPick])

  useEffect(() => {
    pointsRef.current = points
  }, [points])

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        await loadYandexMaps()
        if (cancelled) return
        const ymaps3 = window.ymaps3
        if (!ymaps3) throw new Error('Яндекс.Карты v3 не инициализировались')

        await ymaps3.ready
        if (cancelled) return
        if (!elRef.current) return

        if (!mapRef.current) {
          const { YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer } = ymaps3
          mapRef.current = new YMap(
            elRef.current,
            {
              location: {
                center: [initialCenterRef.current.lon, initialCenterRef.current.lat],
                zoom: initialCenterRef.current.zoom
              }
            },
            [new YMapDefaultSchemeLayer({}), new YMapDefaultFeaturesLayer({})]
          )
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const map = mapRef.current as any

        if (onBoundsChangeRef.current && !listenerRef.current) {
          listenerRef.current = new ymaps3.YMapListener({
            onUpdate: () => {
              try {
                const b = map.bounds
                if (!b) return
                const nextBounds = boundsToParam(b)
                if (nextBounds !== lastBoundsRef.current) {
                  lastBoundsRef.current = nextBounds
                  onBoundsChangeRef.current?.(nextBounds)
                }
              } catch {
                // ignore
              }
            }
          })
          map.addChild(listenerRef.current)
        }

        if (onBoundsChangeRef.current) {
          try {
            const b0 = map.bounds
            if (b0) onBoundsChangeRef.current(boundsToParam(b0))
          } catch {
            // ignore
          }
        }

        if (onLocationPickRef.current && !pickListenerRef.current) {
          pickListenerRef.current = new ymaps3.YMapListener({
            layer: 'any',
            onClick: (_object: unknown, event: { coordinates?: [number, number] }) => {
              const coords = event?.coordinates
              if (!coords || coords.length < 2) return
              const [lon, lat] = coords
              onLocationPickRef.current?.(lat, lon)
            }
          })
          map.addChild(pickListenerRef.current)
        }
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Ошибка карты')
      }
    }
    void run()
    return () => {
      cancelled = true
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map = mapRef.current as any
      if (userLocationMarkerRef.current && map?.removeChild) {
        map.removeChild(userLocationMarkerRef.current)
        userLocationMarkerRef.current = null
      }
      for (const markerRef of markerRefs.current) {
        if (map?.removeChild) map.removeChild(markerRef)
      }
      markerRefs.current = []
      if (clustererRef.current && map?.removeChild) map.removeChild(clustererRef.current)
      clustererRef.current = null
      if (listenerRef.current && map?.removeChild) map.removeChild(listenerRef.current)
      listenerRef.current = null
      if (pickListenerRef.current && map?.removeChild) map.removeChild(pickListenerRef.current)
      pickListenerRef.current = null
      if (map?.destroy) map.destroy()
      mapRef.current = null
    }
  }, [])

  function buildPinElement(point: MapPoint): HTMLButtonElement {
    const markerEl = document.createElement('button')
    markerEl.type = 'button'
    markerEl.className = `mapMarker mapPin ${pinCategoryClass(point.category)}`
    const price = pinPriceShort(point.priceLabel)
    const tip = [point.title, point.place, price].filter(Boolean).join(' · ')
    markerEl.setAttribute('aria-label', `Событие: ${point.title}`)
    markerEl.title = tip

    const iconWrap = document.createElement('span')
    iconWrap.className = 'mapMarkerIcon'
    appendCategoryIcon(iconWrap, point.category)

    markerEl.append(buildPinShell(iconWrap))

    if (price) {
      const badge = document.createElement('span')
      badge.className = 'mapPinPrice'
      badge.textContent = price
      badge.setAttribute('aria-hidden', 'true')
      markerEl.append(badge)
    }

    markerEl.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      onPointClickRef.current?.(point)
    })
    return markerEl
  }

  useEffect(() => {
    let cancelled = false
    async function renderMarkers() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map = mapRef.current as any
      const ymaps3 = window.ymaps3
      if (!map || !ymaps3) return

      const { YMapMarker } = ymaps3
      if (clustererRef.current) map.removeChild?.(clustererRef.current)
      clustererRef.current = null
      for (const markerRef of markerRefs.current) map.removeChild?.(markerRef)
      markerRefs.current = []
      if (cancelled) return

      const features = pointsRef.current.map((point) => ({
        type: 'Feature',
        id: point.id,
        geometry: { type: 'Point', coordinates: [point.lon, point.lat] as [number, number] },
        properties: { point }
      }))

      try {
        if (!clusterPkgRef.current) {
          clusterPkgRef.current = await loadClustererPkg(ymaps3)
        }
        if (cancelled || !clusterPkgRef.current) return

        if (!clusterMethodRef.current) {
          clusterMethodRef.current = clusterPkgRef.current.clusterByGrid({ gridSize: 64 })
        }

        const marker = (feature: any) => {
          const point = feature?.properties?.point as MapPoint | undefined
          if (!point) {
            const fallback = document.createElement('button')
            fallback.type = 'button'
            fallback.className = 'mapMarker mapPin'
            return new YMapMarker({ coordinates: feature.geometry.coordinates }, fallback)
          }
          return new YMapMarker({ coordinates: feature.geometry.coordinates }, buildPinElement(point))
        }

        const cluster = (coordinates: [number, number], clusterFeatures: any[]) => {
          const n = clusterFeatures.length
          const el = document.createElement('button')
          el.type = 'button'
          el.className = 'mapMarker mapCluster'
          el.setAttribute('aria-label', `${n} ${n === 1 ? 'событие' : n < 5 ? 'события' : 'событий'} рядом. Нажмите, чтобы приблизить`)
          el.title = `${n} — нажмите, чтобы развернуть`
          const num = document.createElement('span')
          num.className = 'mapClusterNum'
          num.textContent = String(n)
          const { halo, body } = buildClusterBubble(num)
          el.append(halo, body)
          return new YMapMarker(
            {
              coordinates,
              onClick: () => {
                try {
                  const lons = clusterFeatures.map((f) => f.geometry.coordinates[0])
                  const lats = clusterFeatures.map((f) => f.geometry.coordinates[1])
                  const minLon = Math.min(...lons)
                  const minLat = Math.min(...lats)
                  const maxLon = Math.max(...lons)
                  const maxLat = Math.max(...lats)
                  map.update?.({ location: { bounds: [[minLon, minLat], [maxLon, maxLat]] } })
                } catch {
                  // ignore
                }
              }
            },
            el
          )
        }

        clustererRef.current = new clusterPkgRef.current.YMapClusterer({
          method: clusterMethodRef.current,
          features,
          marker,
          cluster,
          tickTimeout: 90
        })
        map.addChild(clustererRef.current)
      } catch {
        markerRefs.current = pointsRef.current.map((point) => {
          const markerEl = buildPinElement(point)
          const marker = new YMapMarker({ coordinates: [point.lon, point.lat] }, markerEl)
          map.addChild(marker)
          return marker
        })
      }
    }

    void renderMarkers()
    return () => {
      cancelled = true
    }
  }, [points])

  const mapAction = useCallback((fn: (map: any) => void) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = mapRef.current as any
    if (!map) return
    try {
      fn(map)
    } catch {
      // ignore
    }
  }, [])

  const zoomIn = useCallback(() => {
    mapAction((map) => {
      const { center, zoom } = readMapView(map)
      map.update?.({ location: { center, zoom: Math.min(zoom + 1, 19) } })
    })
  }, [mapAction])

  const zoomOut = useCallback(() => {
    mapAction((map) => {
      const { center, zoom } = readMapView(map)
      map.update?.({ location: { center, zoom: Math.max(zoom - 1, 3) } })
    })
  }, [mapAction])

  const fitAllPoints = useCallback(() => {
    const pts = pointsRef.current
    mapAction((map) => {
      if (!pts.length) {
        map.update?.({ location: { center: [37.6173, 55.7558], zoom: 10 } })
        return
      }
      const lons = pts.map((p) => p.lon)
      const lats = pts.map((p) => p.lat)
      const minLon = Math.min(...lons)
      const minLat = Math.min(...lats)
      const maxLon = Math.max(...lons)
      const maxLat = Math.max(...lats)
      if (minLon === maxLon && minLat === maxLat) {
        map.update?.({ location: { center: [minLon, minLat], zoom: 14 } })
        return
      }
      map.update?.({ location: { bounds: [[minLon, minLat], [maxLon, maxLat]] } })
    })
  }, [mapAction])

  const goToMyLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      window.alert('Браузер не поддерживает геолокацию')
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = mapRef.current as any
    const ymaps3 = window.ymaps3
    if (!map || !ymaps3) return

    setGeoPending(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeoPending(false)
        const lat = position.coords.latitude
        const lon = position.coords.longitude
        try {
          map.update?.({ location: { center: [lon, lat], zoom: 15 } })
        } catch {
          // ignore
        }

        const { YMapMarker } = ymaps3
        if (userLocationMarkerRef.current) {
          try {
            map.removeChild?.(userLocationMarkerRef.current)
          } catch {
            // ignore
          }
          userLocationMarkerRef.current = null
        }

        const el = document.createElement('div')
        el.className = 'mapUserLocation'
        el.title = 'Вы здесь'
        el.setAttribute('role', 'img')
        el.setAttribute('aria-label', 'Ваше местоположение')
        try {
          const marker = new YMapMarker({ coordinates: [lon, lat] }, el)
          map.addChild?.(marker)
          userLocationMarkerRef.current = marker
        } catch {
          // ignore
        }
      },
      () => {
        setGeoPending(false)
        window.alert('Не удалось определить местоположение')
      },
      { enableHighAccuracy: true, timeout: 12000 }
    )
  }, [])

  if (error) return <div className="mapError">{error}</div>

  return (
    <div className={onLocationPick ? 'mapWithControls mapPickMode' : 'mapWithControls'}>
      <div ref={elRef} className="map" />
      <div className="mapToolStack" role="toolbar" aria-label="Управление картой">
        <button type="button" className="mapToolBtn" onClick={zoomIn} title="Приблизить" aria-label="Приблизить карту">
          <IconPlus className="mapToolIcon" />
        </button>
        <button type="button" className="mapToolBtn" onClick={zoomOut} title="Отдалить" aria-label="Отдалить карту">
          <IconMinus className="mapToolIcon" />
        </button>
        <button
          type="button"
          className="mapToolBtn"
          onClick={fitAllPoints}
          title="Показать все события на карте"
          aria-label="Показать все события на карте"
        >
          <IconExpandMap className="mapToolIcon" />
        </button>
        <span className="mapToolDivider" aria-hidden />
        <button
          type="button"
          className={`mapToolBtn mapToolBtnAccent${geoPending ? ' mapToolBtnBusy' : ''}`}
          onClick={() => goToMyLocation()}
          disabled={geoPending}
          title={geoPending ? 'Определяем местоположение…' : 'Показать моё местоположение на карте'}
          aria-label={geoPending ? 'Определяем местоположение' : 'Моё местоположение'}
        >
          <IconCrosshair className="mapToolIcon" />
        </button>
      </div>
    </div>
  )
}
