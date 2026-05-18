import { isAxiosError } from 'axios'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { AgeRatingBadge } from '../components/AgeRatingBadge'
import { EventDetailGallery } from '../components/EventDetailGallery'
import { OrganizerChatPanel } from '../components/OrganizerChatPanel'
import { useResolvedEventDetail } from '../features/catalog/queries'
import {
  addReport,
  addReview,
  isFavorite as readIsFavorite,
  isParticipating as readIsParticipating,
  readReviews,
  toggleFavorite,
  toggleParticipating,
  type StoredReview
} from '../lib/eventInteractionStorage'
import { getDemoUser, getEventDetailBack } from '../lib/eventInteractionStorage'

type ReviewSort = 'newest' | 'oldest' | 'rating_desc' | 'rating_asc'

function buildMapsUrl(lat: number, lon: number) {
  return `https://yandex.ru/maps/?pt=${lon},${lat}&z=16&l=map`
}

function eventShareUrl(eventId: string) {
  return `${window.location.origin}/events/${eventId}`
}

function sortReviews(list: StoredReview[], sort: ReviewSort): StoredReview[] {
  const copy = [...list]
  switch (sort) {
    case 'oldest':
      return copy.sort((a, b) => a.at - b.at)
    case 'rating_desc':
      return copy.sort((a, b) => b.rating - a.rating || b.at - a.at)
    case 'rating_asc':
      return copy.sort((a, b) => a.rating - b.rating || a.at - b.at)
    case 'newest':
    default:
      return copy.sort((a, b) => b.at - a.at)
  }
}

export function EventDetailPage() {
  const { eventId } = useParams()
  const location = useLocation()
  const back = getEventDetailBack(location.state)
  const q = useResolvedEventDetail(eventId)
  const d = q.data
  const user = getDemoUser()

  const [fav, setFav] = useState(false)
  const [going, setGoing] = useState(false)
  const [reviewTick, setReviewTick] = useState(0)
  const [reviewSort, setReviewSort] = useState<ReviewSort>('newest')
  const [chatOpen, setChatOpen] = useState(false)

  const [reviewText, setReviewText] = useState('')
  const reviewAuthor = user.displayName
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewFormOpen, setReviewFormOpen] = useState(false)

  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState('spam')
  const [reportDetails, setReportDetails] = useState('')
  const [reportDone, setReportDone] = useState(false)
  const [copyDone, setCopyDone] = useState(false)
  const copyResetTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!eventId) return
    setFav(readIsFavorite(eventId))
    setGoing(readIsParticipating(eventId))
    setReviewFormOpen(false)
  }, [eventId])

  useEffect(() => {
    return () => window.clearTimeout(copyResetTimerRef.current)
  }, [])

  const galleryImages = useMemo(() => {
    if (!d) return [] as string[]
    const cover = d.cover_image_url ?? null
    const fromGallery = (d.gallery_urls ?? []).filter(Boolean)
    const merged = cover ? [cover, ...fromGallery] : fromGallery
    return [...new Set(merged)]
  }, [d?.cover_image_url, d?.gallery_urls])

  const reviews = useMemo(
    () => (eventId ? readReviews(eventId) : []),
    [eventId, reviewTick]
  )

  const sortedReviews = useMemo(() => sortReviews(reviews, reviewSort), [reviews, reviewSort])

  const notFound = q.isLocal
    ? !q.isLoading && !d
    : isAxiosError(q.error) && q.error.response?.status === 404

  const canReview = going

  const shareUrl = useMemo(() => (eventId ? eventShareUrl(eventId) : ''), [eventId])

  const vkShare = useMemo(() => {
    if (!d || !shareUrl) return '#'
    const p = new URLSearchParams({ url: shareUrl, title: d.title })
    return `https://vk.com/share.php?${p.toString()}`
  }, [d, shareUrl])

  const tgShare = useMemo(() => {
    if (!d || !shareUrl) return '#'
    const p = new URLSearchParams({ url: shareUrl, text: d.title })
    return `https://t.me/share/url?${p.toString()}`
  }, [d, shareUrl])

  const waShare = useMemo(() => {
    if (!d || !shareUrl) return '#'
    const p = new URLSearchParams({ text: `${d.title}\n${shareUrl}` })
    return `https://wa.me/?${p.toString()}`
  }, [d, shareUrl])

  if (!eventId) {
    return (
      <div className="page eventDetailPage">
        <p className="eventDetailMuted">Не указан идентификатор события.</p>
      </div>
    )
  }

  if (q.isLoading) {
    return (
      <div className="page eventDetailPage">
        <p className="eventDetailMuted">Загружаем событие…</p>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="page eventDetailPage">
        <Link className="eventDetailBack" to={back.to}>
          {back.label}
        </Link>
        <div className="eventDetailPanel">
          <h1 className="eventDetailTitle" style={{ color: 'var(--text)' }}>
            Событие не найдено
          </h1>
          <p className="eventDetailMuted">Проверьте ссылку или вернитесь назад.</p>
          <Link className="homePrimaryBtn" to={back.to} style={{ display: 'inline-flex', marginTop: 12 }}>
            {back.label.replace(/^←\s*/, '')}
          </Link>
        </div>
      </div>
    )
  }

  if (!q.isLocal && q.isError) {
    return (
      <div className="page eventDetailPage">
        <Link className="eventDetailBack" to={back.to}>
          {back.label}
        </Link>
        <div className="eventDetailPanel">
          <h1 className="eventDetailTitle" style={{ color: 'var(--text)' }}>
            Не удалось загрузить событие
          </h1>
          <Link className="homePrimaryBtn" to={back.to} style={{ display: 'inline-flex', marginTop: 12 }}>
            {back.label.replace(/^←\s*/, '')}
          </Link>
        </div>
      </div>
    )
  }

  if (!d) {
    return (
      <div className="page eventDetailPage">
        <p className="eventDetailMuted">Загружаем событие…</p>
      </div>
    )
  }

  const mapsUrl =
    typeof d.latitude === 'number' && typeof d.longitude === 'number'
      ? buildMapsUrl(d.latitude, d.longitude)
      : null

  const onCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      window.clearTimeout(copyResetTimerRef.current)
      setCopyDone(true)
      copyResetTimerRef.current = window.setTimeout(() => setCopyDone(false), 2200)
    } catch {
      window.prompt('Скопируйте ссылку', shareUrl)
    }
  }

  const onToggleFav = () => {
    setFav(toggleFavorite(eventId))
  }

  const onToggleGoing = () => {
    setGoing(toggleParticipating(eventId))
  }

  const onSubmitReview = (e: FormEvent) => {
    e.preventDefault()
    const text = reviewText.trim()
    if (!text) return
    addReview(eventId, { author: reviewAuthor.trim() || user.displayName, text, rating: reviewRating })
    setReviewText('')
    setReviewFormOpen(false)
    setReviewTick((x) => x + 1)
  }

  const onSubmitReport = (e: FormEvent) => {
    e.preventDefault()
    addReport({ eventId, reason: reportReason, details: reportDetails.trim() })
    setReportOpen(false)
    setReportDetails('')
    setReportDone(true)
    window.setTimeout(() => setReportDone(false), 2400)
  }

  return (
    <div className="page eventDetailPage">
      <Link className="eventDetailBack" to={back.to}>
        {back.label}
      </Link>

      <div className="eventDetailHero">
        <div className="eventDetailHeroMain">
          {d.cover_image_url ? (
            <div className="eventDetailHeroBg" style={{ backgroundImage: `url(${d.cover_image_url})` }} />
          ) : null}
          <div className="eventDetailHeroOverlay" />
          <div className="eventDetailHeroContent">
            <div className="eventDetailHeroBadges" style={{ marginBottom: 8 }}>
              <div className="badge" style={{ display: 'inline-flex' }}>
                {d.categories?.[0]?.name ?? 'Событие'}
              </div>
              <AgeRatingBadge ageRatingMin={d.age_rating_min} />
            </div>
            <h1 className="eventDetailTitle">{d.title}</h1>
            <div className="eventDetailMeta">
              {new Date(d.event_datetime).toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' })}
              {' · '}
              {d.average_rating ? `★ ${d.average_rating.toFixed(1)}` : 'без оценок'}
            </div>
          </div>
        </div>
        <EventDetailGallery images={galleryImages} eventKey={eventId} />
      </div>

      <section className="eventDetailActionsBar" aria-label="Действия">
        <button
          type="button"
          className={going ? 'eventDetailBtn eventDetailBtnToggle eventDetailBtnToggleActive' : 'eventDetailBtn eventDetailBtnToggle'}
          onClick={onToggleGoing}
        >
          {going ? 'Вы идёте' : 'Пойду'}
        </button>
        <button
          type="button"
          className={fav ? 'eventDetailBtn eventDetailBtnToggle eventDetailBtnToggleActive' : 'eventDetailBtn eventDetailBtnToggle'}
          onClick={onToggleFav}
        >
          {fav ? 'В избранном' : 'В избранное'}
        </button>
        <button type="button" className="eventDetailBtn" onClick={() => setChatOpen(true)}>
          Написать организатору
        </button>
        <button type="button" className="eventDetailBtn eventDetailBtnDanger" onClick={() => setReportOpen(true)}>
          Пожаловаться
        </button>
        {reportDone ? <span className="eventDetailMuted eventDetailActionsHint">Жалоба отправлена</span> : null}
      </section>

      <div className="eventDetailBody eventDetailInfoGrid">
        <section className="eventDetailPanel eventDetailPanelHighlight eventDetailGridWhen" aria-labelledby="event-when">
          <h2 id="event-when" className="eventDetailPanelTitle">
            Место и время
          </h2>
          <p className="eventDetailDesc" style={{ fontWeight: 700 }}>
            {new Date(d.event_datetime).toLocaleString('ru-RU', { dateStyle: 'full', timeStyle: 'short' })}
          </p>
          <p className="eventDetailDesc">{d.address_detail || d.location}</p>
          {mapsUrl ? (
            <a className="eventDetailMapLink" href={mapsUrl} target="_blank" rel="noreferrer">
              Открыть на карте
            </a>
          ) : null}
        </section>

        <section className="eventDetailPanel eventDetailGridPrice" aria-labelledby="event-price">
          <h2 id="event-price" className="eventDetailPanelTitle">
            {d.requires_registration === false ? 'Участие' : 'Стоимость'}
          </h2>
          {d.requires_registration === false ? (
            <p className="eventDetailDesc" style={{ fontSize: 16, fontWeight: 700 }}>
              Запись не требуется — можно просто прийти
            </p>
          ) : (d.ticket_types?.length ?? 0) > 0 ? (
            <div className="eventDetailTickets">
              {d.ticket_types!.map((t) => (
                <div key={t.id} className="eventDetailTicketRow">
                  <span style={{ fontWeight: 700 }}>{t.name}</span>
                  <span>
                    {t.price === 0 ? 'Бесплатно' : `${t.price} ₽`}
                    {t.quantity > 0 ? ` · ${t.quantity} мест` : ''}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="eventDetailDesc" style={{ fontSize: 18, fontWeight: 800 }}>
              {d.price === 0 ? 'Бесплатно' : `от ${d.price} ₽`}
            </p>
          )}
        </section>

        <section className="eventDetailPanel eventDetailGridAbout" aria-labelledby="event-about">
          <h2 id="event-about" className="eventDetailPanelTitle">
            О событии
          </h2>
          <p className="eventDetailDesc">{d.description}</p>
        </section>

        <section className="eventDetailPanel eventDetailGridOrg" aria-labelledby="event-org">
          <h2 id="event-org" className="eventDetailPanelTitle">
            Организатор
          </h2>
          <p className="eventDetailDesc" style={{ fontSize: 16, fontWeight: 800 }}>
            {d.organizer_name}
          </p>
          <p className="eventDetailMuted">Участников: {d.participants_count}</p>
          <button type="button" className="eventDetailBtn" style={{ marginTop: 10 }} onClick={() => setChatOpen(true)}>
            Чат с организатором
          </button>
        </section>

        <section className="eventDetailPanel eventDetailGridShare" aria-labelledby="event-share">
          <h2 id="event-share" className="eventDetailPanelTitle">
            Поделиться
          </h2>
          <div className="eventDetailShareRow">
            <button
              type="button"
              className={copyDone ? 'eventDetailBtn eventDetailCopyBtn isCopied' : 'eventDetailBtn eventDetailCopyBtn'}
              onClick={onCopyLink}
            >
              {copyDone ? 'Скопировано' : 'Скопировать ссылку'}
            </button>
            <a className="eventDetailBtn" href={vkShare} target="_blank" rel="noreferrer">
              VK
            </a>
            <a className="eventDetailBtn" href={tgShare} target="_blank" rel="noreferrer">
              Telegram
            </a>
            <a className="eventDetailBtn" href={waShare} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
          </div>
        </section>

        <section className="eventDetailPanel eventDetailGridReviews" aria-labelledby="event-reviews">
          <div className="eventDetailReviewsHead">
            <h2 id="event-reviews" className="eventDetailPanelTitle">
              Отзывы
            </h2>
            {reviews.length > 0 ? (
              <label className="eventDetailReviewsSort">
                <span className="sr-only">Сортировка отзывов</span>
                <select
                  className="select eventDetailReviewsSelect"
                  value={reviewSort}
                  onChange={(e) => setReviewSort(e.target.value as ReviewSort)}
                  aria-label="Сортировка отзывов"
                >
                  <option value="newest">Сначала новые</option>
                  <option value="oldest">Сначала старые</option>
                  <option value="rating_desc">Высокая оценка</option>
                  <option value="rating_asc">Низкая оценка</option>
                </select>
              </label>
            ) : null}
          </div>

          {reviews.length > 0 ? (
            <div className="eventDetailReviewsList" key={`${reviewTick}-${reviewSort}`}>
                {sortedReviews.map((r) => (
                  <div key={r.id} className="eventDetailChatMsg">
                    <div className="eventDetailChatAuthor">
                      {r.author} · ★ {r.rating} · {new Date(r.at).toLocaleString('ru-RU')}
                    </div>
                    <p className="eventDetailChatText">{r.text}</p>
                  </div>
                ))}
            </div>
          ) : (
            <p className="eventDetailMuted">Пока нет отзывов.</p>
          )}

          {canReview ? (
            <>
              {!reviewFormOpen ? (
                <button
                  type="button"
                  className="homePrimaryBtn eventDetailReviewCta"
                  style={{ display: 'inline-flex', marginTop: 12 }}
                  onClick={() => setReviewFormOpen(true)}
                >
                  Оставить отзыв
                </button>
              ) : (
              <form onSubmit={onSubmitReview} className="eventDetailReviewForm">
                <div className="searchGroup" style={{ marginBottom: 10 }}>
                  <label className="label" htmlFor="review-text">
                    Ваш отзыв
                  </label>
                  <textarea
                    id="review-text"
                    className="input"
                    style={{ minHeight: 100, resize: 'vertical' }}
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" className={reviewRating === n ? 'pill active' : 'pill'} onClick={() => setReviewRating(n)}>
                      {n}
                    </button>
                  ))}
                </div>
                  <div className="eventDetailReviewFormActions">
                    <button type="button" className="eventDetailBtn" onClick={() => setReviewFormOpen(false)}>
                      Отмена
                    </button>
                    <button type="submit" className="homePrimaryBtn" style={{ display: 'inline-flex' }}>
                      Отправить отзыв
                    </button>
                  </div>
              </form>
              )}
            </>
          ) : (
            <p className="eventDetailMuted" style={{ marginTop: 10 }}>
              Отзывы можно оставить после посещения мероприятия — отметьте «Пойду» и приходите на событие.
            </p>
          )}
        </section>
      </div>

      <OrganizerChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        eventId={eventId}
        organizerName={d.organizer_name}
      />

      {reportOpen ? (
        <div className="eventDetailModalBackdrop" role="presentation" onMouseDown={() => setReportOpen(false)}>
          <div className="eventDetailModal" role="dialog" aria-modal aria-labelledby="report-title" onMouseDown={(e) => e.stopPropagation()}>
            <div className="eventDetailModalHead">
              <h2 id="report-title" className="eventDetailModalTitle">
                Пожаловаться на событие
              </h2>
              <button type="button" className="mobileSheetClose" onClick={() => setReportOpen(false)} aria-label="Закрыть">
                ×
              </button>
            </div>
            <form onSubmit={onSubmitReport}>
              <div className="searchGroup" style={{ marginBottom: 10 }}>
                <label className="label" htmlFor="report-reason">
                  Причина
                </label>
                <select id="report-reason" className="select" value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
                  <option value="spam">Спам / реклама</option>
                  <option value="misleading">Вводит в заблуждение</option>
                  <option value="unsafe">Небезопасно</option>
                  <option value="other">Другое</option>
                </select>
              </div>
              <div className="searchGroup" style={{ marginBottom: 12 }}>
                <label className="label" htmlFor="report-details">
                  Комментарий
                </label>
                <textarea id="report-details" className="input" style={{ minHeight: 110 }} value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="eventDetailBtn" onClick={() => setReportOpen(false)}>
                  Отмена
                </button>
                <button type="submit" className="eventDetailBtn eventDetailBtnPrimary">
                  Отправить
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}

