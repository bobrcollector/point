import { useCallback, useEffect, useRef, useState } from 'react'
import { boundsToParam } from '../lib/cities'
import { loadYandexMaps, type YmapsApi, type YmapsEvent, type YmapsMap } from '../lib/yandexMapsLoader'
import { categoryGroupId } from '../features/catalog/categoryGroups'
import { appendCategoryIcon } from './MapCategoryIcons'
import { IconCrosshair, IconExpandMap, IconMinus, IconPlus } from './MapControlIcons'

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

function buildPinHtml(point: MapPoint): string {
  const markerEl = document.createElement('button')
  markerEl.type = 'button'
  markerEl.className = `mapMarker mapPin ${pinCategoryClass(point.category)}`
  const price = pinPriceShort(point.priceLabel)
  const tip = [point.title, point.place, price].filter(Boolean).join(' · ')
  markerEl.setAttribute('aria-label', `Событие: ${point.title}`)
  markerEl.title = tip
  markerEl.dataset.pointId = point.id

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

  return markerEl.outerHTML
}

function boundsFromYmaps21(bounds: number[][]): string {
  const [[lat1, lon1], [lat2, lon2]] = bounds
  return boundsToParam([
    [lon1, lat1],
    [lon2, lat2],
  ])
}

function createPinLayout(ymaps: YmapsApi, html: string, onActivate: () => void) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Layout = ymaps.templateLayoutFactory.createClass(html, {
    build: function (this: { getParentElement: () => HTMLElement }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(Layout as any).superclass.build.call(this)
      const btn = this.getParentElement().querySelector<HTMLButtonElement>('.mapMarker')
      if (!btn) return
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        onActivate()
      })
    },
  })
  return Layout
}

function createPlacemark(ymaps: YmapsApi, point: MapPoint, onClick: (point: MapPoint) => void) {
  const html = buildPinHtml(point)
  const iconLayout = createPinLayout(ymaps, html, () => onClick(point))
  return new ymaps.Placemark(
    [point.lat, point.lon],
    {},
    {
      iconLayout,
      iconShape: { type: 'Rectangle', coordinates: [[-28, -52], [28, 4]] },
      zIndex: 1000,
      cursor: 'pointer',
    }
  )
}

function ensureClusterLayouts(ymaps: YmapsApi) {
  const clusterHtml = (() => {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = 'mapMarker mapCluster'
    const num = document.createElement('span')
    num.className = 'mapClusterNum'
    const { halo, body } = buildClusterBubble(num)
    el.append(halo, body)
    return el.outerHTML.replace(
      '<span class="mapClusterNum"></span>',
      '<span class="mapClusterNum">$[properties.geoObjects.length]</span>'
    )
  })()

  const clusterIconContentLayout = ymaps.templateLayoutFactory.createClass(clusterHtml)
  return { clusterIconContentLayout }
}

export function YandexMap({ points, center, onBoundsChange, onPointClick, onLocationPick }: Props) {
  const elRef = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [geoPending, setGeoPending] = useState(false)
  const ymapsRef = useRef<YmapsApi | null>(null)
  const mapRef = useRef<YmapsMap | null>(null)
  const clustererRef = useRef<{ removeAll: () => void; add: (items: unknown[]) => void } | null>(null)
  const clusterLayoutsRef = useRef<{ clusterIconContentLayout: unknown } | null>(null)
  const userLocationMarkerRef = useRef<unknown | null>(null)
  const onBoundsChangeRef = useRef<Props['onBoundsChange']>(onBoundsChange)
  const onPointClickRef = useRef<Props['onPointClick']>(onPointClick)
  const onLocationPickRef = useRef<Props['onLocationPick']>(onLocationPick)
  const pointsRef = useRef<MapPoint[]>(points)
  const lastBoundsRef = useRef<string | null>(null)
  const boundsHandlerRef = useRef<((e: YmapsEvent) => void) | null>(null)
  const pickHandlerRef = useRef<((e: YmapsEvent) => void) | null>(null)

  const initialCenterRef = useRef(
    (() => {
      if (center) return { lat: center.lat, lon: center.lon, zoom: center.zoom }
      if (!points.length) return { lat: 55.751574, lon: 37.573856, zoom: 10 }
      return { lat: points[0].lat, lon: points[0].lon, zoom: 12 }
    })()
  )

  useEffect(() => {
    if (!center) return
    const map = mapRef.current
    if (!map) return
    try {
      map.setCenter([center.lat, center.lon], center.zoom)
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
        const ymaps = await loadYandexMaps()
        if (cancelled) return
        ymapsRef.current = ymaps
        if (!elRef.current) return

        if (!mapRef.current) {
          const initial = initialCenterRef.current
          const map = new ymaps.Map(
            elRef.current,
            {
              center: [initial.lat, initial.lon],
              zoom: initial.zoom,
              controls: [],
            },
            { suppressMapOpenBlock: true }
          )
          mapRef.current = map

          if (!clusterLayoutsRef.current) {
            clusterLayoutsRef.current = ensureClusterLayouts(ymaps)
          }

          const clusterer = new ymaps.Clusterer({
            groupByCoordinates: false,
            clusterDisableClickZoom: true,
            clusterHideIconOnBalloonOpen: false,
            geoObjectHideIconOnBalloonOpen: false,
            clusterIconLayout: 'default#imageWithContent',
            clusterIconContentLayout: clusterLayoutsRef.current.clusterIconContentLayout,
            clusterIconShape: { type: 'Circle', coordinates: [0, 0], radius: 28 },
          })
          clustererRef.current = clusterer
          map.geoObjects.add(clusterer)

          if (onBoundsChangeRef.current) {
            const onBounds = () => {
              try {
                const nextBounds = boundsFromYmaps21(map.getBounds())
                if (nextBounds !== lastBoundsRef.current) {
                  lastBoundsRef.current = nextBounds
                  onBoundsChangeRef.current?.(nextBounds)
                }
              } catch {
                // ignore
              }
            }
            boundsHandlerRef.current = onBounds
            map.events.add('boundschange', onBounds)
            onBounds()
          }

          if (onLocationPickRef.current) {
            const onClick = (e: YmapsEvent) => {
              const coords = e.get('coords')
              if (!coords || coords.length < 2) return
              onLocationPickRef.current?.(coords[0], coords[1])
            }
            pickHandlerRef.current = onClick
            map.events.add('click', onClick)
          }
        }
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Ошибка карты')
      }
    }

    void run()
    return () => {
      cancelled = true
      const map = mapRef.current
      if (map) {
        if (boundsHandlerRef.current) map.events.remove('boundschange', boundsHandlerRef.current)
        if (pickHandlerRef.current) map.events.remove('click', pickHandlerRef.current)
        if (userLocationMarkerRef.current) map.geoObjects.remove(userLocationMarkerRef.current)
        map.destroy()
      }
      mapRef.current = null
      clustererRef.current = null
      userLocationMarkerRef.current = null
      boundsHandlerRef.current = null
      pickHandlerRef.current = null
    }
  }, [])

  useEffect(() => {
    const ymaps = ymapsRef.current
    const clusterer = clustererRef.current
    if (!ymaps || !clusterer) return

    clusterer.removeAll()
    const placemarks = pointsRef.current.map((point) =>
      createPlacemark(ymaps, point, (p) => onPointClickRef.current?.(p))
    )
    if (placemarks.length) clusterer.add(placemarks)
  }, [points])

  const mapAction = useCallback((fn: (map: YmapsMap) => void) => {
    const map = mapRef.current
    if (!map) return
    try {
      fn(map)
    } catch {
      // ignore
    }
  }, [])

  const zoomIn = useCallback(() => {
    mapAction((map) => {
      map.setCenter(map.getCenter(), Math.min(map.getZoom() + 1, 19))
    })
  }, [mapAction])

  const zoomOut = useCallback(() => {
    mapAction((map) => {
      map.setCenter(map.getCenter(), Math.max(map.getZoom() - 1, 3))
    })
  }, [mapAction])

  const fitAllPoints = useCallback(() => {
    const pts = pointsRef.current
    mapAction((map) => {
      if (!pts.length) {
        map.setCenter([55.7558, 37.6173], 10)
        return
      }
      const lats = pts.map((p) => p.lat)
      const lons = pts.map((p) => p.lon)
      const minLat = Math.min(...lats)
      const maxLat = Math.max(...lats)
      const minLon = Math.min(...lons)
      const maxLon = Math.max(...lons)
      if (minLat === maxLat && minLon === maxLon) {
        map.setCenter([minLat, minLon], 14)
        return
      }
      map.setBounds(
        [
          [minLat, minLon],
          [maxLat, maxLon],
        ],
        { checkZoomRange: true, duration: 200 }
      )
    })
  }, [mapAction])

  const goToMyLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      window.alert('Браузер не поддерживает геолокацию')
      return
    }
    const map = mapRef.current
    const ymaps = ymapsRef.current
    if (!map || !ymaps) return

    setGeoPending(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeoPending(false)
        const lat = position.coords.latitude
        const lon = position.coords.longitude
        try {
          map.setCenter([lat, lon], 15)
        } catch {
          // ignore
        }

        if (userLocationMarkerRef.current) {
          try {
            map.geoObjects.remove(userLocationMarkerRef.current)
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
        const layout = ymaps.templateLayoutFactory.createClass(el.outerHTML)
        try {
          const marker = new ymaps.Placemark(
            [lat, lon],
            {},
            {
              iconLayout: layout,
              iconShape: { type: 'Circle', coordinates: [0, 0], radius: 12 },
            }
          )
          map.geoObjects.add(marker)
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
