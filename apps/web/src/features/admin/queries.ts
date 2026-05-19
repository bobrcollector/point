import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '../../lib/api'

const AdminUserSchema = z.object({
  user_id: z.number(),
  email: z.string(),
  role: z.enum(['user', 'admin']),
  is_banned: z.boolean(),
  created_at: z.string(),
})

const AdminEventSchema = z.object({
  event_id: z.number(),
  organizer_id: z.number(),
  title: z.string(),
  description: z.string(),
  event_datetime: z.string(),
  location: z.string(),
  status: z.string(),
  moderation_reason: z.string().nullable(),
  is_hidden: z.boolean(),
  created_at: z.string(),
})

const ComplaintSchema = z.object({
  complaint_id: z.number(),
  user_id: z.number(),
  event_id: z.number(),
  reason: z.string(),
  status: z.string(),
  created_at: z.string(),
})

const MetricsSchema = z.object({
  total_users: z.number(),
  total_events: z.number(),
  active_events_today: z.number(),
  active_events_today_or_future: z.number(),
  new_complaints: z.number(),
})

const ChartPointSchema = z.object({ label: z.string(), count: z.number() })

export type AdminUser = z.infer<typeof AdminUserSchema>
export type AdminEvent = z.infer<typeof AdminEventSchema>
export type AdminComplaint = z.infer<typeof ComplaintSchema>

export function useAdminMetrics() {
  return useQuery({
    queryKey: ['admin', 'metrics'],
    queryFn: async () => {
      const res = await api.get('/api/v1/admin/dashboard/metrics')
      return MetricsSchema.parse(res.data)
    },
  })
}

export function useAdminUsersChart() {
  return useQuery({
    queryKey: ['admin', 'users-chart'],
    queryFn: async () => {
      const res = await api.get('/api/v1/admin/dashboard/users-chart')
      return z.array(ChartPointSchema).parse(res.data)
    },
  })
}

export function useAdminEventsChart() {
  return useQuery({
    queryKey: ['admin', 'events-chart'],
    queryFn: async () => {
      const res = await api.get('/api/v1/admin/dashboard/events-chart')
      return z.array(ChartPointSchema).parse(res.data)
    },
  })
}

export function useAdminUsers() {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async (): Promise<AdminUser[]> => {
      const res = await api.get('/api/v1/admin/users')
      return z.array(AdminUserSchema).parse(res.data)
    },
  })
}

export function useAdminPendingEvents() {
  return useQuery({
    queryKey: ['admin', 'pending-events'],
    queryFn: async (): Promise<AdminEvent[]> => {
      const res = await api.get('/api/v1/admin/events/pending')
      return z.array(AdminEventSchema).parse(res.data)
    },
  })
}

export function useAdminComplaints() {
  return useQuery({
    queryKey: ['admin', 'complaints'],
    queryFn: async (): Promise<AdminComplaint[]> => {
      const res = await api.get('/api/v1/admin/complaints')
      return z.array(ComplaintSchema).parse(res.data)
    },
  })
}

export function useAdminMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin'] })

  const ban = useMutation({
    mutationFn: (userId: number) => api.put(`/api/v1/admin/users/${userId}/ban`),
    onSuccess: invalidate,
  })
  const unban = useMutation({
    mutationFn: (userId: number) => api.put(`/api/v1/admin/users/${userId}/unban`),
    onSuccess: invalidate,
  })
  const removeUser = useMutation({
    mutationFn: (userId: number) => api.delete(`/api/v1/admin/users/${userId}`),
    onSuccess: invalidate,
  })
  const setRole = useMutation({
    mutationFn: (args: { userId: number; role: 'user' | 'admin' }) =>
      api.put(`/api/v1/admin/users/${args.userId}/role`, { role: args.role }),
    onSuccess: invalidate,
  })
  const moderate = useMutation({
    mutationFn: (args: { eventId: number; decision: 'approve' | 'reject'; reason?: string }) =>
      api.put(`/api/v1/admin/events/${args.eventId}/moderate`, {
        decision: args.decision,
        reason: args.reason,
      }),
    onSuccess: invalidate,
  })
  const resolveComplaint = useMutation({
    mutationFn: (args: {
      complaintId: number
      decision: 'resolved' | 'rejected'
      hide_event?: boolean
      block_organizer?: boolean
    }) =>
      api.put(`/api/v1/admin/complaints/${args.complaintId}/resolve`, {
        decision: args.decision,
        hide_event: args.hide_event,
        block_organizer: args.block_organizer,
      }),
    onSuccess: invalidate,
  })

  return { ban, unban, removeUser, setRole, moderate, resolveComplaint }
}
