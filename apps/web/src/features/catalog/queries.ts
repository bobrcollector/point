import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '../../lib/api'
import { getLocalEventById, isLocalEventId } from '../../lib/eventInteractionStorage'
import { resolveGalleryUrls, resolveMediaUrl } from '../../lib/mediaUrl'
import type { ApiEventDetail, ApiEventItem, EventsResponse } from './types'

const CatalogEventItemSchema = z.object({
  event_id: z.number(),
  title: z.string(),
  event_datetime: z.string(),
  location: z.string(),
  price: z.number(),
  average_rating: z.number().nullable().optional(),
  cover_image_url: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  distance: z.number().int().nullable().optional(),
  is_for_children: z.boolean().optional(),
  age_rating_min: z.number().int().optional(),
  categories: z.array(z.object({ id: z.number(), name: z.string() }))
})

const CategorySchema = z.object({ id: z.number(), name: z.string() })
const CategoriesResponseSchema = z.object({ items: z.array(CategorySchema) })

const EventsResponseSchema = z.object({
  total: z.number(),
  items: z.array(CatalogEventItemSchema)
})

const TicketTypeSchema = z.object({
  id: z.number(),
  name: z.string(),
  price: z.number(),
  quantity: z.number().int()
})

function withResolvedMediaItem<T extends ApiEventItem>(item: T): T {
  return {
    ...item,
    cover_image_url: resolveMediaUrl(item.cover_image_url ?? null) ?? item.cover_image_url ?? null,
  }
}

function withResolvedMediaDetail(item: ApiEventDetail): ApiEventDetail {
  return {
    ...withResolvedMediaItem(item),
    gallery_urls: resolveGalleryUrls(item.gallery_urls),
  }
}

export const EventDetailSchema = CatalogEventItemSchema.extend({
  description: z.string(),
  address_detail: z.string().optional().default(''),
  organizer_id: z.number().int().nullable().optional(),
  organizer_name: z.string(),
  gallery_urls: z.array(z.string()).optional().default([]),
  participants_count: z.coerce.number().int().nonnegative(),
  requires_registration: z.boolean().optional(),
  ticket_types: z.array(TicketTypeSchema).optional().default([]),
})

export function catalogEventDetailQueryOptions(eventId: string) {
  const numericId = Number(eventId)
  return {
    queryKey: ['catalog', 'event', eventId, 'detail'] as const,
    enabled: /^\d+$/.test(eventId) && Number.isFinite(numericId) && numericId > 0,
    queryFn: async (): Promise<ApiEventDetail> => {
      const res = await api.get(`/api/v1/catalog/events/${numericId}`)
      const parsed = EventDetailSchema.safeParse(res.data)
      if (!parsed.success) {
        console.error('catalog event detail schema', parsed.error.flatten())
        throw new Error('Сервер вернул некорректные данные события')
      }
      return withResolvedMediaDetail(parsed.data)
    },
    staleTime: 30_000
  }
}

export type EventsQuery = {
  lat?: number
  lon?: number
  radius?: number
  bounds?: string
  category_ids?: string
  price_min?: number
  price_max?: number
  for_children?: boolean
  age_ratings?: string
  limit?: number
  offset?: number
  sort_by?: string
}

export function useEvents(query: EventsQuery) {
  return useQuery({
    queryKey: ['catalog', 'events', query],
    queryFn: async (): Promise<EventsResponse> => {
      const res = await api.get('/api/v1/catalog/events', { params: query })
      const parsed = EventsResponseSchema.parse(res.data)
      return {
        ...parsed,
        items: parsed.items.map((it) => withResolvedMediaItem(it)),
      }
    },
    staleTime: 15000,
    placeholderData: (prev) => prev
  })
}

export function useCategories() {
  return useQuery({
    queryKey: ['catalog', 'categories'],
    queryFn: async () => {
      const res = await api.get('/api/v1/catalog/categories')
      return CategoriesResponseSchema.parse(res.data).items
    },
    staleTime: 60_000
  })
}

export function useEventDetail(eventId: string | undefined) {
  const enabled = Boolean(eventId && /^\d+$/.test(eventId))
  return useQuery({
    ...catalogEventDetailQueryOptions(eventId ?? ''),
    enabled
  })
}

export type StoredEventCard = {
  id: string
  title: string
  date: string
  place: string
  price: number
  coverUrl?: string
  categories?: string[]
  ageRatingMin?: number
}

export function useStoredEventCards(ids: string[]): StoredEventCard[] {
  const eventsQuery = useEvents({ limit: 100, offset: 0, sort_by: 'date' })

  return useMemo(() => {
    if (!ids.length) return []
    const idSet = new Set(ids)
    const fromApi =
      eventsQuery.data?.items
        .filter((it) => idSet.has(String(it.event_id)))
        .map((it) => ({
          id: String(it.event_id),
          title: it.title,
          date: it.event_datetime,
          place: it.location,
          price: it.price,
          coverUrl: it.cover_image_url ?? undefined,
          categories: it.categories?.map((c) => c.name) ?? [],
          ageRatingMin: it.age_rating_min
        })) ?? []

    const apiIds = new Set(fromApi.map((e) => e.id))
    const fromLocal = ids
      .filter((id) => isLocalEventId(id) && !apiIds.has(id))
      .map((id) => getLocalEventById(id))
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .map((row) => ({
        id: row.id,
        title: row.title,
        date: row.event_datetime,
        place: row.location,
        price: row.price,
        coverUrl: row.cover_image_url ?? undefined,
        categories: row.categories.map((c: { name: string }) => c.name),
        ageRatingMin: row.age_rating_min
      }))

    const merged = [...fromApi, ...fromLocal]
    const order = new Map(ids.map((id, i) => [id, i]))
    return merged.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
  }, [ids, eventsQuery.data?.items])
}

