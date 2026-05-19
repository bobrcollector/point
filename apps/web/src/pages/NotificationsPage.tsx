import { RequireAuth } from '../components/RequireAuth'
import { useMarkNotificationRead, useNotifications } from '../features/notifications/queries'
import { formatNotificationContent } from '../features/notifications/formatNotification'
import { NOTIFICATION_TYPE_LABEL } from '../features/notifications/types'

function NotificationsContent() {
  const q = useNotifications()
  const markRead = useMarkNotificationRead()

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Уведомления</div>
          <div className="pageSub">События, модерация и жалобы</div>
        </div>
      </div>

      {q.isPending ? <p className="pageSub">Загрузка…</p> : null}
      {q.isError ? <p className="authError">Не удалось загрузить уведомления</p> : null}

      <div className="notifList">
        {q.data?.map((item) => (
          <button
            key={item.notification_id}
            type="button"
            className={item.is_read ? 'notifRow' : 'notifRow notifRowUnread'}
            onClick={() => {
              if (!item.is_read) markRead.mutate(item.notification_id)
            }}
          >
            <span className="notifRowType">{NOTIFICATION_TYPE_LABEL[item.type] ?? item.type}</span>
            <span className="notifRowBody">{formatNotificationContent(item.content, item.type)}</span>
            <span className="notifRowTime">{new Date(item.created_at).toLocaleString('ru-RU')}</span>
          </button>
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
