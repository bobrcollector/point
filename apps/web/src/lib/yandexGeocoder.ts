import { CITIES, type City } from './cities'
import { loadYandexMaps, type YmapsGeoObject } from './yandexMapsLoader'

const CITY_KINDS = new Set(['locality', 'province', 'area', 'district', 'region'])

function cityNameFromGeoObject(geo: YmapsGeoObject) {
  const meta = geo.properties.get('metaDataProperty') as
    | { GeocoderMetaData?: { text?: string; Address?: { Components?: Array<{ kind?: string; name?: string }> } } }
    | undefined
  const components = meta?.GeocoderMetaData?.Address?.Components ?? []
  const locality = components.find((c) => c.kind === 'locality')?.name
  const province = components.find((c) => c.kind === 'province')?.name
  const name = geo.properties.get('name') as string | undefined
  if (locality) return locality
  if (name) return name
  if (province) return province
  const text = meta?.GeocoderMetaData?.text ?? ''
  return text.split(',')[0]?.trim() || 'Город'
}

function geoObjectToCity(geo: YmapsGeoObject): City | null {
  const coords = geo.geometry.getCoordinates()
  if (!coords || coords.length < 2) return null
  const [lat, lon] = coords
  const name = cityNameFromGeoObject(geo)
  const preset = CITIES.find((c) => c.name === name)
  if (preset) return preset
  return {
    id: `ygeo:${lat.toFixed(4)}:${lon.toFixed(4)}`,
    name,
    lat,
    lon,
    zoom: 11,
  }
}

function geocoderMeta(geo: YmapsGeoObject) {
  return geo.properties.get('metaDataProperty') as
    | { GeocoderMetaData?: { kind?: string; text?: string; Address?: { Components?: Array<{ kind?: string; name?: string }> } } }
    | undefined
}

async function runGeocode(
  query: string | number[],
  options: Record<string, unknown>,
  signal?: AbortSignal
): Promise<YmapsGeoObject[]> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const ymaps = await loadYandexMaps()
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'))
    signal?.addEventListener('abort', onAbort, { once: true })

    ymaps
      .geocode(query, options)
      .then((res) => {
        signal?.removeEventListener('abort', onAbort)
        const out: YmapsGeoObject[] = []
        res.geoObjects.each((geo) => out.push(geo))
        resolve(out)
      })
      .catch((err) => {
        signal?.removeEventListener('abort', onAbort)
        reject(err instanceof Error ? err : new Error('Ошибка геокодера'))
      })
  })
}

export async function searchCitiesByGeocoder(query: string, signal?: AbortSignal): Promise<City[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const members = await runGeocode(q, { results: 10 }, signal)
  const seen = new Set<string>()
  const out: City[] = []

  for (const geo of members) {
    const kind = geocoderMeta(geo)?.GeocoderMetaData?.kind
    if (kind && !CITY_KINDS.has(kind)) continue
    const city = geoObjectToCity(geo)
    if (!city || seen.has(city.id)) continue
    seen.add(city.id)
    out.push(city)
  }

  return out
}

export async function reverseGeocodeCity(lat: number, lon: number, signal?: AbortSignal): Promise<City | null> {
  const members = await runGeocode([lat, lon], { results: 1, kind: 'locality' }, signal)
  return members[0] ? geoObjectToCity(members[0]) : null
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
  const members = await runGeocode([lat, lon], { results: 7 }, signal)
  if (!members.length) return null

  let venueName = ''
  let address = ''

  for (const geo of members) {
    const meta = geocoderMeta(geo)?.GeocoderMetaData
    const kind = meta?.kind ?? ''
    const name = String(geo.properties.get('name') ?? '').trim()
    const components = meta?.Address?.Components ?? []
    const formatted = formatRussianAddress(components)

    if (!venueName && isPoiKind(kind, name)) venueName = name
    if (!address && formatted) address = formatted
    if (!address && kind === 'house' && formatted) address = formatted
  }

  const primary = members[0]
  const primaryMeta = geocoderMeta(primary)?.GeocoderMetaData
  const primaryComponents = primaryMeta?.Address?.Components ?? []
  const fullText = (primaryMeta?.text ?? '').trim()

  if (!address) {
    address = formatRussianAddress(primaryComponents) || fullText
  }

  if (!venueName) {
    const primaryName = String(primary.properties.get('name') ?? '').trim()
    const primaryKind = primaryMeta?.kind ?? ''
    if (isPoiKind(primaryKind, primaryName)) venueName = primaryName
  }

  if (!venueName) venueName = 'Выбранная площадка'

  return { venueName, address }
}
