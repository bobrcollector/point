import { Link } from 'react-router-dom'
import { EventListCard } from '../components/EventListCard'
import { useEventCards } from '../features/catalog/useEventCards'
import { useEventInteractions } from '../features/catalog/interactions'
import { useAuthStore } from '../stores/authStore'

export function FavoritesPage() {
  const isLoggedIn = Boolean(useAuthStore((s) => s.token))
  const interactionsQuery = useEventInteractions()
  const ids = (interactionsQuery.data?.favorite_event_ids ?? []).map(String)
  const { cards, isLoading } = useEventCards(ids)

  return (
    <div className="page myEventsPage">
      <header className="myEventsHeader">
        <h1 className="myEventsTitle">Избранное</h1>
        {!isLoggedIn ? <p className="eventDetailMuted">Войдите, чтобы сохранять избранное</p> : null}
      </header>

      {isLoading || interactionsQuery.isLoading ? (
        <p className="eventDetailMuted">Загружаем…</p>
      ) : interactionsQuery.isError ? (
        <p className="authError">Не удалось загрузить избранное</p>
      ) : cards.length ? (
        <div className="myEventsGrid">
          {cards.map((e) => (
            <EventListCard key={e.id} event={e} />
          ))}
        </div>
      ) : (
        <div className="myEventsEmpty">
          <p className="eventDetailMuted">В избранном пока ничего нет.</p>
          <Link className="homePrimaryBtn" to="/" style={{ display: 'inline-flex', marginTop: 12 }}>
            Смотреть ленту
          </Link>
        </div>
      )}

      <Link className="eventDetailBack myEventsBackLink" to="/">
        ← Вернуться в ленту
      </Link>
    </div>
  )
}
