import type { ApiEventDetail } from '../features/catalog/types'

const KEY = 'point:localEvents'

export const TEST_EVENT_ID = 'local-demo-1'

export type LocalEventRecord = ApiEventDetail & { localId: string }

function readAll(): Record<string, LocalEventRecord> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const v = JSON.parse(raw) as Record<string, LocalEventRecord>
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

function writeAll(data: Record<string, LocalEventRecord>) {
  localStorage.setItem(KEY, JSON.stringify(data))
}

export function readLocalEvent(id: string): LocalEventRecord | null {
  return readAll()[id] ?? null
}

export function upsertLocalEvent(record: LocalEventRecord) {
  const all = readAll()
  all[record.localId] = record
  writeAll(all)
}

export function isLocalEventId(id: string): boolean {
  return id.startsWith('local-') || Boolean(readAll()[id])
}

export const localEventDetailQueryKey = (localId: string) => ['local', 'event', localId, 'detail'] as const

export function localEventDetailQueryOptions(localId: string) {
  return {
    queryKey: localEventDetailQueryKey(localId),
    queryFn: (): ApiEventDetail | undefined => {
      const row = readLocalEvent(localId)
      if (!row) return undefined
      const { localId: _id, ...detail } = row
      return detail
    },
    staleTime: Infinity,
  }
}

export function buildTestEvent(organizerName: string): LocalEventRecord {
  return {
    localId: TEST_EVENT_ID,
    event_id: 9001,
    title: 'Тестовый митап Point',
    event_datetime: '2026-05-10T19:00:00+03:00',
    location: 'Коворкинг «Точка»',
    address_detail: 'Коворкинг «Точка», ул. Мясницкая 24, Москва — 3 этаж, зал «Амфитеатр».',
    description:
      'Демо-событие для проверки раздела «Мои события». Здесь можно протестировать избранное, чат с организатором и галерею фотографий. Создано вами как организатор.',
    organizer_name: organizerName,
    price: 0,
    average_rating: null,
    cover_image_url: 'https://picsum.photos/seed/point-test-cover/1200/800',
    latitude: 55.762,
    longitude: 37.635,
    categories: [{ id: 21, name: 'Нетворкинг' }],
    gallery_urls: [
      'https://picsum.photos/seed/point-test-a/1200/800',
      'https://picsum.photos/seed/point-test-b/1200/800',
      'https://picsum.photos/seed/point-test-c/1200/800',
      'https://picsum.photos/seed/point-test-d/1200/800'
    ],
    participants_count: 12,
    is_for_children: false,
    age_rating_min: 16
  }
}

export function ensureTestEvent(organizerName: string): string {
  const record = buildTestEvent(organizerName)
  upsertLocalEvent(record)
  return TEST_EVENT_ID
}
