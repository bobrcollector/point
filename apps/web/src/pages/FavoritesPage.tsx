import { Link } from 'react-router-dom'
import { AgeRatingBadge } from '../components/AgeRatingBadge'
import { readFavoriteIds } from '../lib/eventInteractionStorage'
import { useStoredEventCards } from '../features/catalog/queries'

export function FavoritesPage() {
  const ids = readFavoriteIds()
  const events = useStoredEventCards(ids)

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Избранное</div>
          <div className="pageSub">
            {ids.length ? `Событий: ${events.length}` : 'Добавляйте события в избранное на странице события'}
          </div>
        </div>
      </div>

      {ids.length === 0 ? (
        <p className="pageSub">Пока нет избранных событий.</p>
      ) : events.length === 0 ? (
        <p className="pageSub">Загрузка…</p>
      ) : (
        <div className="grid">
          {events.map((e) => (
            <Link
              key={e.id}
              to={`/events/${e.id}`}
              className="card cardAsLink"
              state={{ from: '/favorites', label: '← Избранное' }}
            >
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
                    {new Date(e.date).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}
                    {' · '}
                    {e.place}
                  </div>
                  <div className="cardPrice">{e.price === 0 ? 'Бесплатно' : `${e.price} ₽`}</div>
                </div>
              </article>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
