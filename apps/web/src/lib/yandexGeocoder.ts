import { env } from './env'
import { CITIES, type City } from './cities'

const GEOCODER_URL = 'https://geocode-maps.yandex.ru/v1/'

const CITY_KINDS = new Set(['locality', 'province', 'area', 'district', 'region'])

type GeoResponse = {
  response?: {
    GeoObjectCollection?: {
      featureMember?: Array<{
        GeoObject?: {
          name?: string
          description?: string
          Point?: { pos?: string }
          metaDataProperty?: {
            GeocoderMetaData?: {
              kind?: string
              text?: string
              precision?: string
              Address?: {
                Components?: Array<{ kind?: string; name?: string }>
              }
            }
          }
        }
      }>
    }
  }
}

type YandexGeoObject = NonNullable<
  NonNullable<NonNullable<GeoResponse['response']>['GeoObjectCollection']>['featureMember']
>[number]['GeoObject']

function parsePos(pos: string): { lat: number; lon: number } | null {
  const parts = pos.trim().split(/\s+/)
  if (parts.length < 2) return null
  const lon = Number(parts[0])
  const lat = Number(parts[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return { lat, lon }
}

function cityNameFromGeoObject(geo: YandexGeoObject) {
  if (!geo) return 'Город'
  const meta = geo.metaDataProperty?.GeocoderMetaData
  const components = meta?.Address?.Components ?? []
  const locality = components.find((c) => c.kind === 'locality')?.name
  const province = components.find((c) => c.kind === 'province')?.name
  if (locality) return locality
  if (geo.name) return geo.name
  if (province) return province
  const text = meta?.text ?? ''
  return text.split(',')[0]?.trim() || 'Город'
}

function geoObjectToCity(geo: YandexGeoObject): City | null {
  const pos = geo?.Point?.pos
  if (!pos) return null
  const coords = parsePos(pos)
  if (!coords) return null
  const name = cityNameFromGeoObject(geo)
  const preset = CITIES.find((c) => c.name === name)
  if (preset) return preset
  return {
    id: `ygeo:${coords.lat.toFixed(4)}:${coords.lon.toFixed(4)}`,
    name,
    lat: coords.lat,
    lon: coords.lon,
    zoom: 11,
  }
}

async function fetchGeocoder(params: Record<string, string>, signal?: AbortSignal): Promise<GeoResponse> {
  const apikey = env().YANDEX_MAPS_API_KEY
  if (!apikey) throw new Error('VITE_YANDEX_MAPS_API_KEY не задан')

  const url = new URL(GEOCODER_URL)
  url.searchParams.set('apikey', apikey)
  url.searchParams.set('lang', 'ru_RU')
  url.searchParams.set('format', 'json')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url.toString(), { signal })
  if (!res.ok) throw new Error(`Геокодер: HTTP ${res.status}`)
  return (await res.json()) as GeoResponse
}

export async function searchCitiesByGeocoder(query: string, signal?: AbortSignal): Promise<City[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const data = await fetchGeocoder({ geocode: q, results: '10' }, signal)
  const members = data.response?.GeoObjectCollection?.featureMember ?? []
  const seen = new Set<string>()
  const out: City[] = []

  for (const m of members) {
    const geo = m.GeoObject
    if (!geo) continue
    const kind = geo.metaDataProperty?.GeocoderMetaData?.kind
    if (kind && !CITY_KINDS.has(kind)) continue
    const city = geoObjectToCity(geo)
    if (!city || seen.has(city.id)) continue
    seen.add(city.id)
    out.push(city)
  }

  return out
}

export async function reverseGeocodeCity(lat: number, lon: number, signal?: AbortSignal): Promise<City | null> {
  const data = await fetchGeocoder(
    { geocode: `${lon},${lat}`, results: '1', kind: 'locality' },
    signal
  )
  const geo = data.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject
  return geo ? geoObjectToCity(geo) : null
}

export type VenueAddress = {
  venueName: string
  address: string
}

type AddressComponent = { kind?: string; name?: string }

function stripPrefix(value: string, prefixes: RegExp) {
  return value.replace(prefixes, '').trim()
}

function formatRussianAddress(components: AddressComponent[]): string {
  const locality = components.find((c) => c.kind === 'locality')?.name
  const street = components.find((c) => c.kind === 'street')?.name
  const house = components.find((c) => c.kind === 'house')?.name

  const parts: string[] = []
  if (locality) {
    const city = stripPrefix(locality, /^г\.?\s*/i)
    parts.push(`г ${city}`)
  }
  if (street) {
    const s = stripPrefix(street, /^ул\.?\s*/i)
    parts.push(`ул ${s}`)
  }
  if (house) {
    const h = stripPrefix(house, /^д\.?\s*/i)
    parts.push(`д ${h}`)
  }
  return parts.join(', ')
}

function isHouseNumber(name: string) {
  return /^\d+[а-яa-z0-9\-/]*$/i.test(name.trim())
}

function isPoiKind(kind: string, name: string) {
  if (!name || isHouseNumber(name)) return false
  if (kind === 'vegetation' || kind === 'metro' || kind === 'airport' || kind === 'hydro') return true
  return kind !== 'house' && kind !== 'street' && kind !== 'locality' && kind !== 'district' && kind !== 'area'
}

/** Обратное геокодирование: название площадки (парк, бар…) и адрес (г …, ул …, д …). */
export async function reverseGeocodeVenue(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<VenueAddress | null> {
  const data = await fetchGeocoder({ geocode: `${lon},${lat}`, results: '7' }, signal)
  const members = data.response?.GeoObjectCollection?.featureMember ?? []
  if (!members.length) return null

  let venueName = ''
  let address = ''

  for (const m of members) {
    const geo = m.GeoObject
    if (!geo) continue
    const meta = geo.metaDataProperty?.GeocoderMetaData
    const kind = meta?.kind ?? ''
    const name = (geo.name ?? '').trim()
    const components = meta?.Address?.Components ?? []
    const formatted = formatRussianAddress(components)

    if (!venueName && isPoiKind(kind, name)) venueName = name
    if (!address && formatted) address = formatted
    if (!address && kind === 'house' && formatted) address = formatted
  }

  const primary = members[0]?.GeoObject
  const primaryMeta = primary?.metaDataProperty?.GeocoderMetaData
  const primaryComponents = primaryMeta?.Address?.Components ?? []
  const fullText = (primaryMeta?.text ?? '').trim()

  if (!address) {
    address = formatRussianAddress(primaryComponents) || fullText
  }

  if (!venueName) {
    const primaryName = (primary?.name ?? '').trim()
    const primaryKind = primaryMeta?.kind ?? ''
    if (isPoiKind(primaryKind, primaryName)) venueName = primaryName
  }

  if (!venueName) venueName = 'Выбранная площадка'

  return { venueName, address }
}
