import { useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { formatApiError } from '../lib/apiError'
import { EventListCard, type EventListCardData } from '../components/EventListCard'
import { IconPencil, IconTrash } from '../components/NavGlyphs'
import {
  participatingItemToCard,
  useParticipatingEvents,
} from '../features/catalog/interactions'
import { useDeleteEvent, useFinishEvent, useMyOrganizerEvents, usePublishEvent } from '../features/organizer/queries'
import type { OrganizerEventListItem } from '../features/organizer/types'
import {
  ORGANIZER_FILTER_OPTIONS,
  filterOrganizerEvents,
  readStoredFilter,
  writeStoredFilter,
  type OrganizerEventsFilter,
} from '../lib/listFilter'

type MyEventsRouteKey = 'organized' | 'attending'
type MyEventsTimeScope = 'upcoming' | 'past'

const TIME_SCOPE_OPTIONS: { key: MyEventsTimeScope; label: string }[] = [
  { key: 'upcoming', label: 'Предстоящие' },
  { key: 'past', label: 'Прошедшие' },
]

function statusLabel(status: string, isHidden?: boolean) {
  if (status === 'approved' && isHidden) return 'Скрыто из ленты'
  if (status === 'approved') return 'В ленте'
  if (status === 'pending') return 'На модерации'
  if (status === 'rejected') return 'Отклонено'
  if (status === 'archived') return 'В архиве'
  if (status === 'cancelled') return 'Отменено'
  return 'Черновик'
}

function getRouteKey(pathname: string): MyEventsRouteKey {
  return pathname.includes('/my/attending') ? 'attending' : 'organized'
}

function normalizeTimeScope(raw?: string): MyEventsTimeScope {
  if (raw === 'past' || raw === 'archive') return 'past'
  return 'upcoming'
}

function isPast(date: string) {
  return new Date(date).getTime() < Date.now()
}

function splitCardsByTime(cards: EventListCardData[]) {
  const upcoming: EventListCardData[] = []
  const past: EventListCardData[] = []
  for (const card of cards) {
    if (isPast(card.date)) past.push(card)
    else upcoming.push(card)
  }
  upcoming.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  past.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return { upcoming, past }
}

const ORGANIZER_FILTER_STORAGE_KEY = 'point:organized-events-filter'

function MyEventsFilterSelect({
  value,
  onChange,
  id,
  label,
}: {
  value: OrganizerEventsFilter
  onChange: (next: OrganizerEventsFilter) => void
  id: string
  label: string
}) {
  return (
    <div className="listFilterBar">
      <label className="listFilterLabel" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="select listFilterSelect"
        value={value}
        onChange={(e) => onChange(e.target.value as OrganizerEventsFilter)}
      >
        {ORGANIZER_FILTER_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function MyEventsTimeSwitch({
  scope,
  onScopeChange,
  className,
}: {
  scope: MyEventsTimeScope
  onScopeChange: (scope: MyEventsTimeScope) => void
  className?: string
}) {
  return (
    <div className={['myEventsTimeSegWrap', className].filter(Boolean).join(' ')}>
      <nav className="segmented myEventsTimeSeg" aria-label="Период событий">
        {TIME_SCOPE_OPTIONS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={scope === item.key ? 'segBtn active' : 'segBtn'}
            aria-pressed={scope === item.key}
            onClick={() => onScopeChange(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

function EventCardsGrid({ cards }: { cards: EventListCardData[] }) {
  if (!cards.length) return null
  return (
    <div className="myEventsGrid">
      {cards.map((card) => (
        <EventListCard key={card.id} event={card} />
      ))}
    </div>
  )
}

function stopCardNav(e: MouseEvent | KeyboardEvent) {
  e.stopPropagation()
}

function OrganizerCard({
  event,
  timeScope,
  onDeleted,
}: {
  event: OrganizerEventListItem
  timeScope: MyEventsTimeScope
  onDeleted: () => void
}) {
  const navigate = useNavigate()
  const del = useDeleteEvent()
  const publish = usePublishEvent()
  const finish = useFinishEvent()
  const [publishError, setPublishError] = useState<string | null>(null)
  const [finishError, setFinishError] = useState<string | null>(null)
  const [renderedAt] = useState(() => Date.now())
  const dt = new Date(event.event_datetime)
  const isPastByDate = dt.getTime() < renderedAt
  const isArchived =
    timeScope === 'past' || event.status === 'archived' || event.status === 'cancelled' || isPastByDate
  const isRejected = event.status === 'rejected'
  const isHiddenFromFeed = event.status === 'approved' && Boolean(event.is_hidden)
  const canFinish = timeScope === 'upcoming' && event.status === 'approved' && !isArchived && !isHiddenFromFeed
  const rejectionReason = event.moderation_reason?.trim() || 'Причина не указана.'
  const hiddenReason = event.moderation_reason?.trim() || 'Событие удалено из каталога по жалобе.'

  const openEvent = () => {
    if (event.status === 'draft') {
      navigate(`/events/${event.event_id}/edit`)
      return
    }
    if (event.status === 'pending' || event.status === 'rejected' || isHiddenFromFeed) {
      navigate(`/events/${event.event_id}/edit`)
      return
    }
    navigate(`/events/${event.event_id}`, {
      state: {
        from: '/my/organized',
        label: isArchived ? '← Прошедшие' : '← Организую',
        backState: { timeScope: isArchived ? 'past' : timeScope },
        organizerPreview: event.status === 'archived' || event.status === 'cancelled',
        archivedView: isArchived,
        eventStatus: event.status,
      },
    })
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
        navigate('/my/organized', {
          state: {
            notice: 'Событие успешно отправлено на модерацию',
            timeScope: 'upcoming',
          },
        })
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
      onSuccess: () => {
        onDeleted()
        navigate('/my/organized', {
          state: {
            notice: 'Событие завершено и перемещено в архив',
            timeScope: 'past',
          },
        })
      },
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
      className={[
        'card',
        'cardInner',
        'eventListCard',
        'organizerEventCard',
        isRejected || isHiddenFromFeed ? 'organizerEventCardRejected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="button"
      tabIndex={0}
      onClick={openEvent}
      onKeyDown={onCardKeyDown}
      aria-label={
        isRejected
          ? `Отклонено: ${event.title}`
          : isHiddenFromFeed
            ? `Скрыто из ленты: ${event.title}`
            : `Открыть: ${event.title}`
      }
    >
      <div
        className="cardCover"
        style={{
          backgroundImage: event.cover_image_url ? `url(${event.cover_image_url})` : undefined,
          position: 'relative',
        }}
      >
        <div className={`cardCoverOverlay${isRejected ? ' cardCoverOverlayRejected' : ''}`} />
        <div className="cardTop">
          <div className="cardTopBadges">
            {!isRejected ? <div className="badge">{event.categories?.[0]?.name ?? 'Событие'}</div> : null}
            <div className={`badge${isRejected || isHiddenFromFeed ? ' organizerEventCardRejectedBadge' : ''}`}>
              {statusLabel(event.status, event.is_hidden)}
            </div>
          </div>
        </div>
      </div>
      <div className="cardBody">
        <div className="cardTitle">{event.title}</div>
        {isRejected ? (
          <div className="organizerEventCardRejectedBody">
            <p className="organizerEventCardRejectedTitle">Событие отклонено</p>
            <p className="organizerEventCardRejectedReason">{rejectionReason}</p>
          </div>
        ) : isHiddenFromFeed ? (
          <div className="organizerEventCardRejectedBody">
            <p className="organizerEventCardRejectedTitle">Удалено из ленты</p>
            <p className="organizerEventCardRejectedReason">{hiddenReason}</p>
          </div>
        ) : (
          <>
            <div className="cardMeta">
              {dt.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}
              {isPastByDate ? ' · прошло' : ' · предстоит'}
              <br />
              {event.location}
            </div>
            <div className="cardPrice">
              {event.price === 0 ? 'Бесплатно' : `от ${event.price} ₽`} · билетов: {event.ticket_types_count}
            </div>
          </>
        )}
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
  const navigate = useNavigate()
  if (location.pathname === '/my' || location.pathname === '/my/') {
    return <Navigate to="/my/attending" replace />
  }

  const routeKey = getRouteKey(location.pathname)
  const routeState = location.state as {
    notice?: string
    timeScope?: MyEventsTimeScope
    period?: string
  } | null
  const organizerQuery = useMyOrganizerEvents()
  const participatingQuery = useParticipatingEvents()
  const [now] = useState(() => Date.now())
  const [timeScopes, setTimeScopes] = useState<Record<MyEventsRouteKey, MyEventsTimeScope>>({
    organized: 'upcoming',
    attending: 'upcoming',
  })
  const [organizerFilter, setOrganizerFilter] = useState<OrganizerEventsFilter>(() =>
    readStoredFilter(
      ORGANIZER_FILTER_STORAGE_KEY,
      ORGANIZER_FILTER_OPTIONS.map((o) => o.value),
      'all',
    ),
  )
  const stateTimeScope =
    routeKey === 'organized'
      ? routeState?.timeScope ?? (routeState?.period ? normalizeTimeScope(routeState.period) : undefined)
      : undefined
  const timeScope = stateTimeScope ?? timeScopes[routeKey]
  const clearRouteState = () => {
    if (routeState && routeKey === 'organized') {
      const nextScope = routeState.timeScope ?? (routeState.period ? normalizeTimeScope(routeState.period) : timeScope)
      setTimeScopes((current) => ({ ...current, organized: nextScope }))
    }
    navigate(location.pathname, { replace: true })
  }
  const setTimeScope = (next: MyEventsTimeScope) => {
    if (routeState) navigate(location.pathname, { replace: true })
    setTimeScopes((current) => ({ ...current, [routeKey]: next }))
  }
  const participatingSplit = useMemo(() => {
    const cards = (participatingQuery.data ?? []).map(participatingItemToCard)
    return splitCardsByTime(cards)
  }, [participatingQuery.data])

  const { organizedUpcoming, organizedPast } = useMemo(() => {
    const items = organizerQuery.data ?? []
    const upcoming: OrganizerEventListItem[] = []
    const past: OrganizerEventListItem[] = []
    for (const e of items) {
      if (e.status === 'archived' || e.status === 'cancelled' || new Date(e.event_datetime).getTime() < now) {
        past.push(e)
        continue
      }
      upcoming.push(e)
    }
    return { organizedUpcoming: upcoming, organizedPast: past }
  }, [now, organizerQuery.data])

  const shownOrganizerEvents = useMemo(() => {
    const base = timeScope === 'past' ? organizedPast : organizedUpcoming
    return filterOrganizerEvents(base, organizerFilter, timeScope)
  }, [organizedPast, organizedUpcoming, organizerFilter, timeScope])
  const shownParticipatingCards =
    timeScope === 'past' ? participatingSplit.past : participatingSplit.upcoming

  const organizerEmpty =
    timeScope === 'past'
      ? 'Нет прошедших организованных мероприятий.'
      : 'Нет предстоящих мероприятий, которые вы организуете.'
  const attendingEmpty =
    timeScope === 'past'
      ? 'Нет прошедших мероприятий с отметкой «Пойду».'
      : 'Нет предстоящих мероприятий с отметкой «Пойду».'

  return (
    <div className="page myEventsPage">
      <header className="myEventsHeader">
        <h1 className="myEventsTitle">Мои мероприятия</h1>
      </header>

      <MyEventsTimeSwitch
        scope={timeScope}
        onScopeChange={setTimeScope}
        className="myEventsTimeSegWrapTop"
      />

      <div className="myEventsToolbar myEventsToolbarCompact">
        <MyEventsTimeSwitch
          scope={timeScope}
          onScopeChange={setTimeScope}
          className="myEventsTimeSegWrapToolbar"
        />
      </div>

      {routeState?.notice ? (
        <div className="myEventsNotice" role="status">
          <span>{routeState.notice}</span>
          <button
            type="button"
            onClick={clearRouteState}
            aria-label="Закрыть уведомление"
          >
            ×
          </button>
        </div>
      ) : null}

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

          <MyEventsFilterSelect
            id="organized-events-filter"
            label="Фильтр"
            value={organizerFilter}
            onChange={(next) => {
              setOrganizerFilter(next)
              writeStoredFilter(ORGANIZER_FILTER_STORAGE_KEY, next)
            }}
          />

          <section className="myEventsSection">
            {organizerQuery.isLoading ? <p className="pageSub">Загрузка…</p> : null}
            {shownOrganizerEvents.length ? (
              <div className="myEventsGrid">
                {shownOrganizerEvents.map((e) => (
                  <OrganizerCard
                    key={e.event_id}
                    event={e}
                    timeScope={timeScope}
                    onDeleted={() => organizerQuery.refetch()}
                  />
                ))}
              </div>
            ) : null}
            {!organizerQuery.isLoading && !shownOrganizerEvents.length ? (
              <p className="myEventsEmpty">{organizerEmpty}</p>
            ) : null}
          </section>
        </>
      ) : (
        <section className="myEventsSection">
          {participatingQuery.isError ? (
            <div className="eventDetailPanel" style={{ marginBottom: 16 }}>
              <p className="eventWizardError" role="alert">
                {formatApiError(participatingQuery.error, 'Не удалось загрузить ваши записи')}
              </p>
              <button type="button" className="eventDetailBtn" onClick={() => void participatingQuery.refetch()}>
                Повторить
              </button>
            </div>
          ) : null}
          {participatingQuery.isLoading ? <p className="pageSub">Загрузка…</p> : null}
          {shownParticipatingCards.length ? (
            <EventCardsGrid cards={shownParticipatingCards} />
          ) : (
            <p className="myEventsEmpty">{attendingEmpty}</p>
          )}
        </section>
      )}
    </div>
  )
}
