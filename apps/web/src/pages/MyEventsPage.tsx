import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatApiError } from '../lib/apiError'
import { AgeRatingBadge } from '../components/AgeRatingBadge'
import { readParticipatingIds } from '../lib/eventInteractionStorage'
import { useStoredEventCards } from '../features/catalog/queries'
import { useDeleteEvent, useMyOrganizerEvents, usePublishEvent } from '../features/organizer/queries'
import type { OrganizerEventListItem } from '../features/organizer/types'

function statusLabel(status: string) {
  if (status === 'published') return 'Опубликовано'
  if (status === 'cancelled') return 'Отменено'
  return 'Черновик'
}

function OrganizerCard({ event, onDeleted }: { event: OrganizerEventListItem; onDeleted: () => void }) {
  const navigate = useNavigate()
  const del = useDeleteEvent()
  const publish = usePublishEvent()
  const [publishError, setPublishError] = useState<string | null>(null)
  const dt = new Date(event.event_datetime)
  const isPast = dt.getTime() < Date.now()

  const onPublish = () => {
    setPublishError(null)
    publish.mutate(event.event_id, {
      onSuccess: () => {
        onDeleted()
        navigate(`/events/${event.event_id}`, { state: { from: '/my', label: '← Мои события' } })
      },
      onError: (err) => setPublishError(formatApiError(err, 'Не удалось опубликовать'))
    })
  }

  return (
    <article className="card cardInner eventListCard">
      <div
        className="cardCover"
        style={{
          backgroundImage: event.cover_image_url ? `url(${event.cover_image_url})` : undefined,
          position: 'relative'
        }}
      >
        <div className="cardCoverOverlay" />
        <div className="cardTop">
          <div className="cardTopBadges">
            <div className="badge">{event.categories?.[0]?.name ?? 'Событие'}</div>
            <div className="badge">{statusLabel(event.status)}</div>
          </div>
        </div>
      </div>
      <div className="cardBody">
        <div className="cardTitle">{event.title}</div>
        <div className="cardMeta">
          {dt.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}
          {isPast ? ' · прошло' : ' · предстоит'}
          <br />
          {event.location}
        </div>
        <div className="cardPrice">
          {event.price === 0 ? 'Бесплатно' : `от ${event.price} ₽`} · билетов: {event.ticket_types_count}
        </div>
        <div className="eventListCardActions">
          {event.status === 'published' ? (
            <Link className="mapEventCardBtn" to={`/events/${event.event_id}`}>
              Открыть
            </Link>
          ) : event.status === 'draft' ? (
            <button
              type="button"
              className="mapEventCardBtn"
              disabled={publish.isPending}
              onClick={onPublish}
            >
              {publish.isPending ? 'Публикация…' : 'Опубликовать'}
            </button>
          ) : null}
          {publishError ? (
            <span className="pageSub" style={{ width: '100%' }}>
              {publishError}
            </span>
          ) : null}
          <Link className="eventDetailBtn" to={`/events/${event.event_id}/edit`}>
            Редактировать
          </Link>
          <button
            type="button"
            className="eventDetailBtn eventDetailBtnDanger"
            disabled={del.isPending}
            onClick={() => {
              if (window.confirm('Удалить событие?')) {
                del.mutate(event.event_id, { onSuccess: onDeleted })
              }
            }}
          >
            Удалить
          </button>
        </div>
      </div>
    </article>
  )
}

function ParticipatingSection({ ids }: { ids: string[] }) {
  const events = useStoredEventCards(ids)
  if (!ids.length) return <p className="pageSub">Пока пусто.</p>
  if (!events.length) return <p className="pageSub">Загрузка…</p>
  return (
    <div className="grid">
      {events.map((e) => (
        <Link key={e.id} to={`/events/${e.id}`} className="card cardAsLink" state={{ from: '/my', label: '← Мои события' }}>
          <article className="cardInner">
            <div
              className="cardCover"
              style={{ backgroundImage: e.coverUrl ? `url(${e.coverUrl})` : undefined, position: 'relative' }}
            >
              <div className="cardCoverOverlay" />
              <div className="cardTop">
                <div className="cardTopBadges">
                  <div className="badge">{e.categories?.[0] ?? 'Событие'}</div>
                  <AgeRatingBadge ageRatingMin={e.ageRatingMin} />
                </div>
              </div>
            </div>
            <div className="cardBody">
              <div className="cardTitle">{e.title}</div>
              <div className="cardMeta">
                {new Date(e.date).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })} · {e.place}
              </div>
              <div className="cardPrice">{e.price === 0 ? 'Бесплатно' : `${e.price} ₽`}</div>
            </div>
          </article>
        </Link>
      ))}
    </div>
  )
}

export function MyEventsPage() {
  const organizerQuery = useMyOrganizerEvents()
  const participating = readParticipatingIds()

  const { drafts, upcoming, past } = useMemo(() => {
    const items = organizerQuery.data ?? []
    const now = Date.now()
    const dr: OrganizerEventListItem[] = []
    const up: OrganizerEventListItem[] = []
    const pa: OrganizerEventListItem[] = []
    for (const e of items) {
      if (e.status === 'draft') {
        dr.push(e)
        continue
      }
      if (new Date(e.event_datetime).getTime() >= now) up.push(e)
      else pa.push(e)
    }
    return { drafts: dr, upcoming: up, past: pa }
  }, [organizerQuery.data])

  return (
    <div className="page myEventsPage">
      <div className="pageHeader myEventsHeader">
        <div>
          <div className="pageTitle">Мои события</div>
          <div className="pageSub">Организованные, предстоящие и прошедшие</div>
        </div>
        <Link to="/create" className="homePrimaryBtn" style={{ display: 'inline-flex' }}>
          + Создать
        </Link>
      </div>

      {organizerQuery.isError ? (
        <div className="eventDetailPanel" style={{ marginBottom: 16 }}>
          <p className="eventWizardError" role="alert">
            {formatApiError(organizerQuery.error, 'Не удалось загрузить ваши события')}
          </p>
          <button type="button" className="eventDetailBtn" onClick={() => void organizerQuery.refetch()}>
            Повторить
          </button>
        </div>
      ) : null}

      <section className="myEventsSection">
        <h2 className="pageTitle" style={{ fontSize: 18 }}>
          Черновики
        </h2>
        {organizerQuery.isLoading ? (
          <p className="pageSub">Загрузка…</p>
        ) : drafts.length === 0 ? (
          <p className="pageSub">Нет черновиков.</p>
        ) : (
          <div className="myEventsGrid">
            {drafts.map((e) => (
              <OrganizerCard key={e.event_id} event={e} onDeleted={() => organizerQuery.refetch()} />
            ))}
          </div>
        )}
      </section>

      <section className="myEventsSection">
        <h2 className="pageTitle" style={{ fontSize: 18 }}>
          Организую · предстоящие
        </h2>
        {organizerQuery.isLoading ? (
          <p className="pageSub">Загрузка…</p>
        ) : upcoming.length === 0 ? (
          <p className="myEventsEmpty">Нет предстоящих событий. <Link to="/create">Создать</Link></p>
        ) : (
          <div className="myEventsGrid">
            {upcoming.map((e) => (
              <OrganizerCard key={e.event_id} event={e} onDeleted={() => organizerQuery.refetch()} />
            ))}
          </div>
        )}
      </section>

      <section className="myEventsSection">
        <h2 className="pageTitle" style={{ fontSize: 18 }}>
          Организую · прошедшие
        </h2>
        {past.length === 0 ? (
          <p className="pageSub">Пока нет прошедших.</p>
        ) : (
          <div className="myEventsGrid">
            {past.map((e) => (
              <OrganizerCard key={e.event_id} event={e} onDeleted={() => organizerQuery.refetch()} />
            ))}
          </div>
        )}
      </section>

      <section className="myEventsSection">
        <h2 className="pageTitle" style={{ fontSize: 18 }}>
          Участвую
        </h2>
        <ParticipatingSection ids={participating} />
      </section>
    </div>
  )
}
