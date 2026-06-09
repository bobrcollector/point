import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { RequireAuth } from '../components/RequireAuth'
import { getEventDetailBack } from '../lib/eventDetailBack'
import {
  NOTIFICATION_FILTER_OPTIONS,
  filterNotifications,
  readStoredFilter,
  writeStoredFilter,
  type NotificationsFilter,
} from '../lib/listFilter'
import { useMarkAllNotificationsRead, useNotifications } from '../features/notifications/queries'
import { formatNotificationContent } from '../features/notifications/formatNotification'
import { NOTIFICATION_TYPE_LABEL } from '../features/notifications/types'

const NOTIFICATIONS_FILTER_STORAGE_KEY = 'point:notifications-filter'

function NotificationsContent() {
  const location = useLocation()
  const back = getEventDetailBack(location.state)
  const q = useNotifications()
  const markAllRead = useMarkAllNotificationsRead()
  const unreadCount = q.data?.filter((item) => !item.is_read).length ?? 0
  const [notifFilter, setNotifFilter] = useState<NotificationsFilter>(() =>
    readStoredFilter(
      NOTIFICATIONS_FILTER_STORAGE_KEY,
      NOTIFICATION_FILTER_OPTIONS.map((o) => o.value),
      'all',
    ),
  )
  const filteredNotifications = useMemo(
    () => filterNotifications(q.data ?? [], notifFilter),
    [q.data, notifFilter],
  )

  useEffect(() => {
    if (unreadCount > 0 && !markAllRead.isPending) {
      markAllRead.mutate()
    }
  }, [markAllRead, unreadCount])

  return (
    <div className="page myEventsPage notificationsPage">
      <Link className="eventDetailBack myEventsBackLink" to={back.to} state={back.state}>
        {back.label}
      </Link>

      <header className="myEventsHeader">
        <div>
          <h1 className="myEventsTitle">Уведомления</h1>
          <p className="eventDetailMuted">События, модерация и жалобы</p>
        </div>
      </header>

      {q.isPending ? <p className="pageSub">Загрузка…</p> : null}
      {q.isError ? <p className="authError">Не удалось загрузить уведомления</p> : null}

      <div className="listFilterBar">
        <label className="listFilterLabel" htmlFor="notifications-filter">
          Фильтр
        </label>
        <select
          id="notifications-filter"
          className="select listFilterSelect"
          value={notifFilter}
          onChange={(e) => {
            const next = e.target.value as NotificationsFilter
            setNotifFilter(next)
            writeStoredFilter(NOTIFICATIONS_FILTER_STORAGE_KEY, next)
          }}
        >
          {NOTIFICATION_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="notifList">
        {filteredNotifications.map((item) => (
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

      {filteredNotifications.length === 0 && !q.isPending ? <p className="emptyCard">Нет уведомлений</p> : null}
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
