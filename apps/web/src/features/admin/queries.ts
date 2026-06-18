import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { EventDetailSchema } from '../catalog/queries'
import type { ApiEventDetail } from '../catalog/types'
import { api } from '../../lib/api'
import { resolveGalleryUrls, resolveMediaUrl } from '../../lib/mediaUrl'

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
  user_name: z.string(),
  event_title: z.string(),
})

const MetricsSchema = z.object({
  total_users: z.number(),
  users_registered_today: z.number(),
  total_events: z.number(),
  active_events_today: z.number(),
  active_events_today_or_future: z.number(),
  new_complaints: z.number(),
  total_complaints: z.number(),
  complaints_today: z.number(),
  pending_events: z.number(),
  banned_users: z.number(),
  upcoming_events: z.number(),
  total_participations: z.number(),
  events_created_today: z.number(),
  participations_today: z.number(),
  total_reviews: z.number(),
  avg_event_rating: z.number().nullable(),
  avg_review_rating: z.number().nullable(),
  review_leave_percent: z.number().nullable(),
  view_to_participation_percent: z.number().nullable(),
  participations_per_active_event: z.number().nullable(),
  repeat_participants_percent: z.number().nullable(),
  low_rated_events_percent: z.number().nullable(),
})

const ChartPointSchema = z.object({ label: z.string(), count: z.number() })
const RatingChartPointSchema = z.object({ label: z.string(), value: z.number().nullable() })

export type AdminUser = z.infer<typeof AdminUserSchema>
export type AdminEvent = z.infer<typeof AdminEventSchema>
export type AdminComplaint = z.infer<typeof ComplaintSchema>

export type RatingChartPoint = z.infer<typeof RatingChartPointSchema>

function parseMetrics(data: unknown) {
  const parsed = MetricsSchema.safeParse(data)
  if (!parsed.success) {
    console.error('admin metrics schema', parsed.error.flatten())
    throw new Error('Сервер вернул некорректные метрики')
  }
  return parsed.data
}

export function useAdminMetrics() {
  return useQuery({
    queryKey: ['admin', 'metrics'],
    queryFn: async () => {
      const res = await api.get('/api/v1/admin/dashboard/metrics')
      return parseMetrics(res.data)
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

export function useAdminUsersTotalChart() {
  return useQuery({
    queryKey: ['admin', 'users-total-chart'],
    queryFn: async () => {
      const res = await api.get('/api/v1/admin/dashboard/users-total-chart')
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

export function useAdminParticipationsChart() {
  return useQuery({
    queryKey: ['admin', 'participations-chart'],
    queryFn: async () => {
      const res = await api.get('/api/v1/admin/dashboard/participations-chart')
      return z.array(ChartPointSchema).parse(res.data)
    },
  })
}

export function useAdminComplaintsChart() {
  return useQuery({
    queryKey: ['admin', 'complaints-chart'],
    queryFn: async () => {
      const res = await api.get('/api/v1/admin/dashboard/complaints-chart')
      return z.array(ChartPointSchema).parse(res.data)
    },
  })
}

export function useAdminComplaintsTotalChart() {
  return useQuery({
    queryKey: ['admin', 'complaints-total-chart'],
    queryFn: async () => {
      const res = await api.get('/api/v1/admin/dashboard/complaints-total-chart')
      return z.array(ChartPointSchema).parse(res.data)
    },
  })
}

export function useAdminRatingChart() {
  return useQuery({
    queryKey: ['admin', 'rating-chart'],
    queryFn: async () => {
      const res = await api.get('/api/v1/admin/dashboard/rating-chart')
      return z.array(RatingChartPointSchema).parse(res.data)
    },
  })
}

export function useAdminConversionChart() {
  return useQuery({
    queryKey: ['admin', 'conversion-chart'],
    queryFn: async () => {
      const res = await api.get('/api/v1/admin/dashboard/conversion-chart')
      return z.array(RatingChartPointSchema).parse(res.data)
    },
  })
}

export function useAdminParticipationsPerEventChart() {
  return useQuery({
    queryKey: ['admin', 'participations-per-event-chart'],
    queryFn: async () => {
      const res = await api.get('/api/v1/admin/dashboard/participations-per-event-chart')
      return z.array(RatingChartPointSchema).parse(res.data)
    },
  })
}

export function useAdminRepeatParticipantsChart() {
  return useQuery({
    queryKey: ['admin', 'repeat-participants-chart'],
    queryFn: async () => {
      const res = await api.get('/api/v1/admin/dashboard/repeat-participants-chart')
      return z.array(RatingChartPointSchema).parse(res.data)
    },
  })
}

export function useAdminLowRatedEventsChart() {
  return useQuery({
    queryKey: ['admin', 'low-rated-events-chart'],
    queryFn: async () => {
      const res = await api.get('/api/v1/admin/dashboard/low-rated-events-chart')
      return z.array(RatingChartPointSchema).parse(res.data)
    },
  })
}

export function useAdminReviewLeaveChart() {
  return useQuery({
    queryKey: ['admin', 'review-leave-chart'],
    queryFn: async () => {
      const res = await api.get('/api/v1/admin/dashboard/review-leave-chart')
      return z.array(RatingChartPointSchema).parse(res.data)
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

export function useAdminEventDetail(eventId: number | undefined, enabled = false) {
  return useQuery({
    queryKey: ['admin', 'event', eventId],
    enabled: enabled && Boolean(eventId && eventId > 0),
    queryFn: async (): Promise<ApiEventDetail> => {
      const res = await api.get(`/api/v1/admin/events/${eventId}`)
      const parsed = EventDetailSchema.safeParse(res.data)
      if (!parsed.success) {
        console.error('admin event detail schema', parsed.error.flatten())
        throw new Error('Сервер вернул некорректные данные события')
      }
      const item = parsed.data
      return {
        ...item,
        cover_image_url: resolveMediaUrl(item.cover_image_url ?? null) ?? item.cover_image_url ?? null,
        gallery_urls: resolveGalleryUrls(item.gallery_urls),
      }
    },
    staleTime: 30_000,
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
    mutationFn: (args: {
      eventId: number
      decision: 'approve' | 'reject'
      reason?: string
      block_organizer?: boolean
    }) =>
      api.put(`/api/v1/admin/events/${args.eventId}/moderate`, {
        decision: args.decision,
        reason: args.reason,
        block_organizer: args.block_organizer,
      }),
    onSuccess: () => {
      invalidate()
      void qc.invalidateQueries({ queryKey: ['organizer'] })
      void qc.invalidateQueries({ queryKey: ['catalog'] })
      void qc.invalidateQueries({ queryKey: ['notifications'] })
    },
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
    onSuccess: () => {
      invalidate()
      void qc.invalidateQueries({ queryKey: ['catalog'] })
      void qc.invalidateQueries({ queryKey: ['organizer', 'events'] })
    },
  })

  return { ban, unban, removeUser, setRole, moderate, resolveComplaint }
}
