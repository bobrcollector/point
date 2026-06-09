import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '../../lib/api'
import { resolveMediaUrl } from '../../lib/mediaUrl'
import { useAuthStore } from '../../stores/authStore'
import type { ApiEventItem } from './types'

const EventInteractionStateSchema = z.object({
  favorite_event_ids: z.array(z.number()),
  participating_event_ids: z.array(z.number()),
})

const EventInteractionSchema = z.object({
  event_id: z.number(),
  is_favorite: z.boolean(),
  is_participating: z.boolean(),
})

const EventReviewSchema = z.object({
  review_id: z.number(),
  event_id: z.number(),
  user_id: z.number(),
  author: z.string(),
  text: z.string(),
  rating: z.number().int(),
  created_at: z.string(),
})

export type EventInteractionState = z.infer<typeof EventInteractionStateSchema>
export type EventReview = z.infer<typeof EventReviewSchema>

export const eventInteractionsQueryKey = ['catalog', 'me', 'interactions'] as const
export const participatingEventsQueryKey = ['catalog', 'me', 'participating-events'] as const

const ParticipatingEventsResponseSchema = z.object({
  total: z.number(),
  items: z.array(
    z.object({
      event_id: z.number(),
      title: z.string(),
      event_datetime: z.string(),
      location: z.string(),
      price: z.number(),
      cover_image_url: z.string().nullable().optional(),
      age_rating_min: z.number().int().optional(),
      categories: z.array(z.object({ id: z.number(), name: z.string() })),
    }),
  ),
})
export const eventReviewsQueryKey = (eventId: number | null | undefined) =>
  ['catalog', 'event', eventId, 'reviews'] as const

export function participatingItemToCard(item: ApiEventItem) {
  return {
    id: String(item.event_id),
    title: item.title,
    date: item.event_datetime,
    place: item.location,
    price: item.price,
    coverUrl: resolveMediaUrl(item.cover_image_url ?? null) ?? item.cover_image_url ?? null,
    category: item.categories?.[0]?.name,
    ageRatingMin: item.age_rating_min,
  }
}

export function useParticipatingEvents() {
  const token = useAuthStore((s) => s.token)
  return useQuery({
    queryKey: participatingEventsQueryKey,
    queryFn: async (): Promise<ApiEventItem[]> => {
      const res = await api.get('/api/v1/catalog/me/participating-events')
      return ParticipatingEventsResponseSchema.parse(res.data).items as ApiEventItem[]
    },
    enabled: Boolean(token),
    staleTime: 15_000,
  })
}

export function useEventInteractions() {
  const token = useAuthStore((s) => s.token)
  return useQuery({
    queryKey: eventInteractionsQueryKey,
    queryFn: async (): Promise<EventInteractionState> => {
      const res = await api.get('/api/v1/catalog/me/interactions')
      return EventInteractionStateSchema.parse(res.data)
    },
    enabled: Boolean(token),
    staleTime: 15_000,
  })
}

function useInteractionFlagMutation(path: 'favorite' | 'participation') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ eventId, enabled }: { eventId: number; enabled: boolean }) => {
      const res = await api.put(`/api/v1/catalog/events/${eventId}/${path}`, { enabled })
      return EventInteractionSchema.parse(res.data)
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: eventInteractionsQueryKey })
      void qc.invalidateQueries({ queryKey: participatingEventsQueryKey })
      void qc.invalidateQueries({ queryKey: ['catalog', 'event', String(vars.eventId), 'detail'] })
      void qc.invalidateQueries({ queryKey: ['catalog', 'events'] })
      void qc.invalidateQueries({ queryKey: ['organizer', 'event', vars.eventId] })
    },
  })
}

export function useSetEventFavorite() {
  return useInteractionFlagMutation('favorite')
}

export function useSetEventParticipation() {
  return useInteractionFlagMutation('participation')
}

export function useEventReviews(eventId: number | null | undefined) {
  return useQuery({
    queryKey: eventReviewsQueryKey(eventId),
    queryFn: async (): Promise<EventReview[]> => {
      const res = await api.get(`/api/v1/catalog/events/${eventId}/reviews`)
      return z.array(EventReviewSchema).parse(res.data)
    },
    enabled: Boolean(eventId),
    staleTime: 15_000,
  })
}

export function useCreateEventReview(eventId: number | null | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { text: string; rating: number }) => {
      const res = await api.post(`/api/v1/catalog/events/${eventId}/reviews`, body)
      return EventReviewSchema.parse(res.data)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: eventReviewsQueryKey(eventId) })
      void qc.invalidateQueries({ queryKey: ['catalog', 'event', String(eventId), 'detail'] })
      void qc.invalidateQueries({ queryKey: ['catalog', 'events'] })
    },
  })
}
