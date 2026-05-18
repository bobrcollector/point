import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useOrganizerChat } from '../features/chat/useOrganizerChat'
import { getDemoUser } from '../lib/userSession'

type Props = {
  open: boolean
  onClose: () => void
  eventId: string
  organizerName: string
}

export function OrganizerChatPanel({ open, onClose, eventId, organizerName }: Props) {
  const [draft, setDraft] = useState('')
  const messagesRef = useRef<HTMLDivElement>(null)
  const user = getDemoUser()

  const { messages, status, send } = useOrganizerChat({
    eventId,
    organizerName,
    displayName: user.displayName,
    enabled: open,
  })

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  useEffect(() => {
    const el = messagesRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, open])

  if (!open) return null

  const onSend = (e: FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    if (send(text)) setDraft('')
  }

  const statusLabel =
    status === 'connecting'
      ? 'Подключение…'
      : status === 'connected'
        ? 'Онлайн'
        : status === 'error'
          ? 'Нет связи с сервером'
          : null

  return (
    <div className="eventDetailModalBackdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="organizerChatPanel"
        role="dialog"
        aria-modal
        aria-labelledby="organizer-chat-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="eventDetailModalHead">
          <div>
            <h2 id="organizer-chat-title" className="eventDetailModalTitle">
              Чат с организатором
            </h2>
            <p className="eventDetailMuted" style={{ margin: '4px 0 0' }}>
              {organizerName}
              {statusLabel ? (
                <>
                  {' · '}
                  <span
                    className={
                      status === 'connected' ? 'organizerChatStatus organizerChatStatusOk' : 'organizerChatStatus'
                    }
                  >
                    {statusLabel}
                  </span>
                </>
              ) : null}
            </p>
          </div>
          <button type="button" className="mobileSheetClose" onClick={onClose} aria-label="Закрыть чат">
            ×
          </button>
        </div>

        <div ref={messagesRef} className="eventDetailChat organizerChatMessages">
          {messages.length === 0 && status === 'connecting' ? (
            <p className="eventDetailMuted">Загружаем сообщения…</p>
          ) : null}
          {messages.map((m) => (
            <div
              key={m.id}
              className={
                m.role === 'organizer'
                  ? 'eventDetailChatMsg eventDetailChatMsgOrg'
                  : 'eventDetailChatMsg eventDetailChatMsgSelf'
              }
            >
              <div className="eventDetailChatAuthor">
                {m.author} · {m.role === 'organizer' ? 'организатор' : 'вы'}
              </div>
              <p className="eventDetailChatText">{m.text}</p>
            </div>
          ))}
        </div>

        <form className="eventDetailChatForm" onSubmit={onSend}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Сообщение организатору…"
            aria-label="Сообщение организатору"
            disabled={status !== 'connected'}
          />
          <button
            type="submit"
            className="eventDetailBtn eventDetailBtnPrimary"
            disabled={status !== 'connected' || !draft.trim()}
          >
            Отправить
          </button>
        </form>
      </div>
    </div>
  )
}
