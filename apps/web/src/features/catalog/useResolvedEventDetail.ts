import { useEventDetail } from './queries'
import { useOrganizerEventDetail } from '../organizer/queries'
import type { ApiEventDetail } from './types'
import type { OrganizerEventDetail } from '../organizer/types'

function organizerDetailToApiDetail(detail: OrganizerEventDetail): ApiEventDetail {
  return {
    event_id: detail.event_id,
    title: detail.title,
    event_datetime: detail.event_datetime,
    location: detail.location,
    price: detail.price,
    cover_image_url: detail.cover_image_url,
    latitude: detail.latitude,
    longitude: detail.longitude,
    is_for_children: detail.is_for_children,
    age_rating_min: detail.age_rating_min,
    categories: detail.categories,
    description: detail.description,
    address_detail: detail.address_detail,
    organizer_id: detail.organizer_id,
    organizer_name: detail.organizer_name,
    status: detail.status,
    gallery_urls: detail.gallery_urls,
    participants_count: 0,
    requires_registration: detail.requires_registration,
    ticket_types: detail.ticket_types,
  }
}

export function useResolvedEventDetail(eventId: string | undefined, organizerPreview = false) {
  const numericId = eventId && /^\d+$/.test(eventId) ? Number(eventId) : undefined
  const apiQuery = useEventDetail(organizerPreview ? undefined : eventId)
  const organizerQuery = useOrganizerEventDetail(numericId, organizerPreview)

  const sourceQuery = organizerPreview ? organizerQuery : apiQuery
  const data = organizerPreview && organizerQuery.data ? organizerDetailToApiDetail(organizerQuery.data) : apiQuery.data
  return {
    isLocal: false as const,
    isOrganizerPreview: organizerPreview,
    isPending: sourceQuery.isPending,
    isFetching: sourceQuery.isFetching,
    isError: sourceQuery.isError,
    error: sourceQuery.error,
    data,
    isLoading: sourceQuery.isPending && data === undefined,
  }
}
