export type Category = { id: number; name: string }

export type ApiEventItem = {
  event_id: number
  title: string
  event_datetime: string
  location: string
  price: number
  average_rating?: number | null
  cover_image_url?: string | null
  latitude?: number | null
  longitude?: number | null
  distance?: number | null
  is_for_children?: boolean
  age_rating_min?: number
  categories: Category[]
}

export type EventsResponse = {
  total: number
  items: ApiEventItem[]
}

export type ApiTicketType = {
  id: number
  name: string
  price: number
  quantity: number
}

export type ApiEventDetail = ApiEventItem & {
  description: string
  address_detail: string
  organizer_id?: number | null
  organizer_name: string
  status?: string
  gallery_urls: string[]
  participants_count: number
  requires_registration?: boolean
  ticket_types?: ApiTicketType[]
}

