import { Link, useLocation } from 'react-router-dom'
import { AgeRatingBadge } from './AgeRatingBadge'

export type EventListCardData = {
  id: string
  title: string
  date: string
  place: string
  price: number
  coverUrl?: string | null
  category?: string
  ageRatingMin?: number
}

type Props = {
  event: EventListCardData
}

export function EventListCard({ event }: Props) {
  const location = useLocation()
  return (
    <Link to={`/events/${event.id}`} state={{ from: location.pathname }} className="eventListCard">
      <div
        className="eventListCardCover"
        style={event.coverUrl ? { backgroundImage: `url(${event.coverUrl})` } : undefined}
      />
      <div className="eventListCardBody">
        <div className="eventListCardTop">
          <span className="eventListCardBadge">{event.category ?? 'Событие'}</span>
          <AgeRatingBadge ageRatingMin={event.ageRatingMin} />
        </div>
        <h3 className="eventListCardTitle">{event.title}</h3>
        <p className="eventListCardMeta">
          {new Date(event.date).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
        <p className="eventListCardMeta">{event.place}</p>
        <p className="eventListCardPrice">{event.price === 0 ? 'Бесплатно' : `${event.price} ₽`}</p>
      </div>
    </Link>
  )
}
