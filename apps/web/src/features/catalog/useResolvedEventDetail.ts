import { useAdminEventDetail } from '../admin/queries'
import { resolveGalleryUrls, resolveMediaUrl } from '../../lib/mediaUrl'
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
    cover_image_url: resolveMediaUrl(detail.cover_image_url ?? null) ?? detail.cover_image_url ?? null,
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
    gallery_urls: resolveGalleryUrls(detail.gallery_urls),
    participants_count: detail.participants_count ?? 0,
    requires_registration: detail.requires_registration,
    ticket_types: detail.ticket_types,
  }
}

export function useResolvedEventDetail(
  eventId: string | undefined,
  organizerPreview = false,
  adminPreview = false,
) {
  const numericId = eventId && /^\d+$/.test(eventId) ? Number(eventId) : undefined
  const useCatalog = !organizerPreview && !adminPreview
  const apiQuery = useEventDetail(useCatalog ? eventId : undefined)
  const organizerQuery = useOrganizerEventDetail(numericId, organizerPreview && !adminPreview)
  const adminQuery = useAdminEventDetail(numericId, adminPreview)

  const sourceQuery = adminPreview ? adminQuery : organizerPreview ? organizerQuery : apiQuery
  const data = adminPreview
    ? adminQuery.data
    : organizerPreview && organizerQuery.data
      ? organizerDetailToApiDetail(organizerQuery.data)
      : apiQuery.data
  return {
    isLocal: false as const,
    isOrganizerPreview: organizerPreview,
    isAdminPreview: adminPreview,
    isPending: sourceQuery.isPending,
    isFetching: sourceQuery.isFetching,
    isError: sourceQuery.isError,
    error: sourceQuery.error,
    data,
    isLoading: sourceQuery.isPending && data === undefined,
  }
}
