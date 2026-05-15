import { useEffect, useMemo, useRef, useState } from 'react'
import { CITIES, type City } from '../lib/cities'
import { searchCitiesByGeocoder } from '../lib/yandexGeocoder'
import { presetCityOptions, useCityStore } from '../stores/cityStore'
import { PointDropdown, type PointDropdownOption } from './PointDropdown'

function CityFlagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="16" viewBox="0 0 14 16" aria-hidden>
      <path
        fill="currentColor"
        d="M1 0h2.2c.5 0 .9.3 1 .8L5 3.5 6.8.8c.1-.5.5-.8 1-.8H10v14.5c0 .6-.7 1-1.2.7L7 13.2 4.2 15.2c-.5.3-1.2-.1-1.2-.7V0Z"
      />
    </svg>
  )
}

type Props = {
  variant: 'sidebar' | 'light'
  className?: string
  showLabel?: boolean
}

const PRESET_BY_ID = new Map(CITIES.map((c) => [c.id, c]))

export function CitySelect({ variant, className, showLabel }: Props) {
  const city = useCityStore((s) => s.city)
  const geoDetected = useCityStore((s) => s.geoDetected)
  const setCity = useCityStore((s) => s.setCity)

  const cityByValueRef = useRef(new Map<string, City>())
  const [remoteOptions, setRemoteOptions] = useState<PointDropdownOption<string>[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const presetOptions = useMemo(() => {
    const opts = presetCityOptions()
    for (const o of opts) cityByValueRef.current.set(o.value, o.city)
    return opts.map(({ value, label }) => ({ value, label }))
  }, [])

  useEffect(() => {
    cityByValueRef.current.set(city.id, city)
  }, [city])

  const options = useMemo(() => {
    const seen = new Set<string>()
    const out: PointDropdownOption<string>[] = []
    const showPresets = searchQuery.trim().length === 0
    for (const o of presetOptions) {
      if (!showPresets) continue
      if (seen.has(o.value)) continue
      seen.add(o.value)
      out.push(o)
    }
    for (const o of remoteOptions) {
      if (seen.has(o.value)) continue
      seen.add(o.value)
      out.push(o)
    }
    if (!seen.has(city.id)) {
      out.unshift({ value: city.id, label: city.name })
    }
    return out
  }, [presetOptions, remoteOptions, city.id, city.name, searchQuery])

  const onChange = (id: string) => {
    const picked = cityByValueRef.current.get(id) ?? PRESET_BY_ID.get(id)
    if (picked) setCity(picked, true)
  }

  const dropdown = (
    <PointDropdown
      className={className}
      variant={variant}
      ariaLabel="Выбор города"
      options={options}
      value={city.id}
      onChange={onChange}
      labelOverride={city.name}
      searchable
      searchLocally={false}
      onSearchQuery={async (query) => {
        setSearchQuery(query)
        const q = query.trim()
        if (q.length < 2) {
          setRemoteOptions([])
          setSearchLoading(false)
          return
        }
        setSearchLoading(true)
        try {
          const cities = await searchCitiesByGeocoder(q)
          for (const c of cities) cityByValueRef.current.set(c.id, c)
          setRemoteOptions(cities.map((c) => ({ value: c.id, label: c.name })))
        } catch {
          setRemoteOptions([])
        } finally {
          setSearchLoading(false)
        }
      }}
      searchLoading={searchLoading}
      searchPlaceholder="Поиск города"
      triggerPrefix={
        <span className={variant === 'sidebar' ? 'sidebarCityFlag' : 'homeCityFlag'}>
          <CityFlagIcon className={variant === 'sidebar' ? 'sidebarCityFlagIcon' : 'homeCityFlagIcon'} />
        </span>
      }
    />
  )

  if (!showLabel) {
    return (
      <>
        {dropdown}
        {geoDetected ? <span className="sr-only">Город определён по геолокации</span> : null}
      </>
    )
  }

  return (
    <div className="homeCitySelect">
      <span className="homeCitySelectLabel">Город</span>
      {dropdown}
    </div>
  )
}
