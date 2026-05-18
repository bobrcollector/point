import { useEffect, useState, type FormEvent } from 'react'
import { appendChat, readChat, type StoredChatMessage } from '../lib/eventInteractionStorage'
import { getDemoUser } from '../lib/eventInteractionStorage'

type Props = {
  open: boolean
  onClose: () => void
  eventId: string
  organizerName: string
}

export function OrganizerChatPanel({ open, onClose, eventId, organizerName }: Props) {
  const user = getDemoUser()
  const [messages, setMessages] = useState<StoredChatMessage[]>([])
  const [text, setText] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (!open) return
    setMessages(readChat(eventId))
    setSent(false)
  }, [open, eventId])

  if (!open) return null

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    appendChat(eventId, { author: user.displayName, text: body, role: 'participant' })
    setMessages(readChat(eventId))
    setText('')
    setSent(true)
    window.setTimeout(() => setSent(false), 2000)
  }

  return (
    <div className="eventDetailModalBackdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="organizerChatPanel eventDetailModal"
        role="dialog"
        aria-modal
        aria-labelledby="organizer-chat-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="eventDetailModalHead">
          <h2 id="organizer-chat-title" className="eventDetailModalTitle">
            Чат с организатором
          </h2>
          <button type="button" className="mobileSheetClose" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <p className="eventDetailMuted" style={{ marginBottom: 10 }}>
          {organizerName}
        </p>
        <div className="eventDetailChat organizerChatMessages">
          {messages.length === 0 ? (
            <p className="eventDetailMuted">Напишите организатору — ответ появится в чате.</p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={
                  m.role === 'organizer'
                    ? 'eventDetailChatMsg eventDetailChatMsgOrg'
                    : m.author === user.displayName
                      ? 'eventDetailChatMsg eventDetailChatMsgSelf'
                      : 'eventDetailChatMsg'
                }
              >
                <div className="eventDetailChatAuthor">
                  {m.author} · {new Date(m.at).toLocaleString('ru-RU')}
                </div>
                <p className="eventDetailChatText">{m.text}</p>
              </div>
            ))
          )}
        </div>
        <form onSubmit={onSubmit} className="eventDetailChatForm">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ваше сообщение…"
            aria-label="Сообщение организатору"
          />
          <button type="submit" className="eventDetailBtn eventDetailBtnPrimary">
            Отправить
          </button>
        </form>
        {sent ? (
          <p className="eventDetailMuted organizerChatStatus organizerChatStatusOk" style={{ marginTop: 8 }}>
            Сообщение отправлено
          </p>
        ) : null}
      </div>
    </div>
  )
}
