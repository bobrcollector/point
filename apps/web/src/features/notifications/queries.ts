import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import type { NotificationItem } from './types'

const NotificationSchema = z.object({
  notification_id: z.number(),
  type: z.string(),
  content: z.string(),
  is_read: z.boolean(),
  created_at: z.string(),
})

export function useNotifications() {
  const token = useAuthStore((s) => s.token)
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async (): Promise<NotificationItem[]> => {
      const res = await api.get('/api/v1/notifications')
      return z.array(NotificationSchema).parse(res.data)
    },
    enabled: Boolean(token),
    refetchInterval: 60_000,
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (notificationId: number) => {
      const res = await api.put(`/api/v1/notifications/${notificationId}/read`)
      return NotificationSchema.parse(res.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

export function useSubmitComplaint() {
  return useMutation({
    mutationFn: async (body: { event_id: number; reason: string }) => {
      const res = await api.post('/api/v1/complaints', body)
      return res.data
    },
  })
}
