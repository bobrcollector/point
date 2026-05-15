const KEY_FAV = 'point:favoriteEventIds'
const KEY_PART = 'point:eventParticipatingIds'
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
