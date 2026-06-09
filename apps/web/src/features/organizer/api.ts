import { api } from '../../lib/api'
import { resolveGalleryUrls, resolveMediaUrl } from '../../lib/mediaUrl'
import { resizeImageForUpload } from '../../lib/resizeImage'
import type { EventFormDraft, OrganizerEventDetail, OrganizerEventListItem } from './types'

function draftFields(draft: EventFormDraft) {
  const dt = new Date(`${draft.date}T${draft.time}`)
  if (Number.isNaN(dt.getTime())) {
    throw new Error('Укажите корректные дату и время')
  }
  return {
    title: draft.title,
    description: draft.description,
    location: draft.location,
    address_detail: draft.addressDetail,
    event_datetime: dt.toISOString(),
    category_ids: draft.categoryIds,
    latitude: draft.latitude,
    longitude: draft.longitude,
    cover_image_url: draft.coverUrl,
    gallery_urls: draft.galleryUrls,
    is_for_children: draft.isForChildren,
    age_rating_min: draft.ageRatingMin,
    requires_registration: draft.requiresRegistration,
    ticket_types: draft.requiresRegistration
      ? draft.ticketTypes
          .filter((t) => t.name.trim())
          .map((t, i) => ({
            name: t.name.trim(),
            price: Number(t.price) || 0,
            quantity: Number(t.quantity) || 0,
            sort_order: i
          }))
      : []
  }
}

function draftToPayload(draft: EventFormDraft) {
  return { ...draftFields(draft), status: draft.status }
}

/** PATCH не передаёт status — иначе сохранение формы затирает решение модерации. */
function draftToUpdatePayload(draft: EventFormDraft) {
  return draftFields(draft)
}

function withResolvedOrganizerMedia<T extends OrganizerEventDetail | OrganizerEventListItem>(item: T): T {
  return {
    ...item,
    cover_image_url:
      resolveMediaUrl(item.cover_image_url ?? null) ?? item.cover_image_url ?? null,
    ...(('gallery_urls' in item && item.gallery_urls)
      ? { gallery_urls: resolveGalleryUrls(item.gallery_urls) }
      : {}),
  }
}

export function detailToDraft(d: OrganizerEventDetail): EventFormDraft {
  const dt = new Date(d.event_datetime)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    title: d.title,
    description: d.description,
    categoryIds: d.category_ids,
    isForChildren: d.is_for_children,
    ageRatingMin: d.age_rating_min,
    date: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`,
    time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}`,
    location: d.location,
    addressDetail: d.address_detail,
    latitude: d.latitude,
    longitude: d.longitude,
    requiresRegistration: d.requires_registration,
    coverUrl: d.cover_image_url,
    galleryUrls: d.gallery_urls ?? [],
    ticketTypes:
      d.ticket_types.length > 0
        ? d.ticket_types.map((t) => ({
            name: t.name,
            price: String(t.price),
            quantity: String(t.quantity)
          }))
        : [{ name: '', price: '', quantity: '' }],
    status: d.status
  }
}

export async function listMyOrganizerEvents(): Promise<OrganizerEventListItem[]> {
  const res = await api.get<{ items: OrganizerEventListItem[]; total: number }>('/api/v1/organizer/events')
  const items = res.data?.items
  if (!Array.isArray(items)) return []
  return items.map((item) =>
    withResolvedOrganizerMedia({
      ...item,
      event_datetime:
        typeof item.event_datetime === 'string' ? item.event_datetime : String(item.event_datetime),
      status: item.status as OrganizerEventListItem['status'],
    }),
  )
}

export async function getOrganizerEvent(eventId: number): Promise<OrganizerEventDetail> {
  const res = await api.get<OrganizerEventDetail>(`/api/v1/organizer/events/${eventId}`)
  return withResolvedOrganizerMedia(res.data)
}

export async function createOrganizerEvent(draft: EventFormDraft): Promise<OrganizerEventDetail> {
  const res = await api.post<OrganizerEventDetail>('/api/v1/organizer/events', draftToPayload(draft))
  return res.data
}

export async function updateOrganizerEvent(eventId: number, draft: EventFormDraft): Promise<OrganizerEventDetail> {
  const res = await api.patch<OrganizerEventDetail>(`/api/v1/organizer/events/${eventId}`, draftToUpdatePayload(draft))
  return res.data
}

export async function deleteOrganizerEvent(eventId: number): Promise<void> {
  await api.delete(`/api/v1/organizer/events/${eventId}`)
}

export async function publishOrganizerEvent(eventId: number): Promise<OrganizerEventDetail> {
  const res = await api.post<OrganizerEventDetail>(`/api/v1/organizer/events/${eventId}/publish`)
  return res.data
}

export async function finishOrganizerEvent(eventId: number): Promise<OrganizerEventDetail> {
  const res = await api.post<OrganizerEventDetail>(`/api/v1/organizer/events/${eventId}/finish`)
  return res.data
}

export async function uploadEventImage(file: File): Promise<string> {
  const prepared = await resizeImageForUpload(file)
  const form = new FormData()
  form.append('file', prepared)
  const res = await api.post<{ url: string }>('/api/v1/organizer/uploads', form)
  return resolveMediaUrl(res.data.url) ?? res.data.url
}
