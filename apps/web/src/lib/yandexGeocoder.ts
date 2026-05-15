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
