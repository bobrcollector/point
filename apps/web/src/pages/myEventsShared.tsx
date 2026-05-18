import { useState } from 'react'
import { Link, Outlet, useLocation, useOutletContext } from 'react-router-dom'
import { EventListCard } from '../components/EventListCard'
import type { EventListCardData } from '../components/EventListCard'
import { IconPlusSquare } from '../components/NavGlyphs'
import { useEventCards } from '../features/catalog/useEventCards'
import { readCreatedEventIds, readParticipatingIds } from '../lib/eventInteractionStorage'
import { isEventPast } from '../lib/eventDatetime'

export const MY_EVENTS_SUBNAV = [
  { to: '/my/organized', label: 'Организую' },
  { to: '/my/attending', label: 'Участвую' },
  { to: '/create', label: 'Создать' },
] as const

export type MyEventsPeriod = 'active' | 'archive'
type MyEventsRouteKey = 'organized' | 'attending'
type MyEventsPeriods = Record<MyEventsRouteKey, MyEventsPeriod>

type MyEventsOutletContext = {
  periods: MyEventsPeriods
  setRoutePeriod: (route: MyEventsRouteKey, period: MyEventsPeriod) => void
}

const MY_EVENTS_PAGE_TITLES: Record<MyEventsRouteKey, string> = {
  organized: 'События, которые я организую',
  attending: 'События, в которых я участвую',
}

function getMyEventsRouteKey(pathname: string): MyEventsRouteKey {
  return pathname.includes('/my/attending') ? 'attending' : 'organized'
}

function useMyEventsRoutePeriod(route: MyEventsRouteKey) {
  const { periods, setRoutePeriod } = useOutletContext<MyEventsOutletContext>()
  return {
    period: periods[route],
    setPeriod: (period: MyEventsPeriod) => setRoutePeriod(route, period),
  }
}

function splitByTime(cards: EventListCardData[]) {
  const upcoming: EventListCardData[] = []
  const past: EventListCardData[] = []
  for (const card of cards) {
    if (isEventPast(card.date)) past.push(card)
    else upcoming.push(card)
  }
  upcoming.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  past.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return { upcoming, past }
}

function EventCardsGrid({ cards }: { cards: EventListCardData[] }) {
  if (!cards.length) return <p className="eventDetailMuted">Пока пусто.</p>
  return (
    <div className="myEventsGrid">
      {cards.map((e) => (
        <EventListCard key={e.id} event={e} />
      ))}
    </div>
  )
}

function FilteredEventsList({
  ids,
  period,
  emptyActive,
  emptyArchive,
}: {
  ids: string[]
  period: MyEventsPeriod
  emptyActive: string
  emptyArchive: string
}) {
  const { cards, isLoading } = useEventCards(ids)
  const { upcoming, past } = splitByTime(cards)
  const shown = period === 'active' ? upcoming : past
  const empty = period === 'active' ? emptyActive : emptyArchive

  if (isLoading) return <p className="eventDetailMuted">Загружаем…</p>

  return shown.length ? <EventCardsGrid cards={shown} /> : <p className="eventDetailMuted">{empty}</p>
}

export function MyEventsTimeTabs({
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
        title="Предстоящие события, которые ещё актуальны"
        onClick={() => onPeriodChange('active')}
      >
        Активные
      </button>
      <button
        type="button"
        className={period === 'archive' ? 'myEventsSubnavLink active' : 'myEventsSubnavLink'}
        aria-pressed={period === 'archive'}
        title="Прошедшие события из этого раздела"
        onClick={() => onPeriodChange('archive')}
      >
        Архив
      </button>
    </nav>
  )
}

export function MyEventsLayout() {
  const location = useLocation()
  const routeKey = getMyEventsRouteKey(location.pathname)
  const [periods, setPeriods] = useState<MyEventsPeriods>({
    organized: 'active',
    attending: 'active',
  })

  const setRoutePeriod = (route: MyEventsRouteKey, period: MyEventsPeriod) => {
    setPeriods((current) => ({ ...current, [route]: period }))
  }
  const outletContext: MyEventsOutletContext = { periods, setRoutePeriod }

  return (
    <div className="page myEventsPage">
      <header className="myEventsHeader">
        <h1 className="myEventsTitle">{MY_EVENTS_PAGE_TITLES[routeKey]}</h1>
      </header>

      <Outlet context={outletContext} />

      <Link className="eventDetailBack myEventsBackLink" to="/">
        ← Вернуться в ленту
      </Link>
    </div>
  )
}

export function MyOrganizedEventsRoute() {
  const { period, setPeriod } = useMyEventsRoutePeriod('organized')

  return (
    <>
      <div className="myEventsToolbar">
        <MyEventsTimeTabs period={period} onPeriodChange={setPeriod} />
        <Link className="myEventsCreateFab" to="/create" title="Создать событие" aria-label="Создать событие">
          <IconPlusSquare />
        </Link>
      </div>
      <FilteredEventsList
        ids={readCreatedEventIds()}
        period={period}
        emptyActive="Нет предстоящих событий, которые вы организуете."
        emptyArchive="В архиве пока нет прошедших организованных событий."
      />
    </>
  )
}

export function MyAttendingEventsRoute() {
  const { period, setPeriod } = useMyEventsRoutePeriod('attending')

  return (
    <>
      <div className="myEventsToolbar myEventsToolbarCompact">
        <MyEventsTimeTabs period={period} onPeriodChange={setPeriod} />
      </div>
      <FilteredEventsList
        ids={readParticipatingIds()}
        period={period}
        emptyActive="Нет предстоящих событий с отметкой «Пойду»."
        emptyArchive="В архиве пока нет посещённых событий."
      />
    </>
  )
}
