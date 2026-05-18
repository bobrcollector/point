import type { ApiEventDetail } from '../features/catalog/types'

const KEY_FAV = 'point:favoriteEventIds'
const KEY_PART = 'point:eventParticipatingIds'
const KEY_CREATED = 'point:createdEventIds'
const KEY_DEMO_SEEDED = 'point:demoUserDataSeeded'
const KEY_REVIEWS = 'point:eventReviews'
const KEY_CHAT = 'point:eventChatMessages'
const KEY_REPORTS = 'point:eventUserReports'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function readFavoriteIds(): string[] {
  const v = readJson<unknown>(KEY_FAV, [])
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export function setFavoriteIds(ids: string[]) {
  writeJson(KEY_FAV, ids)
}

export function isFavorite(eventId: string): boolean {
  return readFavoriteIds().includes(eventId)
}

/** @returns новое состояние «в избранном» */
export function toggleFavorite(eventId: string): boolean {
  const s = new Set(readFavoriteIds())
  if (s.has(eventId)) s.delete(eventId)
  else s.add(eventId)
  setFavoriteIds([...s])
  return s.has(eventId)
}

export function readCreatedEventIds(): string[] {
  const v = readJson<unknown>(KEY_CREATED, [])
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export function setCreatedEventIds(ids: string[]) {
  writeJson(KEY_CREATED, ids)
}

export function addCreatedEventId(eventId: string) {
  const s = new Set(readCreatedEventIds())
  s.add(eventId)
  setCreatedEventIds([...s])
}

export function isCreatedByMe(eventId: string): boolean {
  return readCreatedEventIds().includes(eventId)
}

export function readParticipatingIds(): string[] {
  const v = readJson<unknown>(KEY_PART, [])
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export function setParticipatingIds(ids: string[]) {
  writeJson(KEY_PART, ids)
}

export function isParticipating(eventId: string): boolean {
  return readParticipatingIds().includes(eventId)
}

/** @returns новое состояние «участвую» */
export function toggleParticipating(eventId: string): boolean {
  const s = new Set(readParticipatingIds())
  if (s.has(eventId)) s.delete(eventId)
  else s.add(eventId)
  setParticipatingIds([...s])
  return s.has(eventId)
}

export type StoredReview = {
  id: string
  author: string
  text: string
  rating: number
  at: number
}

export function readReviews(eventId: string): StoredReview[] {
  const all = readJson<Record<string, StoredReview[]>>(KEY_REVIEWS, {})
  const list = all[eventId]
  return Array.isArray(list) ? list : []
}

export function addReview(eventId: string, input: { author: string; text: string; rating: number }): StoredReview {
  const all = readJson<Record<string, StoredReview[]>>(KEY_REVIEWS, {})
  const row: StoredReview = { id: crypto.randomUUID(), at: Date.now(), ...input }
  all[eventId] = [row, ...(all[eventId] ?? [])]
  writeJson(KEY_REVIEWS, all)
  return row
}

function seedReviewsIfEmpty(eventId: string, rows: Omit<StoredReview, 'id'>[]) {
  const all = readJson<Record<string, StoredReview[]>>(KEY_REVIEWS, {})
  if ((all[eventId] ?? []).length) return
  all[eventId] = rows.map((r) => ({ ...r, id: crypto.randomUUID() }))
  writeJson(KEY_REVIEWS, all)
}

/** Демо-отзывы для событий в избранном. */
export function ensureDemoFavoriteReviews(testEventId?: string) {
  if (testEventId) {
    const fav = new Set(readFavoriteIds())
    if (!fav.has(testEventId)) {
      fav.add(testEventId)
      setFavoriteIds([...fav])
    }
  }
  const favIds = readFavoriteIds()
  const samples: Record<string, Omit<StoredReview, 'id'>[]> = {
    '104': [
      {
        author: 'Алина К.',
        text: 'Отличная атмосфера на крыше, звук чистый. Пришли с друзьями — остались довольны.',
        rating: 5,
        at: Date.now() - 1000 * 60 * 60 * 24 * 4
      },
      {
        author: 'Михаил В.',
        text: 'Места на верхних рядах лучше бронировать заранее. Напитки дороговаты, но вид того стоит.',
        rating: 4,
        at: Date.now() - 1000 * 60 * 60 * 24 * 2
      }
    ],
    'local-demo-1': [
      {
        author: 'Елена С.',
        text: 'Удобная площадка для нетворкинга: успели познакомиться с тремя командами из соседних столиков.',
        rating: 5,
        at: Date.now() - 1000 * 60 * 60 * 20
      },
      {
        author: 'Игорь П.',
        text: 'Организация на уровне, модератор держал темп. Хотелось бы больше времени на вопросы в конце.',
        rating: 4,
        at: Date.now() - 1000 * 60 * 60 * 8
      }
    ]
  }
  for (const id of favIds) {
    const rows = samples[id]
    if (rows) seedReviewsIfEmpty(id, rows)
  }
}

export type ChatRole = 'participant' | 'organizer'

export type StoredChatMessage = {
  id: string
  author: string
  text: string
  at: number
  role: ChatRole
}

export function readChat(eventId: string): StoredChatMessage[] {
  const all = readJson<Record<string, StoredChatMessage[]>>(KEY_CHAT, {})
  const list = all[eventId]
  return Array.isArray(list) ? list : []
}

export function appendChat(eventId: string, input: Omit<StoredChatMessage, 'id' | 'at'>): StoredChatMessage {
  const all = readJson<Record<string, StoredChatMessage[]>>(KEY_CHAT, {})
  const row: StoredChatMessage = { id: crypto.randomUUID(), at: Date.now(), ...input }
  all[eventId] = [...(all[eventId] ?? []), row]
  writeJson(KEY_CHAT, all)
  return row
}

export type StoredReport = {
  id: string
  eventId: string
  reason: string
  details: string
  at: number
}

export function addReport(payload: { eventId: string; reason: string; details: string }): StoredReport {
  const all = readJson<StoredReport[]>(KEY_REPORTS, [])
  const row: StoredReport = { id: crypto.randomUUID(), at: Date.now(), ...payload }
  writeJson(KEY_REPORTS, [...all, row])
  return row
}

/** Первичное наполнение «Мои события» и избранного для демо-пользователя. */
export function ensureDemoUserEventData(testEventId: string) {
  if (localStorage.getItem(KEY_DEMO_SEEDED)) return
  addCreatedEventId(testEventId)
  const part = new Set(readParticipatingIds())
  part.add('102')
  setParticipatingIds([...part])
  const fav = new Set(readFavoriteIds())
  fav.add('104')
  fav.add(testEventId)
  setFavoriteIds([...fav])
  localStorage.setItem(KEY_DEMO_SEEDED, '1')
  ensureDemoFavoriteReviews()
}

// --- Демо-пользователь (офлайн-сессия) ---

const KEY_DEMO_USER = 'point:demoUser'

export type DemoUser = {
  displayName: string
  email: string
}

const DEFAULT_DEMO_USER: DemoUser = {
  displayName: 'Алексей Демо',
  email: 'demo@point.local'
}

export function getDemoUser(): DemoUser {
  try {
    const raw = localStorage.getItem(KEY_DEMO_USER)
    if (!raw) return DEFAULT_DEMO_USER
    const parsed = JSON.parse(raw) as Partial<DemoUser>
    return {
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : DEFAULT_DEMO_USER.displayName,
      email: typeof parsed.email === 'string' ? parsed.email : DEFAULT_DEMO_USER.email
    }
  } catch {
    return DEFAULT_DEMO_USER
  }
}

export function ensureDemoUser(): DemoUser {
  const user = getDemoUser()
  localStorage.setItem(KEY_DEMO_USER, JSON.stringify(user))
  return user
}

// --- Локальные события (localStorage) ---

const KEY_LOCAL_EVENTS = 'point:localEvents'
export const DEMO_LOCAL_EVENT_ID = 'local-demo-1'

export type LocalEventRecord = {
  id: string
  title: string
  event_datetime: string
  location: string
  address_detail: string
  description: string
  price: number
  average_rating?: number | null
  cover_image_url?: string | null
  latitude?: number | null
  longitude?: number | null
  organizer_name: string
  gallery_urls: string[]
  participants_count: number
  categories: { id: number; name: string }[]
  is_for_children?: boolean
  age_rating_min?: number
}

function readLocalEventsAll(): LocalEventRecord[] {
  try {
    const raw = localStorage.getItem(KEY_LOCAL_EVENTS)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as LocalEventRecord[]) : []
  } catch {
    return []
  }
}

function writeLocalEventsAll(rows: LocalEventRecord[]) {
  localStorage.setItem(KEY_LOCAL_EVENTS, JSON.stringify(rows))
}

export function readLocalEvents(): LocalEventRecord[] {
  return readLocalEventsAll()
}

export function getLocalEventById(id: string): LocalEventRecord | undefined {
  return readLocalEventsAll().find((e) => e.id === id)
}

export function isLocalEventId(id: string | undefined): boolean {
  return Boolean(id && (id.startsWith('local-') || id.startsWith('local_')))
}

export function localEventToApiDetail(row: LocalEventRecord): ApiEventDetail {
  return {
    event_id: 0,
    title: row.title,
    event_datetime: row.event_datetime,
    location: row.location,
    price: row.price,
    average_rating: row.average_rating ?? null,
    cover_image_url: row.cover_image_url ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    is_for_children: row.is_for_children,
    age_rating_min: row.age_rating_min,
    categories: row.categories,
    description: row.description,
    address_detail: row.address_detail,
    organizer_name: row.organizer_name,
    gallery_urls: row.gallery_urls,
    participants_count: row.participants_count
  }
}

function buildDemoLocalEvent(organizerName: string): LocalEventRecord {
  const inThreeDays = new Date()
  inThreeDays.setDate(inThreeDays.getDate() + 3)
  inThreeDays.setHours(19, 0, 0, 0)
  return {
    id: DEMO_LOCAL_EVENT_ID,
    title: 'Нетворкинг для IT-специалистов',
    event_datetime: inThreeDays.toISOString(),
    location: 'Коворкинг «Точка»',
    address_detail: 'Москва, ул. Тверская, 12, 3 этаж',
    description:
      'Неформальная встреча разработчиков и продактов: короткие питчи, обмен контактами и обсуждение pet-проектов. Напитки включены.',
    price: 0,
    average_rating: 4.6,
    cover_image_url: null,
    latitude: 55.757,
    longitude: 37.615,
    organizer_name: organizerName,
    gallery_urls: [],
    participants_count: 24,
    categories: [{ id: 21, name: 'Нетворкинг' }],
    is_for_children: false,
    age_rating_min: 18
  }
}

/** Создаёт демо-событие в localStorage, если его ещё нет. Возвращает id. */
export function ensureTestEvent(organizerName: string): string {
  const rows = readLocalEventsAll()
  const idx = rows.findIndex((e) => e.id === DEMO_LOCAL_EVENT_ID)
  const demo = buildDemoLocalEvent(organizerName)
  if (idx >= 0) {
    rows[idx] = { ...demo, ...rows[idx], organizer_name: organizerName }
    writeLocalEventsAll(rows)
    return DEMO_LOCAL_EVENT_ID
  }
  writeLocalEventsAll([demo, ...rows])
  return DEMO_LOCAL_EVENT_ID
}

// --- Навигация «назад» со страницы события ---

export type EventDetailBackState = {
  from?: string
  label?: string
}

export function getEventDetailBack(state: unknown): { to: string; label: string } {
  const s = state as EventDetailBackState | null | undefined
  if (s?.from) {
    return { to: s.from, label: s.label ?? '← Назад' }
  }
  return { to: '/', label: '← Лента' }
}
