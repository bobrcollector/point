import { useState } from 'react'
import { AgeRatingBadge } from '../../components/AgeRatingBadge'
import type { ApiEventDetail } from '../catalog/types'
import { complaintStatusLabel, formatComplaintDescription, parseComplaintReason } from './formatComplaint'
import type { AdminComplaint } from './queries'
import { useAdminEventDetail } from './queries'

type Mutations = {
  resolveComplaint: {
    mutate: (
      args: {
        complaintId: number
        decision: 'resolved' | 'rejected'
        hide_event?: boolean
        block_organizer?: boolean
      },
      opts?: { onSuccess?: () => void },
    ) => void
    isPending: boolean
  }
}

function formatDt(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function AdminEventPreview({ event }: { event: ApiEventDetail }) {
  const extraGallery = (event.gallery_urls ?? []).filter(
    (url) => url && url !== event.cover_image_url,
  )

  return (
    <div className="adminComplaintEventPreview">
      {event.cover_image_url ? (
        <img
          src={event.cover_image_url}
          alt={`Обложка: ${event.title}`}
          className="adminComplaintEventCover"
          loading="lazy"
        />
      ) : null}

      <div className="adminComplaintEventHead">
        <div className="adminComplaintEventBadges">
          <span className="badge">{event.categories?.[0]?.name ?? 'Событие'}</span>
          <AgeRatingBadge ageRatingMin={event.age_rating_min} />
          {event.is_for_children ? <span className="badge">Для детей</span> : null}
        </div>
        <h3 className="adminComplaintEventTitle">{event.title}</h3>
        <p className="adminComplaintEventMeta">
          {new Date(event.event_datetime).toLocaleString('ru-RU', {
            dateStyle: 'long',
            timeStyle: 'short',
          })}
          {' · '}
          {event.location}
        </p>
        {event.address_detail ? <p className="adminComplaintEventMeta">{event.address_detail}</p> : null}
      </div>

      <dl className="adminComplaintInfoGrid">
        <div>
          <dt>Организатор</dt>
          <dd>{event.organizer_name}</dd>
        </div>
        <div>
          <dt>Участников</dt>
          <dd>{event.participants_count}</dd>
        </div>
        <div>
          <dt>Стоимость</dt>
          <dd>{event.price === 0 ? 'Бесплатно' : `от ${event.price} ₽`}</dd>
        </div>
        <div>
          <dt>Запись</dt>
          <dd>{event.requires_registration ? 'Требуется' : 'Не требуется'}</dd>
        </div>
      </dl>

      <div className="adminComplaintEventBlock">
        <h4 className="adminComplaintEventBlockTitle">Описание</h4>
        <p className="adminComplaintEventDesc">{event.description}</p>
      </div>

      {event.ticket_types && event.ticket_types.length > 0 ? (
        <div className="adminComplaintEventBlock">
          <h4 className="adminComplaintEventBlockTitle">Билеты</h4>
          <ul className="adminComplaintTicketList">
            {event.ticket_types.map((ticket) => (
              <li key={ticket.id}>
                <span>{ticket.name}</span>
                <span>
                  {ticket.price === 0 ? 'Бесплатно' : `${ticket.price} ₽`}
                  {ticket.quantity > 0 ? ` · ${ticket.quantity} мест` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {extraGallery.length > 0 ? (
        <div className="adminComplaintEventBlock">
          <h4 className="adminComplaintEventBlockTitle">Галерея</h4>
          <div className="adminComplaintGallery">
            {extraGallery.map((src) => (
              <img key={src} src={src} alt="" className="adminComplaintGalleryImg" loading="lazy" />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

type Props = {
  complaint: AdminComplaint
  mut: Mutations
  onClose: () => void
}

export function ComplaintReviewDialog({ complaint, mut, onClose }: Props) {
  const [blockUser, setBlockUser] = useState(false)
  const eventQ = useAdminEventDetail(complaint.event_id, true)
  const parsed = parseComplaintReason(complaint.reason)

  const closeDialog = () => {
    setBlockUser(false)
    onClose()
  }

  const onReject = () => {
    mut.resolveComplaint.mutate(
      { complaintId: complaint.complaint_id, decision: 'rejected' },
      { onSuccess: closeDialog },
    )
  }

  const onConfirm = () => {
    mut.resolveComplaint.mutate(
      {
        complaintId: complaint.complaint_id,
        decision: 'resolved',
        hide_event: true,
        block_organizer: blockUser,
      },
      { onSuccess: closeDialog },
    )
  }

  return (
    <div className="eventDetailModalBackdrop" role="presentation" onMouseDown={closeDialog}>
      <div
        className="eventDetailModal adminComplaintModal"
        role="dialog"
        aria-modal
        aria-labelledby="complaint-review-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <section className="adminComplaintModalSection adminComplaintModalSectionInfo">
          <div className="adminComplaintModalHead">
            <h2 id="complaint-review-title" className="adminComplaintModalTitle">
              Разбор жалобы #{complaint.complaint_id}
            </h2>
            <button type="button" className="mobileSheetClose" onClick={closeDialog} aria-label="Закрыть">
              ×
            </button>
          </div>

          <dl className="adminComplaintInfoGrid">
            <div>
              <dt>Тип жалобы</dt>
              <dd>{parsed.title}</dd>
            </div>
            <div>
              <dt>Статус</dt>
              <dd>{complaintStatusLabel(complaint.status)}</dd>
            </div>
            <div>
              <dt>Автор жалобы</dt>
              <dd>{complaint.user_name}</dd>
            </div>
            <div>
              <dt>Мероприятие</dt>
              <dd>{complaint.event_title}</dd>
            </div>
            <div>
              <dt>Дата подачи</dt>
              <dd>{formatDt(complaint.created_at)}</dd>
            </div>
          </dl>

          <div className="adminComplaintReasonBox">
            <span className="label">Описание жалобы</span>
            <p>{formatComplaintDescription(complaint.reason)}</p>
          </div>
        </section>

        <section className="adminComplaintModalSection adminComplaintModalSectionEvent" aria-labelledby="complaint-event-title">
          <h3 id="complaint-event-title" className="adminComplaintSectionTitle">
            Мероприятие
          </h3>
          {eventQ.isPending ? <p className="pageSub">Загрузка данных о мероприятии…</p> : null}
          {eventQ.isError ? (
            <p className="authError">Не удалось загрузить информацию о мероприятии</p>
          ) : null}
          {eventQ.data ? <AdminEventPreview event={eventQ.data} /> : null}
        </section>

        <section className="adminComplaintModalSection adminComplaintModalSectionActions" aria-label="Решение по жалобе">
          <label className="adminComplaintBlockCheck">
            <input type="checkbox" checked={blockUser} onChange={(e) => setBlockUser(e.target.checked)} />
            <span>
              <strong>Заблокировать автора события</strong>
              <span className="adminComplaintBlockCheckHint">
                Организатор не сможет входить в аккаунт после подтверждения жалобы
              </span>
            </span>
          </label>

          <div className="adminComplaintActions">
            <button
              type="button"
              className="homeGhostBtn"
              disabled={mut.resolveComplaint.isPending}
              onClick={onReject}
            >
              Отклонить
            </button>
            <button
              type="button"
              className="homePrimaryBtn"
              disabled={mut.resolveComplaint.isPending}
              onClick={onConfirm}
            >
              {mut.resolveComplaint.isPending ? 'Сохранение…' : 'Подтвердить'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
