import type { NotificationItem } from '../features/notifications/types'
import type { OrganizerEventListItem } from '../features/organizer/types'

export type OrganizerEventsFilter =
  | 'all'
  | 'draft'
  | 'pending'
  | 'rejected'
  | 'approved'
  | 'hidden'
  | 'archived'
  | 'cancelled'

export type NotificationsFilter =
  | 'all'
  | 'unread'
  | 'read'
  | 'moderation'
  | 'complaint'
  | 'reminder'
  | 'chat'

export const ORGANIZER_FILTER_OPTIONS: { value: OrganizerEventsFilter; label: string }[] = [
  { value: 'all', label: 'Все статусы' },
  { value: 'draft', label: 'Черновики' },
  { value: 'pending', label: 'На модерации' },
  { value: 'rejected', label: 'Отклонено' },
  { value: 'approved', label: 'В ленте' },
  { value: 'hidden', label: 'Скрыто из ленты' },
  { value: 'archived', label: 'В архиве' },
  { value: 'cancelled', label: 'Отменено' },
]

export const NOTIFICATION_FILTER_OPTIONS: { value: NotificationsFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'unread', label: 'Непрочитанные' },
  { value: 'read', label: 'Прочитанные' },
  { value: 'moderation', label: 'Модерация' },
  { value: 'complaint', label: 'Жалобы' },
  { value: 'reminder', label: 'Напоминания' },
  { value: 'chat', label: 'Чат' },
]

const MODERATION_NOTIFICATION_TYPES = new Set(['event_status', 'moderation_status'])
const COMPLAINT_NOTIFICATION_TYPES = new Set([
  'complaint_created',
  'complaint_resolved',
  'complaint_rejected',
  'complaint_pending',
])

function matchesOrganizerFilter(event: OrganizerEventListItem, filter: OrganizerEventsFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'hidden') return event.status === 'approved' && Boolean(event.is_hidden)
  if (filter === 'approved') return event.status === 'approved' && !event.is_hidden
  return event.status === filter
}

function matchesNotificationFilter(item: NotificationItem, filter: NotificationsFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'unread') return !item.is_read
  if (filter === 'read') return item.is_read
  if (filter === 'moderation') return MODERATION_NOTIFICATION_TYPES.has(item.type)
  if (filter === 'complaint') return COMPLAINT_NOTIFICATION_TYPES.has(item.type)
  if (filter === 'reminder') return item.type === 'event_reminder'
  if (filter === 'chat') return item.type === 'chat_message'
  return true
}

export function filterOrganizerEvents(
  items: OrganizerEventListItem[],
  filter: OrganizerEventsFilter,
  timeScope: 'upcoming' | 'past',
): OrganizerEventListItem[] {
  const eventTime = (e: OrganizerEventListItem) => new Date(e.event_datetime).getTime()
  return items
    .filter((event) => matchesOrganizerFilter(event, filter))
    .sort((a, b) => (timeScope === 'past' ? eventTime(b) - eventTime(a) : eventTime(a) - eventTime(b)))
}

export function filterNotifications(items: NotificationItem[], filter: NotificationsFilter): NotificationItem[] {
  const created = (n: NotificationItem) => new Date(n.created_at).getTime()
  return items
    .filter((item) => matchesNotificationFilter(item, filter))
    .sort((a, b) => created(b) - created(a))
}

export function readStoredFilter<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw && (allowed as readonly string[]).includes(raw)) return raw as T
  } catch {
    // ignore
  }
  return fallback
}

export function writeStoredFilter(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}
