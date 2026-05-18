export type City = {
  id: string
  name: string
  lat: number
  lon: number
  zoom: number
}

/** Радиус показа событий от центра города (м). */
export const CITY_VIEW_RADIUS_M = 150_000

export const CITIES: City[] = [
  { id: 'moscow', name: 'Москва', lat: 55.7558, lon: 37.6173, zoom: 11 },
  { id: 'spb', name: 'Санкт-Петербург', lat: 59.9343, lon: 30.3351, zoom: 11 },
  { id: 'kazan', name: 'Казань', lat: 55.7963, lon: 49.1088, zoom: 11 },
  { id: 'ekb', name: 'Екатеринбург', lat: 56.8389, lon: 60.6057, zoom: 11 },
  { id: 'novosibirsk', name: 'Новосибирск', lat: 55.0084, lon: 82.9357, zoom: 11 },
  { id: 'nn', name: 'Нижний Новгород', lat: 56.2965, lon: 43.9361, zoom: 11 },
]

export const DEFAULT_CITY_ID = 'moscow'

export function getCityById(id: string): City {
  return CITIES.find((c) => c.id === id) ?? CITIES[0]
}

export function haversineMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
  return R * c
}

export function detectNearestCityId(lat: number, lon: number): string {
  let best = CITIES[0]
  let bestDist = Infinity
  for (const city of CITIES) {
    const d = haversineMeters({ lat, lon }, city)
    if (d < bestDist) {
      bestDist = d
      best = city
    }
  }
  return best.id
}

export function eventInCity(
  lat: number | undefined,
  lon: number | undefined,
  city: City,
  radiusM = CITY_VIEW_RADIUS_M
): boolean {
  if (typeof lat !== 'number' || typeof lon !== 'number') return city.id === DEFAULT_CITY_ID
  return haversineMeters(city, { lat, lon }) <= radiusM
}

/** Yandex Maps v3 bounds → строка для API каталога (minLon,minLat,maxLon,maxLat). */
export function boundsToParam(bounds: [[number, number], [number, number]]): string {
  const [[lon1, lat1], [lon2, lat2]] = bounds
  const minLon = Math.min(lon1, lon2)
  const maxLon = Math.max(lon1, lon2)
  const minLat = Math.min(lat1, lat2)
  const maxLat = Math.max(lat1, lat2)
  return `${minLon},${minLat},${maxLon},${maxLat}`
}
