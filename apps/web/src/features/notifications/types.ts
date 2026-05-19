export type NotificationItem = {
  notification_id: number
  type: string
  content: string
  is_read: boolean
  created_at: string
}

export const NOTIFICATION_TYPE_LABEL: Record<string, string> = {
  event_status: 'Модерация',
  moderation_status: 'Модерация',
  event_reminder: 'Напоминание',
  complaint_created: 'Жалоба',
  complaint_resolved: 'Жалоба рассмотрена',
  complaint_rejected: 'Жалоба закрыта',
  complaint_pending: 'Жалоба',
  chat_message: 'Чат',
}
