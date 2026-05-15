import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AgeRatingBadge } from '../components/AgeRatingBadge'
import { useEvents } from '../features/catalog/queries'
import { type MapPoint, YandexMap } from '../widgets/YandexMap'

type EventItem = {
  id: string
  title: string
  date: string
  place: string
  price: number
  participants?: number
  rating?: number
  coverUrl?: string
  lat?: number
  lon?: number
  categories?: string[]
  ageRatingMin?: number
}

export function CatalogPage() {
  const [view, setView] = useState<'list' | 'map'>('list')
  const [geo, setGeo] = useState<{ lat: number; lon: number } | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null)

  useEffect(() => {
    if (!('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      (pos) => setGeo({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => {
        // Геолокация не обязательна: просто не передаём lat/lon
      },
      { enableHighAccuracy: true, timeout: 7000 }
    )
  }, [])

  const eventsQuery = useEvents({
    lat: geo?.lat,
    lon: geo?.lon,
    limit: 50,
    offset: 0,
    sort_by: geo ? 'distance' : 'date'
  })

  const events: EventItem[] = useMemo(() => {
    const items = eventsQuery.data?.items ?? []
    return items.map((it) => ({
      id: String(it.event_id),
      title: it.title,
      date: it.event_datetime,
      place: it.location,
      price: it.price,
      participants: undefined,
      rating: it.average_rating ?? undefined,
      coverUrl: it.cover_image_url ?? undefined,
      categories: it.categories?.map((c) => c.name) ?? [],
      ageRatingMin: it.age_rating_min,
      lat: it.latitude ?? undefined,
      lon: it.longitude ?? undefined
    }))
  }, [eventsQuery.data?.items])

  const mapPoints: MapPoint[] = useMemo(
    () =>
      events
        .filter((e) => typeof e.lat === 'number' && typeof e.lon === 'number')
        .map((e) => ({
          id: e.id,
          title: e.title,
          lat: e.lat as number,
          lon: e.lon as number,
          participants: e.participants,
          category: e.categories?.[0],
          coverUrl: e.coverUrl,
          startAt: e.date,
          place: e.place,
          priceLabel: e.price === 0 ? 'Бесплатно' : `${e.price} ₽`
        })),
    [events]
  )

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Каталог событий</div>
          <div className="pageSub">
            {eventsQuery.isLoading
              ? 'Загрузка событий…'
              : eventsQuery.isError
                ? 'Не удалось загрузить события'
                : `Событий: ${eventsQuery.data?.total ?? events.length}`}
          </div>
        </div>
        <div className="segmented" role="group" aria-label="Режим каталога">
          <button
            type="button"
            className={view === 'list' ? 'segBtn active' : 'segBtn'}
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
          >
            Список
          </button>
          <button
            type="button"
            className={view === 'map' ? 'segBtn active' : 'segBtn'}
            aria-pressed={view === 'map'}
            onClick={() => setView('map')}
          >
            Карта
          </button>
        </div>
      </div>

      {view === 'list' ? (
        <div className="grid">
          {events.map((e) => (
            <Link key={e.id} to={`/events/${e.id}`} className="card cardAsLink">
              <article className="cardInner">
                <div
                  className="cardCover"
                  style={{ backgroundImage: e.coverUrl ? `url(${e.coverUrl})` : undefined }}
                >
                  <div className="cardCoverOverlay" />
                  <div className="cardTop">
                    <div className="cardTopBadges">
                      <div className="badge">{e.categories?.[0] ?? 'Событие'}</div>
                      <AgeRatingBadge ageRatingMin={e.ageRatingMin} />
                    </div>
                    <div className="rating">{e.rating ? `★ ${e.rating.toFixed(1)}` : ''}</div>
                  </div>
                </div>
                <div className="cardBody">
                  <div className="cardTitle">{e.title}</div>
                  <div className="muted">{new Date(e.date).toLocaleString('ru-RU')}</div>
                  <div className="muted">{e.place}</div>
                  <div className="cardBottom">
                    <div className="price">{e.price === 0 ? 'Бесплатно' : `${e.price} ₽`}</div>
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mapWrap">
          <YandexMap
            onPointClick={(point) => {
              const event = events.find((e) => e.id === point.id) ?? null
              setSelectedEvent(event)
            }}
            points={mapPoints}
          />
          {selectedEvent && (
            <article className="mapEventCard">
              <div
                className="mapEventCardMedia"
                style={{
                  backgroundImage: selectedEvent.coverUrl ? `url(${selectedEvent.coverUrl})` : undefined
                }}
              >
                <button
                  type="button"
                  className="mapEventCardClose"
                  onClick={() => setSelectedEvent(null)}
                  aria-label="Закрыть карточку"
                >
                  ×
                </button>
                <span className="mapEventCardBadge">{selectedEvent.categories?.[0] ?? 'Событие'}</span>
              </div>
              <div className="mapEventCardBody">
                <h3 className="mapEventCardTitle">{selectedEvent.title}</h3>
                <p className="mapEventCardMeta">
                  Участники: {selectedEvent.participants ?? '—'}
                </p>
                <div className="mapEventCardPrice">
                  {selectedEvent.price === 0 ? 'Бесплатно' : `${selectedEvent.price} ₽`}
                </div>
                <div className="mapEventCardActions">
                  <Link className="mapEventCardBtn" to={`/events/${selectedEvent.id}`}>
                    Открыть событие
                  </Link>
                  <button type="button" className="mapEventCardGhost" onClick={() => setSelectedEvent(null)}>
                    Закрыть
                  </button>
                </div>
              </div>
            </article>
          )}
        </div>
      )}
    </div>
  )
}
