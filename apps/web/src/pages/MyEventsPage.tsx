import { useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { formatApiError } from '../lib/apiError'
import { EventListCard, type EventListCardData } from '../components/EventListCard'
import { IconPencil, IconPlusSquare, IconTrash } from '../components/NavGlyphs'
import { readCreatedEventIds, readParticipatingIds } from '../lib/eventInteractionStorage'
import { useStoredEventCards, type StoredEventCard } from '../features/catalog/queries'
import { useDeleteEvent, useFinishEvent, useMyOrganizerEvents, usePublishEvent } from '../features/organizer/queries'
import type { OrganizerEventListItem } from '../features/organizer/types'

export const MY_EVENTS_SUBNAV = [
  { to: '/my/organized', label: 'Организую' },
  { to: '/my/attending', label: 'Участвую' },
  { to: '/create', label: 'Создать' },
] as const

type MyEventsRouteKey = 'organized' | 'attending'
type MyEventsPeriod = 'active' | 'archive'

function statusLabel(status: string) {
  if (status === 'approved') return 'В ленте'
  if (status === 'pending') return 'На модерации'
  if (status === 'rejected') return 'Отклонено'
  if (status === 'cancelled') return 'Отменено'
  return 'Черновик'
}

function getRouteKey(pathname: string): MyEventsRouteKey {
  return pathname.includes('/my/attending') ? 'attending' : 'organized'
}

function isPast(date: string) {
  return new Date(date).getTime() < Date.now()
}

function splitStoredCards(cards: StoredEventCard[]) {
  const upcoming: StoredEventCard[] = []
  const past: StoredEventCard[] = []
  for (const card of cards) {
    if (isPast(card.date)) past.push(card)
    else upcoming.push(card)
  }
  upcoming.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  past.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return { upcoming, past }
}

function toEventListCard(card: StoredEventCard): EventListCardData {
  return {
    id: card.id,
    title: card.title,
    date: card.date,
    place: card.place,
    price: card.price,
    coverUrl: card.coverUrl,
    category: card.categories?.[0],
    ageRatingMin: card.ageRatingMin,
  }
}

function MyEventsTimeTabs({
  period,
  onPeriodChange,
}: {
  period: MyEventsPeriod
  onPeriodChange: (p: MyEventsPeriod) => void
}) {
  return (
    <nav className="myEventsSubnav" aria-label="Период событий">
      <button
        type="button"
        className={period === 'active' ? 'myEventsSubnavLink active' : 'myEventsSubnavLink'}
        aria-pressed={period === 'active'}
        onClick={() => onPeriodChange('active')}
      >
        Активные
      </button>
      <button
        type="button"
        className={period === 'archive' ? 'myEventsSubnavLink active' : 'myEventsSubnavLink'}
        aria-pressed={period === 'archive'}
        onClick={() => onPeriodChange('archive')}
      >
        Архив
      </button>
    </nav>
  )
}

function StoredCardsGrid({ cards }: { cards: StoredEventCard[] }) {
  if (!cards.length) return null
  return (
    <div className="myEventsGrid">
      {cards.map((card) => (
        <EventListCard key={card.id} event={toEventListCard(card)} />
      ))}
    </div>
  )
}

function stopCardNav(e: MouseEvent | KeyboardEvent) {
  e.stopPropagation()
}

function OrganizerCard({ event, onDeleted }: { event: OrganizerEventListItem; onDeleted: () => void }) {
  const navigate = useNavigate()
  const del = useDeleteEvent()
  const publish = usePublishEvent()
  const finish = useFinishEvent()
  const [publishError, setPublishError] = useState<string | null>(null)
  const [finishError, setFinishError] = useState<string | null>(null)
  const dt = new Date(event.event_datetime)
  const isPast = dt.getTime() < Date.now()
  const canFinish = (event.status === 'approved' || event.status === 'pending') && !isPast

  const openEvent = () => {
    if (event.status === 'draft') {
      navigate(`/events/${event.event_id}/edit`)
      return
    }
    navigate(`/events/${event.event_id}`, { state: { from: '/my/organized', label: '← Организую' } })
  }

  const onCardKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openEvent()
    }
  }

  const onPublish = (e: MouseEvent) => {
    stopCardNav(e)
    setPublishError(null)
    publish.mutate(event.event_id, {
      onSuccess: () => {
        onDeleted()
        navigate(`/events/${event.event_id}`, { state: { from: '/my/organized', label: '← Организую' } })
      },
      onError: (err) => setPublishError(formatApiError(err, 'Не удалось опубликовать')),
    })
  }

  const onFinish = (e: MouseEvent) => {
    stopCardNav(e)
    if (
      !window.confirm(
        'Завершить событие? Оно будет снято с публикации и перестанет отображаться в каталоге.'
      )
    ) {
      return
    }
    setFinishError(null)
    finish.mutate(event.event_id, {
      onSuccess: onDeleted,
      onError: (err) => setFinishError(formatApiError(err, 'Не удалось завершить событие')),
    })
  }

  const onDelete = (e: MouseEvent) => {
    stopCardNav(e)
    if (!window.confirm('Вы уверены, что хотите удалить событие? Это действие нельзя отменить.')) {
      return
    }
    del.mutate(event.event_id, { onSuccess: onDeleted })
  }

  return (
    <article
      className="card cardInner eventListCard organizerEventCard"
      role="button"
      tabIndex={0}
      onClick={openEvent}
      onKeyDown={onCardKeyDown}
      aria-label={`Открыть: ${event.title}`}
    >
      <div
        className="cardCover"
        style={{
          backgroundImage: event.cover_image_url ? `url(${event.cover_image_url})` : undefined,
          position: 'relative',
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
        <div className="organizerEventCardActions" onClick={stopCardNav} onKeyDown={stopCardNav}>
          {event.status === 'draft' ? (
            <button
              type="button"
              className="mapEventCardBtn"
              disabled={publish.isPending}
              onClick={onPublish}
            >
              {publish.isPending ? 'Публикация…' : 'Опубликовать'}
            </button>
          ) : null}
          {canFinish ? (
            <button
              type="button"
              className="mapEventCardBtn organizerEventCardFinishBtn"
              disabled={finish.isPending}
              onClick={onFinish}
            >
              {finish.isPending ? 'Завершение…' : 'Завершить'}
            </button>
          ) : null}
          {publishError ? <span className="pageSub organizerEventCardError">{publishError}</span> : null}
          {finishError ? <span className="pageSub organizerEventCardError">{finishError}</span> : null}
          <div className="organizerEventCardIconRow">
            <Link
              className="organizerEventCardIconBtn"
              to={`/events/${event.event_id}/edit`}
              title="Редактировать"
              aria-label="Редактировать"
              onClick={stopCardNav}
            >
              <IconPencil />
            </Link>
            <button
              type="button"
              className="organizerEventCardIconBtn organizerEventCardIconBtnDanger"
              disabled={del.isPending}
              title="Удалить"
              aria-label="Удалить"
              onClick={onDelete}
            >
              <IconTrash />
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

export function MyEventsPage() {
  const location = useLocation()
  const routeKey = getRouteKey(location.pathname)
  const organizerQuery = useMyOrganizerEvents()
  const [periods, setPeriods] = useState<Record<MyEventsRouteKey, MyEventsPeriod>>({
    organized: 'active',
    attending: 'active',
  })
  const period = periods[routeKey]
  const setPeriod = (next: MyEventsPeriod) => setPeriods((current) => ({ ...current, [routeKey]: next }))
  const createdCards = useStoredEventCards(readCreatedEventIds())
  const participatingCards = useStoredEventCards(readParticipatingIds())
  const createdSplit = splitStoredCards(createdCards)
  const participatingSplit = splitStoredCards(participatingCards)

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
      if (e.status === 'cancelled' || new Date(e.event_datetime).getTime() < now) pa.push(e)
      else up.push(e)
    }
    return { drafts: dr, upcoming: up, past: pa }
  }, [organizerQuery.data])

  const shownOrganizerEvents = period === 'active' ? upcoming : past
  const shownCreatedCards = period === 'active' ? createdSplit.upcoming : createdSplit.past
  const shownParticipatingCards = period === 'active' ? participatingSplit.upcoming : participatingSplit.past
  const pageTitle = routeKey === 'organized' ? 'Организую' : 'Участвую'

  return (
    <div className="page myEventsPage">
      <header className="myEventsHeader">
        <h1 className="myEventsTitle">{pageTitle}</h1>
      </header>

      <div className="myEventsToolbar myEventsToolbarCompact">
        <MyEventsTimeTabs period={period} onPeriodChange={setPeriod} />
        {routeKey === 'organized' ? (
          <Link className="myEventsCreateFab" to="/create" title="Создать событие" aria-label="Создать событие">
            <IconPlusSquare />
          </Link>
        ) : null}
      </div>

      {routeKey === 'organized' ? (
        <>
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

          {period === 'active' ? (
            <section className="myEventsSection">
              <h2 className="myEventsSectionTitle">Черновики</h2>
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
          ) : null}

          <section className="myEventsSection">
            <h2 className="myEventsSectionTitle">{period === 'active' ? 'Активные события' : 'Архив'}</h2>
            {organizerQuery.isLoading ? <p className="pageSub">Загрузка…</p> : null}
            {shownOrganizerEvents.length ? (
              <div className="myEventsGrid">
                {shownOrganizerEvents.map((e) => (
                  <OrganizerCard key={e.event_id} event={e} onDeleted={() => organizerQuery.refetch()} />
                ))}
              </div>
            ) : null}
            <StoredCardsGrid cards={shownCreatedCards} />
            {!organizerQuery.isLoading && !shownOrganizerEvents.length && !shownCreatedCards.length ? (
              <p className="myEventsEmpty">
                {period === 'active' ? (
                  <>
                    Нет предстоящих событий, которые вы организуете. <Link to="/create">Создать</Link>
                  </>
                ) : (
                  'В архиве пока нет прошедших организованных событий.'
                )}
              </p>
            ) : null}
          </section>
        </>
      ) : (
        <section className="myEventsSection">
          <h2 className="myEventsSectionTitle">{period === 'active' ? 'Активные события' : 'Архив'}</h2>
          {shownParticipatingCards.length ? (
            <StoredCardsGrid cards={shownParticipatingCards} />
          ) : (
            <p className="myEventsEmpty">
              {period === 'active'
                ? 'Нет предстоящих событий с отметкой «Пойду».'
                : 'В архиве пока нет посещённых событий.'}
            </p>
          )}
        </section>
      )}

      <Link className="eventDetailBack myEventsBackLink" to="/">
        ← Вернуться в ленту
      </Link>
    </div>
  )
}
