import { create } from 'zustand'
import { CITIES, DEFAULT_CITY_ID, detectNearestCityId, getCityById, type City } from '../lib/cities'
import { reverseGeocodeCity } from '../lib/yandexGeocoder'

const CITY_STORAGE_KEY = 'point:selectedCity'
const MANUAL_CITY_KEY = 'point:cityManual'

function isCity(value: unknown): value is City {
  if (!value || typeof value !== 'object') return false
  const c = value as City
  return (
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    typeof c.lat === 'number' &&
    typeof c.lon === 'number' &&
    typeof c.zoom === 'number'
  )
}

function readStoredCity(): City | null {
  try {
    const raw = localStorage.getItem(CITY_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isCity(parsed) ? parsed : null
  } catch {
    return null
  }
}

function hasManualCityChoice(): boolean {
  try {
    return localStorage.getItem(MANUAL_CITY_KEY) === '1'
  } catch {
    return false
  }
}

type CityState = {
  city: City
  cityId: string
  geoDetected: boolean
  hydrated: boolean
  setCity: (city: City, manual?: boolean) => void
  hydrate: () => void
  detectCityFromGeolocation: () => void
}

export const useCityStore = create<CityState>((set, get) => ({
  city: getCityById(DEFAULT_CITY_ID),
  cityId: DEFAULT_CITY_ID,
  geoDetected: false,
  hydrated: false,

  setCity: (city, manual = true) => {
    set({ city, cityId: city.id, geoDetected: !manual })
    try {
      localStorage.setItem(CITY_STORAGE_KEY, JSON.stringify(city))
      if (manual) localStorage.setItem(MANUAL_CITY_KEY, '1')
    } catch {
      // ignore
    }
  },

  hydrate: () => {
    if (get().hydrated) return
    const stored = readStoredCity()
    const city = stored ?? getCityById(DEFAULT_CITY_ID)
    set({
      city,
      cityId: city.id,
      hydrated: true,
      geoDetected: stored !== null && !hasManualCityChoice(),
    })
  },

  detectCityFromGeolocation: () => {
    if (!('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        let city: City | null = null
        try {
          city = await reverseGeocodeCity(latitude, longitude)
        } catch {
          city = null
        }
        if (!city) {
          city = getCityById(detectNearestCityId(latitude, longitude))
        }

        if (!hasManualCityChoice()) {
          set({ city, cityId: city.id, geoDetected: true })
          try {
            localStorage.setItem(CITY_STORAGE_KEY, JSON.stringify(city))
            localStorage.removeItem(MANUAL_CITY_KEY)
          } catch {
            // ignore
          }
        } else {
          set({ geoDetected: true })
        }
      },
      () => {},
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 120_000 }
    )
  },
}))

export function presetCityOptions() {
  return CITIES.map((c) => ({ value: c.id, label: c.name, city: c }))
}
