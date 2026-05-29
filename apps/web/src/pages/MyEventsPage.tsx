import { useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { formatApiError } from '../lib/apiError'
import { EventListCard, type EventListCardData } from '../components/EventListCard'
import { IconPencil, IconPlusSquare, IconTrash } from '../components/NavGlyphs'
import { useEventCards } from '../features/catalog/useEventCards'
import { useEventInteractions } from '../features/catalog/interactions'
import { useDeleteEvent, useFinishEvent, useMyOrganizerEvents, usePublishEvent } from '../features/organizer/queries'
import type { OrganizerEventListItem } from '../features/organizer/types'

type MyEventsRouteKey = 'organized' | 'attending'
type MyEventsPeriod = 'active' | 'drafts' | 'moderation' | 'archive'

const ORGANIZED_PERIODS: { key: MyEventsPeriod; label: string }[] = [
  { key: 'active', label: 'Активные' },
  { key: 'drafts', label: 'Черновики' },
  { key: 'moderation', label: 'На модерации' },
  { key: 'archive', label: 'Архив' },
]

const ATTENDING_PERIODS: { key: MyEventsPeriod; label: string }[] = [
  { key: 'active', label: 'Активные' },
  { key: 'archive', label: 'Архив' },
]

function statusLabel(status: string) {
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

function MyEventsTimeTabs({
  period,
  onPeriodChange,
  options,
}: {
  period: MyEventsPeriod
  onPeriodChange: (p: MyEventsPeriod) => void
  options: { key: MyEventsPeriod; label: string }[]
}) {
  return (
    <nav className="myEventsSubnav" aria-label="Период событий">
      {options.map((item) => (
        <button
          key={item.key}
          type="button"
          className={period === item.key ? 'myEventsSubnavLink active' : 'myEventsSubnavLink'}
          aria-pressed={period === item.key}
          onClick={() => onPeriodChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </nav>
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
  period,
  onDeleted,
}: {
  event: OrganizerEventListItem
  period: MyEventsPeriod
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
  const isPast = dt.getTime() < renderedAt
  const isArchived = period === 'archive' || event.status === 'archived' || event.status === 'cancelled' || isPast
  const canFinish = period === 'active' && event.status === 'approved' && !isArchived

  const openEvent = () => {
    if (event.status === 'draft') {
      navigate(`/events/${event.event_id}/edit`)
      return
    }
    if (event.status === 'pending' || event.status === 'rejected') {
      navigate(`/events/${event.event_id}/edit`)
      return
    }
    navigate(`/events/${event.event_id}`, {
      state: {
        from: '/my/organized',
        label: isArchived ? '← Архив' : '← Организую',
        backState: { period: isArchived ? 'archive' : period },
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
            period: 'moderation',
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
            period: 'archive',
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
  const navigate = useNavigate()
  const routeKey = getRouteKey(location.pathname)
  const routeState = location.state as { notice?: string; period?: MyEventsPeriod } | null
  const organizerQuery = useMyOrganizerEvents()
  const interactionsQuery = useEventInteractions()
  const [now] = useState(() => Date.now())
  const [periods, setPeriods] = useState<Record<MyEventsRouteKey, MyEventsPeriod>>({
    organized: 'active',
    attending: 'active',
  })
  const statePeriod = routeKey === 'organized' ? routeState?.period : undefined
  const period = statePeriod ?? periods[routeKey]
  const clearRouteState = () => {
    if (routeState?.period && routeKey === 'organized') {
      setPeriods((current) => ({ ...current, organized: routeState.period as MyEventsPeriod }))
    }
    navigate(location.pathname, { replace: true })
  }
  const setPeriod = (next: MyEventsPeriod) => {
    if (routeState) navigate(location.pathname, { replace: true })
    setPeriods((current) => ({ ...current, [routeKey]: next }))
  }
  const participatingIds = useMemo(
    () => (interactionsQuery.data?.participating_event_ids ?? []).map(String),
    [interactionsQuery.data?.participating_event_ids]
  )
  const participatingCardsQuery = useEventCards(participatingIds)
  const participatingSplit = splitCardsByTime(participatingCardsQuery.cards)

  const { drafts, moderation, upcoming, past } = useMemo(() => {
    const items = organizerQuery.data ?? []
    const dr: OrganizerEventListItem[] = []
    const mod: OrganizerEventListItem[] = []
    const up: OrganizerEventListItem[] = []
    const pa: OrganizerEventListItem[] = []
    for (const e of items) {
      if (e.status === 'draft') {
        dr.push(e)
        continue
      }
      if (e.status === 'pending' || e.status === 'rejected') {
        mod.push(e)
        continue
      }
      if (e.status === 'archived' || e.status === 'cancelled' || new Date(e.event_datetime).getTime() < now) pa.push(e)
      else up.push(e)
    }
    return { drafts: dr, moderation: mod, upcoming: up, past: pa }
  }, [now, organizerQuery.data])

  const shownOrganizerEvents =
    period === 'drafts' ? drafts : period === 'moderation' ? moderation : period === 'archive' ? past : upcoming
  const shownParticipatingCards = period === 'active' ? participatingSplit.upcoming : participatingSplit.past
  const pageTitle = routeKey === 'organized' ? 'Организую' : 'Участвую'
  const periodOptions = routeKey === 'organized' ? ORGANIZED_PERIODS : ATTENDING_PERIODS
  const organizerSectionTitle =
    period === 'drafts'
      ? 'Черновики'
      : period === 'moderation'
        ? 'События на модерации'
        : period === 'archive'
          ? 'Архив'
          : 'Активные события'
  const organizerEmpty =
    period === 'drafts'
      ? 'Нет черновиков.'
      : period === 'moderation'
        ? 'Нет событий на модерации.'
        : period === 'archive'
          ? 'В архиве пока нет завершённых организованных событий.'
          : 'Нет предстоящих событий, которые вы организуете.'

  return (
    <div className="page myEventsPage">
      <header className="myEventsHeader">
        <h1 className="myEventsTitle">{pageTitle}</h1>
      </header>

      <div className="myEventsToolbar myEventsToolbarCompact">
        <MyEventsTimeTabs period={period} onPeriodChange={setPeriod} options={periodOptions} />
        {routeKey === 'organized' ? (
          <Link className="myEventsCreateFab" to="/create" title="Создать событие" aria-label="Создать событие">
            <IconPlusSquare />
          </Link>
        ) : null}
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

          <section className="myEventsSection">
            <h2 className="myEventsSectionTitle">{organizerSectionTitle}</h2>
            {organizerQuery.isLoading ? <p className="pageSub">Загрузка…</p> : null}
            {shownOrganizerEvents.length ? (
              <div className="myEventsGrid">
                {shownOrganizerEvents.map((e) => (
                  <OrganizerCard key={e.event_id} event={e} period={period} onDeleted={() => organizerQuery.refetch()} />
                ))}
              </div>
            ) : null}
            {!organizerQuery.isLoading && !shownOrganizerEvents.length ? (
              <p className="myEventsEmpty">
                {period === 'active' ? (
                  <>
                    {organizerEmpty} <Link to="/create">Создать</Link>
                  </>
                ) : (
                  organizerEmpty
                )}
              </p>
            ) : null}
          </section>
        </>
      ) : (
        <section className="myEventsSection">
          <h2 className="myEventsSectionTitle">{period === 'active' ? 'Активные события' : 'Архив'}</h2>
          {interactionsQuery.isLoading || participatingCardsQuery.isLoading ? <p className="pageSub">Загрузка…</p> : null}
          {shownParticipatingCards.length ? (
            <EventCardsGrid cards={shownParticipatingCards} />
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
