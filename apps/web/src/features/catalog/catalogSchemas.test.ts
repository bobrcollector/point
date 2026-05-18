import { describe, expect, it } from 'vitest'
import { z } from 'zod'

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

const EventsResponseSchema = z.object({
  total: z.number(),
  items: z.array(CatalogEventItemSchema)
})

describe('catalog API response schemas', () => {
  it('принимает корректный ответ списка событий', () => {
    const data = {
      total: 1,
      items: [
        {
          event_id: 1,
          title: 'Концерт',
          event_datetime: '2026-06-01T18:00:00+00:00',
          location: 'Москва',
          price: 0,
          latitude: 55.75,
          longitude: 37.62,
          categories: [{ id: 1, name: 'Концерты' }]
        }
      ]
    }
    expect(EventsResponseSchema.parse(data)).toEqual(data)
  })

  it('отклоняет ответ с неверными типами', () => {
    expect(() =>
      EventsResponseSchema.parse({ total: '1', items: [] })
    ).toThrow()
  })
})
