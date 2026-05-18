export type EventStatus = 'draft' | 'published' | 'cancelled'

export type TicketTypeDraft = {
  name: string
  price: string
  quantity: string
}

export type EventFormDraft = {
  title: string
  description: string
  categoryIds: number[]
  isForChildren: boolean
  ageRatingMin: number
  date: string
  time: string
  location: string
  addressDetail: string
  latitude: number | null
  longitude: number | null
  requiresRegistration: boolean
  coverUrl: string | null
  galleryUrls: string[]
  ticketTypes: TicketTypeDraft[]
  status: EventStatus
}

export type OrganizerEventListItem = {
  event_id: number
  title: string
  event_datetime: string
  location: string
  status: EventStatus
  price: number
  cover_image_url: string | null
  categories: { id: number; name: string }[]
  ticket_types_count: number
}

export type OrganizerEventDetail = {
  event_id: number
  title: string
  description: string
  location: string
  address_detail: string
  event_datetime: string
  status: EventStatus
  price: number
  cover_image_url: string | null
  gallery_urls: string[]
  latitude: number | null
  longitude: number | null
  is_for_children: boolean
  age_rating_min: number
  requires_registration: boolean
  organizer_name: string
  category_ids: number[]
  categories: { id: number; name: string }[]
  ticket_types: { id: number; name: string; price: number; quantity: number; sort_order: number }[]
}

export const EMPTY_EVENT_DRAFT: EventFormDraft = {
  title: '',
  description: '',
  categoryIds: [],
  isForChildren: false,
  ageRatingMin: 12,
  date: '',
  time: '08:00',
  location: '',
  addressDetail: '',
  latitude: null,
  longitude: null,
  requiresRegistration: true,
  coverUrl: null,
  galleryUrls: [],
  ticketTypes: [{ name: '', price: '', quantity: '' }],
  status: 'draft'
}
