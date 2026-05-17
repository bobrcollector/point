import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { HomeCitySelect } from '../components/HomeCitySelect'
import { IconFeed, IconMap, IconSliders, IconX } from '../components/NavGlyphs'
import type { AgeRatingMin } from '../features/catalog/ageRatings'
import { normalizeCategoryName } from '../features/catalog/categoryGroups'
import { AgeRatingBadge } from '../components/AgeRatingBadge'
import { eventInCity, haversineMeters } from '../lib/cities'
import { useCityStore } from '../stores/cityStore'
import { useCategories, useEvents } from '../features/catalog/queries'
import { YandexMap } from '../widgets/YandexMap'
import {
  DEFAULT_HOME_FILTERS,
  homeFiltersDifferFromDefaults,
  HomePageFiltersPanel,
  type HomeFilters,
} from './HomePageFiltersPanel'

type EventItem = {
  id: string
  title: string
  date: string
  place: string
  price: number
  rating?: number
  coverUrl?: string
  lat?: number
  lon?: number
  categories?: string[]
  distanceMeters?: number
  ageRatingMin?: number
}

type Filters = HomeFilters

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

export function HomePage() {
  const [view, setView] = useState<'list' | 'map'>('list')
  const [filtersPanelOpen, setFiltersPanelOpen] = useState(false)
  const filterPanelId = useId()
  const city = useCityStore((s) => s.city)
  const [filters, setFilters] = useState<Filters>({ q: '', ...DEFAULT_HOME_FILTERS })
  const [activeSlide, setActiveSlide] = useState(0)
  const [selectedMapEventId, setSelectedMapEventId] = useState<string | null>(null)
  const heroTrackRef = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const lastWheelAtRef = useRef(0)
  /** Пока true — не перезаписываем activeSlide из события scroll (иначе ломается smooth scroll / автолистание). */
  const suppressScrollSyncRef = useRef(false)
  const suppressScrollSyncTimerRef = useRef<number | undefined>(undefined)
  /** Пока пользователь тянет слайдер мышью — не синхронизируем индекс из scroll и не дергаем программный scrollTo. */
  const isDraggingHeroRef = useRef(false)

  const toolbarRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const location = useLocation()
  const heroUserInteractedRef = useRef(false)
  const heroPointerInsideSpotlightRef = useRef(false)

  const filtersApplied = useMemo(() => homeFiltersDifferFromDefaults(filters), [filters])

  const activeFiltersHint = useMemo(() => {
    const parts: string[] = []
    if (filters.q.trim()) parts.push(`поиск: «${filters.q.trim()}»`)
    if (filters.categories.length) parts.push(`категории: ${filters.categories.join(', ')}`)
    if (filters.ageRatings.length) {
      parts.push(`возраст: ${filters.ageRatings.map((a) => `${a}+`).join(', ')}`)
    }
    if (filters.onlyFree) parts.push('бесплатно')
    else {
      if (filters.priceMin.trim()) parts.push(`от ${filters.priceMin} ₽`)
      if (filters.priceMax.trim()) parts.push(`до ${filters.priceMax} ₽`)
    }
    if (filters.sort !== DEFAULT_HOME_FILTERS.sort) {
      const sortLabels: Record<HomeFilters['sort'], string> = {
        rank: 'по интересам',
        date: 'по дате',
        distance: 'по расстоянию',
        rating: 'по рейтингу',
      }
      parts.push(sortLabels[filters.sort])
    }
    return parts.length ? parts.join(' · ') : null
  }, [filters])

  const categoriesQuery = useCategories()

  const categoryIdByName = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of categoriesQuery.data ?? []) {
      map.set(c.name, c.id)
      map.set(normalizeCategoryName(c.name), c.id)
    }
    return map
  }, [categoriesQuery.data])

  const selectedCategoryIds = useMemo(() => {
    if (!filters.categories.length) return undefined
    const ids = filters.categories
      .map((name) => categoryIdByName.get(name))
      .filter((id): id is number => id !== undefined)
    return ids.length ? ids.join(',') : undefined
  }, [filters.categories, categoryIdByName])

  const priceMinParam = filters.onlyFree
    ? 0
    : filters.priceMin.trim() !== ''
      ? Number(filters.priceMin)
      : undefined
  const priceMaxParam = filters.onlyFree
    ? 0
    : filters.priceMax.trim() !== ''
      ? Number(filters.priceMax)
      : undefined

  useEffect(() => {
    if (location.hash !== '#home-search') return
    const id = window.setTimeout(() => {
      toolbarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      searchInputRef.current?.focus({ preventScroll: true })
    }, 120)
    return () => window.clearTimeout(id)
  }, [location.hash])

  useEffect(() => {
    if (!filtersPanelOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFiltersPanelOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [filtersPanelOpen])

  // bounds не передаём в API: иначе бэкенд отсекает события без lat/lon и всё вне рамки —
  // лента тогда полная, а на карте пусто. Маркеры строим из тех же items, что и лента.
  const eventsQuery = useEvents({
    lat: city.lat,
    lon: city.lon,
    category_ids: selectedCategoryIds,
    price_min: Number.isFinite(priceMinParam) ? priceMinParam : undefined,
    price_max: Number.isFinite(priceMaxParam) ? priceMaxParam : undefined,
    age_ratings: filters.ageRatings.length ? filters.ageRatings.join(',') : undefined,
    limit: 100,
    offset: 0,
    sort_by: filters.sort === 'rank' ? 'distance' : filters.sort,
  })

  /** Слайдер — топ событий города, без учёта фильтров ленты. */
  const spotlightQuery = useEvents({
    lat: city.lat,
    lon: city.lon,
    limit: 30,
    offset: 0,
    sort_by: 'rating',
  })

  const rawEvents: EventItem[] = useMemo(() => {
    const items = eventsQuery.data?.items ?? []
    return items
      .filter((it) => eventInCity(it.latitude ?? undefined, it.longitude ?? undefined, city))
      .map((it) => ({
      id: String(it.event_id),
      title: it.title,
      date: it.event_datetime,
      place: it.location,
      price: it.price,
      rating: it.average_rating ?? undefined,
      coverUrl: it.cover_image_url ?? undefined,
      categories: it.categories?.map((c) => normalizeCategoryName(c.name)) ?? [],
      lat: it.latitude ?? undefined,
      lon: it.longitude ?? undefined,
      distanceMeters: typeof it.distance === 'number' ? it.distance : undefined,
      ageRatingMin: it.age_rating_min,
    }))
  }, [eventsQuery.data?.items, city])

  const spotlightEvents: EventItem[] = useMemo(() => {
    const items = spotlightQuery.data?.items ?? []
    return items
      .filter((it) => eventInCity(it.latitude ?? undefined, it.longitude ?? undefined, city))
      .slice(0, 8)
      .map((it) => ({
        id: String(it.event_id),
        title: it.title,
        date: it.event_datetime,
        place: it.location,
        price: it.price,
        rating: it.average_rating ?? undefined,
        coverUrl: it.cover_image_url ?? undefined,
        categories: it.categories?.map((c) => normalizeCategoryName(c.name)) ?? [],
        lat: it.latitude ?? undefined,
        lon: it.longitude ?? undefined,
        distanceMeters: typeof it.distance === 'number' ? it.distance : undefined,
        ageRatingMin: it.age_rating_min,
      }))
  }, [spotlightQuery.data?.items, city])

  const [userInterests] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('point:userInterests')
      const parsed = raw ? (JSON.parse(raw) as unknown) : null
      if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string').map(normalizeCategoryName)
      return ['Концерты', 'Настолки']
    } catch {
      return ['Концерты', 'Настолки']
    }
  })

  const toggleCategory = (name: string) => {
    setFilters((s) => ({
      ...s,
      categories: s.categories.includes(name)
        ? s.categories.filter((c) => c !== name)
        : [...s.categories, name],
    }))
  }

  const prepared = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    const refPoint = { lat: city.lat, lon: city.lon }

    const items = rawEvents
      .map((e) => {
        let distance = e.distanceMeters
        if (typeof distance !== 'number' && typeof e.lat === 'number' && typeof e.lon === 'number') {
          distance = haversineMeters(refPoint, { lat: e.lat, lon: e.lon })
        }

        const rating = e.rating ?? 0
        const interestHit = e.categories?.some((c) => userInterests.includes(c)) ? 1 : 0

        const distanceNorm = typeof distance === 'number' ? clamp01(1 - distance / 10_000) : 0.2
        const ratingNorm = clamp01(rating / 5)
        const score = 0.55 * interestHit + 0.3 * distanceNorm + 0.15 * ratingNorm

        return { ...e, distanceMeters: distance, _score: score }
      })
      .filter((e) => {
        if (filters.categories.length) {
          const cats = e.categories ?? []
          if (!cats.some((c) => filters.categories.includes(c))) return false
        }
        if (filters.ageRatings.length) {
          const age = e.ageRatingMin
          if (age === undefined || !filters.ageRatings.includes(age as AgeRatingMin)) return false
        }
        if (!q) return true
        const hay = [e.title, e.place, ...(e.categories ?? [])]
          .join(' ')
          .trim()
          .toLowerCase()
        return hay.includes(q)
      })

    const sorted = [...items]
    sorted.sort((a, b) => {
      if (filters.sort === 'date') return +new Date(a.date) - +new Date(b.date)
      if (filters.sort === 'rating') return (b.rating ?? 0) - (a.rating ?? 0)
      if (filters.sort === 'distance')
        return (a.distanceMeters ?? Number.POSITIVE_INFINITY) - (b.distanceMeters ?? Number.POSITIVE_INFINITY)
      return (b._score ?? 0) - (a._score ?? 0)
    })

    return { items: sorted, total: items.length }
  }, [filters, city, rawEvents, userInterests])

  const featured = spotlightEvents
  const slideCount = featured.length

  useEffect(() => {
    setActiveSlide(0)
  }, [city.id, slideCount])
  const normalizedSlide = slideCount ? activeSlide % slideCount : 0
  const selectedMapEvent = useMemo(() => {
    if (view !== 'map') return null
    return prepared.items.find((item) => item.id === selectedMapEventId) ?? null
  }, [prepared.items, selectedMapEventId, view])

  const debouncedQAnim = useDebouncedValue(filters.q, 320)
  const animKey = [
    debouncedQAnim,
    filters.categories.join(','),
    filters.onlyFree,
    filters.ageRatings.join(','),
    filters.priceMin,
    filters.priceMax,
    filters.sort,
    city.id,
  ].join('|')

  const [listDisplayed, setListDisplayed] = useState<EventItem[]>(() => prepared.items)
  const [listFading, setListFading] = useState(false)
  const prevAnimKeyRef = useRef<string | null>(null)
  const fadeTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- двухфазное обновление ленты (fade) при смене фильтров */
    if (view !== 'list') {
      setListDisplayed(prepared.items)
      setListFading(false)
      return
    }
    if (prevAnimKeyRef.current === null) {
      prevAnimKeyRef.current = animKey
      setListDisplayed(prepared.items)
      return
    }
    if (prevAnimKeyRef.current === animKey) {
      setListDisplayed(prepared.items)
      return
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      prevAnimKeyRef.current = animKey
      setListDisplayed(prepared.items)
      return
    }
    window.clearTimeout(fadeTimerRef.current)
    setListFading(true)
    fadeTimerRef.current = window.setTimeout(() => {
      prevAnimKeyRef.current = animKey
      setListDisplayed(prepared.items)
      setListFading(false)
    }, 200)
    return () => {
      window.clearTimeout(fadeTimerRef.current)
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [animKey, view, prepared.items])

  useEffect(() => {
    if (slideCount <= 1) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => {
      if (isDraggingHeroRef.current) return
      if (heroUserInteractedRef.current && heroPointerInsideSpotlightRef.current) return
      setActiveSlide((prev) => (prev + 1) % slideCount)
    }, 8000)
    return () => window.clearInterval(timer)
  }, [slideCount])

  const beginSuppressScrollSync = (durationMs = 500) => {
    window.clearTimeout(suppressScrollSyncTimerRef.current)
    suppressScrollSyncRef.current = true
    suppressScrollSyncTimerRef.current = window.setTimeout(() => {
      suppressScrollSyncRef.current = false
    }, durationMs)
  }

  useEffect(() => {
    const track = heroTrackRef.current
    if (!track || slideCount <= 1) return
    if (isDraggingHeroRef.current) return

    beginSuppressScrollSync(550)

    const applyScroll = () => {
      const slideWidth = track.clientWidth
      if (!slideWidth) {
        requestAnimationFrame(applyScroll)
        return
      }
      track.scrollTo({ left: normalizedSlide * slideWidth, behavior: 'smooth' })
    }
    requestAnimationFrame(applyScroll)

    const onScrollEnd = () => {
      suppressScrollSyncRef.current = false
      window.clearTimeout(suppressScrollSyncTimerRef.current)
    }
    track.addEventListener('scrollend', onScrollEnd)

    return () => {
      track.removeEventListener('scrollend', onScrollEnd)
      window.clearTimeout(suppressScrollSyncTimerRef.current)
    }
  }, [normalizedSlide, slideCount])

  useEffect(() => {
    const track = heroTrackRef.current
    if (!track || slideCount <= 1) return
    const onScroll = () => {
      if (isDraggingHeroRef.current) return
      if (suppressScrollSyncRef.current) return
      const width = track.clientWidth
      if (!width) return
      const nextIndex = Math.round(track.scrollLeft / width)
      if (nextIndex >= 0 && nextIndex < slideCount) {
        if (!suppressScrollSyncRef.current) {
          heroUserInteractedRef.current = true
        }
        setActiveSlide(nextIndex)
      }
    }
    track.addEventListener('scroll', onScroll, { passive: true })
    return () => track.removeEventListener('scroll', onScroll)
  }, [slideCount])

  useEffect(() => {
    const track = heroTrackRef.current
    if (!track || slideCount <= 1) return

    let isPointerDown = false
    let activePointerId: number | null = null
    let startX = 0
    let startLeft = 0
    let lastX = 0
    let lastMoveTime = 0
    let lastVx = 0

    const applySnapEnd = (vx: number) => {
      isDraggingHeroRef.current = false
      track.classList.remove('isDragging')

      const width = track.clientWidth
      if (!width) return

      const progress = track.scrollLeft / width
      let target = Math.round(progress)
      if (vx < -0.35) target = Math.ceil(progress)
      else if (vx > 0.35) target = Math.floor(progress)

      const clamped = Math.max(0, Math.min(slideCount - 1, target))
      heroUserInteractedRef.current = true
      beginSuppressScrollSync(550)
      track.scrollTo({ left: clamped * width, behavior: 'smooth' })
      setActiveSlide(clamped)
    }

    const finishDrag = (e: PointerEvent) => {
      if (!isPointerDown || e.pointerId !== activePointerId) return
      isPointerDown = false
      activePointerId = null
      try {
        if (track.hasPointerCapture(e.pointerId)) track.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      applySnapEnd(lastVx)
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      const target = e.target
      if (target instanceof Element && target.closest('a, button')) return
      e.preventDefault()
      isPointerDown = true
      isDraggingHeroRef.current = true
      activePointerId = e.pointerId
      startX = e.clientX
      lastX = e.clientX
      lastMoveTime = performance.now()
      lastVx = 0
      startLeft = track.scrollLeft
      track.classList.add('isDragging')
      try {
        track.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!isPointerDown || e.pointerId !== activePointerId) return
      e.preventDefault()
      const now = performance.now()
      const dt = now - lastMoveTime
      if (dt > 0) lastVx = (e.clientX - lastX) / dt
      lastX = e.clientX
      lastMoveTime = now
      const dx = e.clientX - startX
      track.scrollLeft = startLeft - dx
    }

    const onLostCapture = (ev: PointerEvent) => {
      if (!isPointerDown || ev.pointerId !== activePointerId) return
      isPointerDown = false
      activePointerId = null
      applySnapEnd(lastVx)
    }

    track.addEventListener('pointerdown', onPointerDown)
    track.addEventListener('pointermove', onPointerMove)
    track.addEventListener('pointerup', finishDrag)
    track.addEventListener('pointercancel', finishDrag)
    track.addEventListener('lostpointercapture', onLostCapture)

    return () => {
      track.removeEventListener('pointerdown', onPointerDown)
      track.removeEventListener('pointermove', onPointerMove)
      track.removeEventListener('pointerup', finishDrag)
      track.removeEventListener('pointercancel', finishDrag)
      track.removeEventListener('lostpointercapture', onLostCapture)
      isDraggingHeroRef.current = false
      track.classList.remove('isDragging')
    }
  }, [slideCount])

  /** Колесо мыши / тачпад: весь блок hero, capture — чтобы Edge не уводил прокрутку на страницу. */
  useEffect(() => {
    const hero = heroRef.current
    if (!hero || slideCount <= 1) return

    const onWheel = (e: WheelEvent) => {
      if (isDraggingHeroRef.current) return
      const absX = Math.abs(e.deltaX)
      const absY = Math.abs(e.deltaY)
      const delta =
        absY > absX ? e.deltaY : absX > absY ? e.deltaX : absY > 0 ? e.deltaY : absX > 0 ? e.deltaX : 0
      if (!delta) return

      e.preventDefault()
      const now = Date.now()
      if (now - lastWheelAtRef.current < 280) return
      lastWheelAtRef.current = now
      heroUserInteractedRef.current = true
      const direction = delta > 0 ? 1 : -1
      setActiveSlide((prev) => {
        const next = prev + direction
        if (next < 0) return slideCount - 1
        if (next >= slideCount) return 0
        return next
      })
    }

    hero.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => hero.removeEventListener('wheel', onWheel, { capture: true })
  }, [slideCount])

  return (
    <div className="page homePage">
      <div className="homeShell">
        <section
          className="homeSpotlight"
          aria-label="Рекомендации и акценты"
          onPointerEnter={() => {
            heroPointerInsideSpotlightRef.current = true
          }}
          onPointerLeave={() => {
            heroPointerInsideSpotlightRef.current = false
            heroUserInteractedRef.current = false
          }}
        >
          <div ref={heroRef} className="hero">
            <div ref={heroTrackRef} className="heroTrack heroTrackSlider">
              {featured.length ? (
                featured.map((e, index) => (
                  <div key={e.id} className="heroSlide">
                    <div
                      className="heroBg"
                      style={{
                        backgroundImage: e.coverUrl ? `url(${e.coverUrl})` : undefined
                      }}
                    />
                    <div className="heroOverlay" />
                    <Link to={`/events/${e.id}`} className="heroSlideLink">
                      <div className={`heroContent ${index === normalizedSlide ? 'isActive' : ''}`}>
                        <div className="heroKicker">Сейчас в топе</div>
                        <div className="heroTitle">{e.title}</div>
                        <div className="heroMeta">
                          {new Date(e.date).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })} · {e.place}
                        </div>
                      </div>
                    </Link>
                  </div>
                ))
              ) : (
                <div className="heroSlide">
                  <div className="heroBg" />
                  <div className="heroOverlay" />
                  <div className="heroContent">
                    <div className="heroKicker">Point</div>
                    <div className="heroTitle">События рядом с вами</div>
                  </div>
                </div>
              )}
            </div>
            {slideCount > 1 ? (
              <>
                <div className="heroDots heroDotsOverlay" role="tablist" aria-label="Слайды подборки">
                  {featured.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-label={`Слайд ${index + 1}`}
                      aria-selected={index === normalizedSlide}
                      className={index === normalizedSlide ? 'heroDot active' : 'heroDot'}
                      onClick={() => {
                        heroUserInteractedRef.current = true
                        setActiveSlide(index)
                      }}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </section>

        <div ref={toolbarRef} className="homeToolbar" id="home-search">
          <div className="homeSearchRow">
            <div className="homeSearchField">
              <label className="label sr-only" htmlFor="home-event-search">
                Поиск по событиям
              </label>
              <div className="homeSearchInputWrap">
                <input
                  id="home-event-search"
                  ref={searchInputRef}
                  className={['input', 'homeSearchInput', filters.q.trim() ? 'homeSearchInputHasClear' : '']
                    .filter(Boolean)
                    .join(' ')}
                  value={filters.q}
                  onChange={(e) => setFilters((s) => ({ ...s, q: e.target.value }))}
                  placeholder="Поиск: джаз, настолки, стадион…"
                  autoComplete="off"
                />
                {filters.q.trim() ? (
                  <button
                    type="button"
                    className="homeSearchClear"
                    onClick={() => setFilters((s) => ({ ...s, q: '' }))}
                    aria-label="Очистить поиск"
                    title="Очистить поиск"
                  >
                    <IconX className="homeSearchClearIcon" />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="homeToolbarTrailing">
              <button
                type="button"
                className={[
                  'homeFilterToggle',
                  filtersPanelOpen ? 'homeFilterToggleOpen' : '',
                  filtersApplied ? 'homeFilterToggleApplied' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-expanded={filtersPanelOpen}
                aria-controls={filterPanelId}
                onClick={() => setFiltersPanelOpen((o) => !o)}
                title="Фильтры"
              >
                <IconSliders className="homeToolbarGlyph" />
                <span className="sr-only">Фильтры</span>
              </button>

              <div className="segmented homeToolbarSeg" role="group" aria-label="Режим отображения">
                <button
                  type="button"
                  className={view === 'list' ? 'segBtn active' : 'segBtn'}
                  aria-pressed={view === 'list'}
                  onClick={() => setView('list')}
                  title="Лента"
                >
                  <IconFeed className="homeToolbarGlyph" />
                  <span className="sr-only">Лента</span>
                </button>
                <button
                  type="button"
                  className={view === 'map' ? 'segBtn active' : 'segBtn'}
                  aria-pressed={view === 'map'}
                  onClick={() => setView('map')}
                  title="Карта"
                >
                  <IconMap className="homeToolbarGlyph" />
                  <span className="sr-only">Карта</span>
                </button>
              </div>
            </div>
          </div>

          {filtersPanelOpen ? (
            <HomePageFiltersPanel
              id={filterPanelId}
              filters={filters}
              filtersApplied={filtersApplied}
              onChange={(patch) => setFilters((s) => ({ ...s, ...patch }))}
              onReset={() => setFilters((s) => ({ ...s, ...DEFAULT_HOME_FILTERS }))}
              onToggleCategory={toggleCategory}
            />
          ) : null}

          <HomeCitySelect />

          <div className="homeStatus" role="status" aria-live="polite">
            {eventsQuery.isLoading ? (
              <span className="homeStatusMuted">Загружаем события…</span>
            ) : eventsQuery.isError ? null : (
              <>
                <span className="homeStatusPill">Найдено: {prepared.total}</span>
                {activeFiltersHint && (filtersApplied || filters.q.trim()) ? (
                  <span className="homeStatusMuted">{activeFiltersHint}</span>
                ) : null}
              </>
            )}
          </div>
        </div>

        {view === 'map' ? (
          <div className="mapWrap">
            <YandexMap
              center={{ lat: city.lat, lon: city.lon, zoom: city.zoom }}
              onPointClick={(point) => setSelectedMapEventId(point.id)}
              points={prepared.items
                .filter((e) => typeof e.lat === 'number' && typeof e.lon === 'number')
                .map((e) => ({
                  id: e.id,
                  title: e.title,
                  lat: e.lat as number,
                  lon: e.lon as number,
                  category: e.categories?.[0],
                  coverUrl: e.coverUrl,
                  startAt: e.date,
                  place: e.place,
                  priceLabel: e.price === 0 ? 'Бесплатно' : `${e.price} ₽`
                }))}
            />
            {selectedMapEvent ? (
              <article className="mapEventCard">
                <div
                  className="mapEventCardMedia"
                  style={{
                    backgroundImage: selectedMapEvent.coverUrl ? `url(${selectedMapEvent.coverUrl})` : undefined
                  }}
                >
                  <button
                    className="mapEventCardClose"
                    type="button"
                    onClick={() => setSelectedMapEventId(null)}
                    aria-label="Закрыть карточку события"
                  >
                    ×
                  </button>
                  <span className="mapEventCardBadges">
                    <span className="mapEventCardBadge">{selectedMapEvent.categories?.[0] ?? 'Событие'}</span>
                    <AgeRatingBadge ageRatingMin={selectedMapEvent.ageRatingMin} />
                  </span>
                </div>
                <div className="mapEventCardBody">
                  <h3 className="mapEventCardTitle">{selectedMapEvent.title}</h3>
                  <p className="mapEventCardMeta">
                    {new Date(selectedMapEvent.date).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                  <p className="mapEventCardMeta">{selectedMapEvent.place}</p>
                  <div className="mapEventCardPrice">
                    {selectedMapEvent.price === 0 ? 'Бесплатно' : `${selectedMapEvent.price} ₽`}
                  </div>
                  <div className="mapEventCardActions">
                    <Link className="mapEventCardBtn" to={`/events/${selectedMapEvent.id}`}>
                      Открыть событие
                    </Link>
                    <button
                      type="button"
                      className="mapEventCardGhost"
                      onClick={() => setSelectedMapEventId(null)}
                    >
                      Закрыть
                    </button>
                  </div>
                </div>
              </article>
            ) : null}
          </div>
        ) : (
          <>
            <div className="sectionHeader">
              <div className="sectionTitle">Подборка для вас</div>
            </div>

            {!eventsQuery.isLoading && !eventsQuery.isError && prepared.total === 0 ? (
              <div className="homeEmptySearch" role="status">
                <div className="homeEmptySearchIcon" aria-hidden>
                  🔍
                </div>
                <h3 className="homeEmptySearchTitle">Ничего не найдено</h3>
                <p className="homeEmptySearchText">
                  Попробуйте изменить поиск, категорию или сбросить фильтр «Только бесплатные» — иногда достаточно одного
                  шага, чтобы снова увидеть афишу.
                </p>
              </div>
            ) : (
              <div className={`eventGridWrap${listFading ? ' isFading' : ''}`}>
                <div className="grid">
                  {listDisplayed.map((e) => (
                    <Link key={e.id} to={`/events/${e.id}`} className="card cardAsLink">
                      <article className="cardInner">
                        <div className="cardCover" style={{ backgroundImage: e.coverUrl ? `url(${e.coverUrl})` : undefined, position: 'relative' }}>
                          <div className="cardCoverOverlay" />
                          <div className="cardTop">
                            <div className="cardTopBadges">
                              <div className="badge">{e.categories?.[0] ?? 'Событие'}</div>
                              <AgeRatingBadge ageRatingMin={e.ageRatingMin} />
                            </div>
                            <div className="rating">{e.rating ? `★ ${e.rating.toFixed(1)}` : ''}</div>
                          </div>
                        </div>

                        <div className="cardBody">
                          <div className="cardTitle">{e.title}</div>
                          <div className="muted">{new Date(e.date).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                          <div className="muted">{e.place}</div>
                          <div className="cardBottom">
                            <div className="price">{e.price === 0 ? 'Бесплатно' : `${e.price} ₽`}</div>
                            <div className="distance">
                              {typeof e.distanceMeters === 'number'
                                ? `${(e.distanceMeters / 1000).toFixed(1)} км`
                                : '—'}
                            </div>
                          </div>
                        </div>
                      </article>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <footer className="footer">
          <div className="footerGrid">
            <div className="footerCol">
              <div className="footerBrand">Point</div>
              <div className="footerText">Платформа для поиска и управления офлайн-событиями рядом с вами.</div>
            </div>
            <div className="footerCol">
              <div className="footerTitle">Разделы</div>
              <Link className="footerLink" to="/#home-search">
                Лента
              </Link>
              <Link className="footerLink" to="/favorites">
                Избранное
              </Link>
              <Link className="footerLink" to="/archive">
                Архив
              </Link>
            </div>
            <div className="footerCol">
              <div className="footerTitle">О проекте</div>
              <span className="footerLinkDisabled">О нас — скоро</span>
              <span className="footerLinkDisabled">Помощь — скоро</span>
              <span className="footerLinkDisabled">Контакты — скоро</span>
            </div>
            <div className="footerCol">
              <div className="footerTitle">Мобильное приложение</div>
              <div className="footerText">iOS · Android (план: React Native)</div>
              <div className="footerCopy">© 2026 Point</div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x))
}
