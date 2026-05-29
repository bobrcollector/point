import { useEffect } from 'react'
import { RequireAuth } from '../components/RequireAuth'
import { useMarkAllNotificationsRead, useNotifications } from '../features/notifications/queries'
import { formatNotificationContent } from '../features/notifications/formatNotification'
import { NOTIFICATION_TYPE_LABEL } from '../features/notifications/types'

function NotificationsContent() {
  const q = useNotifications()
  const markAllRead = useMarkAllNotificationsRead()
  const unreadCount = q.data?.filter((item) => !item.is_read).length ?? 0

  useEffect(() => {
    if (unreadCount > 0 && !markAllRead.isPending) {
      markAllRead.mutate()
    }
  }, [markAllRead, unreadCount])

  return (
    <div className="page myEventsPage notificationsPage">
      <header className="myEventsHeader">
        <div>
          <h1 className="myEventsTitle">Уведомления</h1>
          <p className="eventDetailMuted">События, модерация и жалобы</p>
        </div>
      </header>

      {q.isPending ? <p className="pageSub">Загрузка…</p> : null}
      {q.isError ? <p className="authError">Не удалось загрузить уведомления</p> : null}

      <div className="notifList">
        {q.data?.map((item) => (
          <article
            key={item.notification_id}
            className={item.is_read ? 'notifRow' : 'notifRow notifRowUnread'}
          >
            <span className="notifRowType">{NOTIFICATION_TYPE_LABEL[item.type] ?? item.type}</span>
            <span className="notifRowBody">{formatNotificationContent(item.content, item.type)}</span>
            <span className="notifRowTime">{new Date(item.created_at).toLocaleString('ru-RU')}</span>
          </article>
        ))}
      </div>

      {q.data?.length === 0 && !q.isPending ? <p className="emptyCard">Нет уведомлений</p> : null}
    </div>
  )
}

export function NotificationsPage() {
  return (
    <RequireAuth>
      <NotificationsContent />
    </RequireAuth>
  )
}
