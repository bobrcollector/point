import { isAxiosError } from 'axios'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AgeRatingBadge } from '../components/AgeRatingBadge'
import { useEventDetail } from '../features/catalog/queries'
import {
  addReport,
  addReview,
  appendChat,
  isFavorite as readIsFavorite,
  isParticipating as readIsParticipating,
  readChat,
  readReviews,
  toggleFavorite,
  toggleParticipating
} from '../lib/eventInteractionStorage'

function buildMapsUrl(lat: number, lon: number) {
  return `https://yandex.ru/maps/?pt=${lon},${lat}&z=16&l=map`
}

function eventShareUrl(eventId: string) {
  return `${window.location.origin}/events/${eventId}`
}

export function EventDetailPage() {
  const { eventId } = useParams()
  const q = useEventDetail(eventId)
  const d = q.data

  const [fav, setFav] = useState(false)
  const [going, setGoing] = useState(false)
  const [chatTick, setChatTick] = useState(0)
  const [reviewTick, setReviewTick] = useState(0)

  const [chatDraft, setChatDraft] = useState('')
  const [reviewText, setReviewText] = useState('')
  const [reviewAuthor, setReviewAuthor] = useState('Гость')
  const [reviewRating, setReviewRating] = useState(5)

  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState('spam')
  const [reportDetails, setReportDetails] = useState('')
  const [reportDone, setReportDone] = useState(false)

  const [copyDone, setCopyDone] = useState(false)

  useEffect(() => {
    if (!eventId) return
    setFav(readIsFavorite(eventId))
    setGoing(readIsParticipating(eventId))
  }, [eventId])

  useEffect(() => {
    if (!eventId || !d) return
    const key = `point:eventChatPrimed:${eventId}`
    if (localStorage.getItem(key)) return
    appendChat(eventId, {
      author: d.organizer_name,
      role: 'organizer',
      text: 'Здравствуйте! По вопросам входа и расписания пишите здесь — отвечу в ближайшее время.'
    })
    localStorage.setItem(key, '1')
    setChatTick((x) => x + 1)
  }, [eventId, d])

  const notFound = isAxiosError(q.error) && q.error.response?.status === 404

  const isPast = useMemo(() => {
    if (!d) return false
    return Date.parse(d.event_datetime) < Date.now()
  }, [d])

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

  const chatMessages = eventId ? readChat(eventId) : []
  const reviews = eventId ? readReviews(eventId) : []

  if (!eventId) {
    return (
      <div className="page eventDetailPage">
        <p className="eventDetailMuted">Не указан идентификатор события.</p>
      </div>
    )
  }

  if (q.isPending || (q.isFetching && !d)) {
    return (
      <div className="page eventDetailPage">
        <p className="eventDetailMuted">Загружаем событие…</p>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="page eventDetailPage">
        <Link className="eventDetailBack" to="/">
          ← Назад
        </Link>
        <div className="eventDetailPanel">
          <h1 className="eventDetailTitle" style={{ color: 'var(--text)' }}>
            Событие не найдено
          </h1>
          <p className="eventDetailMuted">Проверьте ссылку или вернитесь в ленту.</p>
          <div style={{ marginTop: 12 }}>
            <Link className="homePrimaryBtn" to="/" style={{ display: 'inline-flex' }}>
              На главную
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (q.isError) {
    return (
      <div className="page eventDetailPage">
        <Link className="eventDetailBack" to="/">
          ← Назад
        </Link>
        <div className="eventDetailPanel">
          <h1 className="eventDetailTitle" style={{ color: 'var(--text)' }}>
            Не удалось загрузить событие
          </h1>
          <div style={{ marginTop: 12 }}>
            <Link className="homePrimaryBtn" to="/" style={{ display: 'inline-flex' }}>
              На главную
            </Link>
          </div>
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

  const gallery = (() => {
    const urls = [...(d.gallery_urls ?? [])]
    if (d.cover_image_url) urls.unshift(d.cover_image_url)
    const uniq = [...new Set(urls.filter(Boolean))]
    return uniq.slice(0, 6)
  })()

  const onCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopyDone(true)
      window.setTimeout(() => setCopyDone(false), 1600)
    } catch {
      window.prompt('Скопируйте ссылку', shareUrl)
    }
  }

  const onToggleFav = () => {
    if (!eventId) return
    setFav(toggleFavorite(eventId))
  }

  const onToggleGoing = () => {
    if (!eventId) return
    setGoing(toggleParticipating(eventId))
  }

  const onSendChat = () => {
    if (!eventId) return
    const text = chatDraft.trim()
    if (!text) return
    appendChat(eventId, { author: 'Вы', role: 'participant', text })
    setChatDraft('')
    setChatTick((x) => x + 1)
  }

  const onSubmitReview = (e: FormEvent) => {
    e.preventDefault()
    if (!eventId) return
    const text = reviewText.trim()
    if (!text) return
    addReview(eventId, { author: reviewAuthor.trim() || 'Гость', text, rating: reviewRating })
    setReviewText('')
    setReviewTick((x) => x + 1)
  }

  const onSubmitReport = (e: FormEvent) => {
    e.preventDefault()
    if (!eventId) return
    addReport({ eventId, reason: reportReason, details: reportDetails.trim() })
    setReportOpen(false)
    setReportDetails('')
    setReportDone(true)
    window.setTimeout(() => setReportDone(false), 2400)
  }

  return (
    <div className="page eventDetailPage">
      <Link className="eventDetailBack" to="/">
        ← Назад к ленте
      </Link>

      <div className="eventDetailHero">
        <div className="eventDetailHeroMain">
          {d.cover_image_url ? <div className="eventDetailHeroBg" style={{ backgroundImage: `url(${d.cover_image_url})` }} /> : null}
          <div className="eventDetailHeroOverlay" />
          <div className="eventDetailHeroContent">
            <div className="eventDetailHeroTop">
              <div style={{ minWidth: 0 }}>
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
          </div>
        </div>

        {gallery.length ? (
          <div className="eventDetailGallery" aria-label="Галерея">
            {gallery.map((src) => (
              <img key={src} src={src} alt="" loading="lazy" />
            ))}
          </div>
        ) : null}
      </div>

      <div className="eventDetailBody">
        <div className="eventDetailMainCol">
          <section className="eventDetailPanel" aria-labelledby="event-about">
            <h2 id="event-about" className="eventDetailPanelTitle">
              О событии
            </h2>
            <p className="eventDetailDesc">{d.description}</p>
          </section>

          <section className="eventDetailPanel" aria-labelledby="event-actions">
            <h2 id="event-actions" className="eventDetailPanelTitle">
              Действия
            </h2>
            <div className="eventDetailActions">
              <button type="button" className={going ? 'eventDetailBtn eventDetailBtnPrimary eventDetailBtnActive' : 'eventDetailBtn eventDetailBtnPrimary'} onClick={onToggleGoing}>
                {going ? 'Вы участвуете' : 'Пойду / Участвовать'}
              </button>
              <button type="button" className={fav ? 'eventDetailBtn eventDetailBtnActive' : 'eventDetailBtn'} onClick={onToggleFav}>
                {fav ? 'В избранном' : 'В избранное'}
              </button>
              <button type="button" className="eventDetailBtn eventDetailBtnDanger" onClick={() => setReportOpen(true)}>
                Пожаловаться
              </button>
            </div>
            {reportDone ? <p className="eventDetailMuted">Жалоба сохранена локально (демо).</p> : null}
          </section>

          <section className="eventDetailPanel" aria-labelledby="event-share">
            <h2 id="event-share" className="eventDetailPanelTitle">
              Поделиться
            </h2>
            <p className="eventDetailMuted" style={{ marginBottom: 10 }}>
              Ссылка на событие: <span style={{ color: 'var(--text)', fontWeight: 700 }}>{shareUrl}</span>
            </p>
            <div className="eventDetailShareRow">
              <button type="button" className="eventDetailBtn" onClick={onCopyLink}>
                {copyDone ? 'Скопировано' : 'Копировать ссылку'}
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

          {isPast ? (
            <section className="eventDetailPanel" aria-labelledby="event-reviews">
              <h2 id="event-reviews" className="eventDetailPanelTitle">
                Отзывы
              </h2>
              <p className="eventDetailMuted">Событие уже прошло — можно оставить отзыв.</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }} key={reviewTick}>
                {reviews.map((r) => (
                  <div key={r.id} className="eventDetailChatMsg">
                    <div className="eventDetailChatAuthor">
                      {r.author} · ★ {r.rating} · {new Date(r.at).toLocaleString('ru-RU')}
                    </div>
                    <p className="eventDetailChatText">{r.text}</p>
                  </div>
                ))}
                {!reviews.length ? <p className="eventDetailMuted">Пока нет отзывов — будьте первым.</p> : null}
              </div>

              <form onSubmit={onSubmitReview} style={{ marginTop: 14 }}>
                <div className="searchGroup" style={{ marginBottom: 10 }}>
                  <label className="label" htmlFor="review-author">
                    Имя
                  </label>
                  <input id="review-author" className="input" value={reviewAuthor} onChange={(e) => setReviewAuthor(e.target.value)} />
                </div>
                <div className="searchGroup" style={{ marginBottom: 10 }}>
                  <span className="label">Оценка</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" className={reviewRating === n ? 'pill active' : 'pill'} onClick={() => setReviewRating(n)}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="searchGroup" style={{ marginBottom: 10 }}>
                  <label className="label" htmlFor="review-text">
                    Текст отзыва
                  </label>
                  <textarea id="review-text" className="input" style={{ minHeight: 110, resize: 'vertical' }} value={reviewText} onChange={(e) => setReviewText(e.target.value)} />
                </div>
                <button type="submit" className="homePrimaryBtn" style={{ display: 'inline-flex' }}>
                  Отправить отзыв
                </button>
              </form>
            </section>
          ) : (
            <section className="eventDetailPanel" aria-labelledby="event-reviews-later">
              <h2 id="event-reviews-later" className="eventDetailPanelTitle">
                Отзывы
              </h2>
              <p className="eventDetailMuted">Отзывы можно оставить после завершения мероприятия.</p>
            </section>
          )}
        </div>

        <aside className="eventDetailSideCol">
          <section className="eventDetailPanel" aria-labelledby="event-where">
            <h2 id="event-where" className="eventDetailPanelTitle">
              Место и время
            </h2>
            <p className="eventDetailMuted" style={{ marginBottom: 8 }}>
              {new Date(d.event_datetime).toLocaleString('ru-RU', { dateStyle: 'full', timeStyle: 'short' })}
            </p>
            <p className="eventDetailDesc" style={{ fontSize: 13 }}>
              {d.address_detail}
            </p>
            {mapsUrl ? (
              <a className="eventDetailMapLink" href={mapsUrl} target="_blank" rel="noreferrer">
                Открыть на карте
              </a>
            ) : null}
          </section>

          <section className="eventDetailPanel" aria-labelledby="event-org">
            <h2 id="event-org" className="eventDetailPanelTitle">
              Организатор
            </h2>
            <p className="eventDetailDesc" style={{ fontSize: 15, fontWeight: 800 }}>
              {d.organizer_name}
            </p>
            <p className="eventDetailMuted">Участников (оценка API): {d.participants_count}</p>
          </section>

          <section className="eventDetailPanel" aria-labelledby="event-chat">
            <h2 id="event-chat" className="eventDetailPanelTitle">
              Чат участников
            </h2>
            <p className="eventDetailMuted">Сообщения хранятся локально в браузере (демо).</p>
            <div className="eventDetailChat" key={chatTick}>
              {chatMessages.map((m) => (
                <div key={m.id} className={m.role === 'organizer' ? 'eventDetailChatMsg eventDetailChatMsgOrg' : 'eventDetailChatMsg'}>
                  <div className="eventDetailChatAuthor">
                    {m.author} · {m.role === 'organizer' ? 'организатор' : 'участник'}
                  </div>
                  <p className="eventDetailChatText">{m.text}</p>
                </div>
              ))}
            </div>
            <div className="eventDetailChatForm">
              <textarea value={chatDraft} onChange={(e) => setChatDraft(e.target.value)} placeholder="Написать в чат…" />
              <button type="button" className="eventDetailBtn eventDetailBtnPrimary" onClick={onSendChat}>
                Отправить
              </button>
            </div>
          </section>

          <section className="eventDetailPanel">
            <p className="eventDetailMuted" style={{ margin: 0 }}>
              Цена: {d.price === 0 ? 'бесплатно' : `${d.price} ₽`}
            </p>
          </section>
        </aside>
      </div>

      {reportOpen ? (
        <div className="eventDetailModalBackdrop" role="presentation" onMouseDown={() => setReportOpen(false)}>
          <div className="eventDetailModal" role="dialog" aria-modal="true" aria-labelledby="report-title" onMouseDown={(e) => e.stopPropagation()}>
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
