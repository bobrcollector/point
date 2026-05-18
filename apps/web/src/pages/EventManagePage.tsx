import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PointDropdown } from '../components/PointDropdown'
import { formatApiError } from '../lib/apiError'
import { reverseGeocodeVenue } from '../lib/yandexGeocoder'
import { AGE_RATINGS, type AgeRatingMin } from '../features/catalog/ageRatings'
import { CATEGORY_GROUPS, normalizeCategoryName } from '../features/catalog/categoryGroups'
import { useCategories } from '../features/catalog/queries'
import { uploadEventImage, detailToDraft } from '../features/organizer/api'
import {
  useCreateEvent,
  useDeleteEvent,
  useOrganizerEventDetail,
  usePublishEvent,
  useUpdateEvent
} from '../features/organizer/queries'
import { EMPTY_EVENT_DRAFT, type EventFormDraft } from '../features/organizer/types'
import { useCityStore } from '../stores/cityStore'
import { YandexMap, type MapPoint } from '../widgets/YandexMap'

const STEPS = ['Основное', 'Дата и место', 'Фото', 'Билеты', 'Публикация'] as const

const AGE_OPTIONS = AGE_RATINGS.map((r) => ({
  value: String(r.value),
  label: r.label,
  searchText: r.shortLabel
}))

function snapTimeToFiveMinutes(time: string): string {
  const [hRaw, mRaw] = time.split(':')
  const h = Number(hRaw)
  const m = Number(mRaw)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '08:00'
  let snapped = Math.round(m / 5) * 5
  let hours = h
  if (snapped === 60) {
    snapped = 0
    hours = (h + 1) % 24
  }
  return `${String(hours).padStart(2, '0')}:${String(snapped).padStart(2, '0')}`
}

type Props = {
  mode: 'create' | 'edit'
}

export function EventManagePage({ mode }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { eventId: eventIdParam } = useParams()
  const eventId = mode === 'edit' && eventIdParam ? Number(eventIdParam) : undefined
  const city = useCityStore((s) => s.city)

  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<EventFormDraft>(EMPTY_EVENT_DRAFT)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const geocodeAbortRef = useRef<AbortController | null>(null)

  const categoriesQuery = useCategories()
  const detailQuery = useOrganizerEventDetail(eventId)
  const createMut = useCreateEvent()
  const updateMut = useUpdateEvent(eventId ?? 0)
  const publishMut = usePublishEvent()
  const deleteMut = useDeleteEvent()

  useEffect(() => {
    if (mode === 'edit' && detailQuery.data) {
      const loaded = detailToDraft(detailQuery.data)
      setDraft({ ...loaded, time: snapTimeToFiveMinutes(loaded.time) })
    }
  }, [mode, detailQuery.data])

  useEffect(() => {
    if (mode === 'create' && !draft.latitude) {
      setDraft((d) => ({ ...d, latitude: city.lat, longitude: city.lon }))
    }
  }, [mode, city.lat, city.lon, draft.latitude])

  const categoryIdByName = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of categoriesQuery.data ?? []) {
      m.set(normalizeCategoryName(c.name), c.id)
    }
    return m
  }, [categoriesQuery.data])

  const toggleCategory = (name: string) => {
    const id = categoryIdByName.get(normalizeCategoryName(name))
    if (id == null) return
    const on = draft.categoryIds.includes(id)
    patch({
      categoryIds: on ? draft.categoryIds.filter((x) => x !== id) : [...draft.categoryIds, id]
    })
  }

  const isCategorySelected = (name: string) => {
    const id = categoryIdByName.get(normalizeCategoryName(name))
    return id != null && draft.categoryIds.includes(id)
  }

  const mapPoint: MapPoint[] = useMemo(() => {
    if (draft.latitude == null || draft.longitude == null) return []
    return [
      {
        id: 'pick',
        title: draft.title || 'Место события',
        lat: draft.latitude,
        lon: draft.longitude
      }
    ]
  }, [draft.latitude, draft.longitude, draft.title])

  const patch = (part: Partial<EventFormDraft>) => setDraft((d) => ({ ...d, ...part }))

  const validateStep = (s: number): string | null => {
    if (s === 0) {
      if (draft.title.trim().length < 2) return 'Укажите название (минимум 2 символа)'
      if (draft.description.trim().length < 10) return 'Опишите событие подробнее'
      if (!draft.categoryIds.length) return 'Выберите хотя бы одну категорию'
    }
    if (s === 1) {
      if (!draft.date) return 'Укажите дату'
      if (!draft.location.trim()) return 'Укажите название площадки или отметьте точку на карте'
      if (draft.latitude == null || draft.longitude == null) return 'Укажите координаты на карте или кнопкой ниже'
    }
    if (s === 3 && draft.requiresRegistration && draft.ticketTypes.filter((t) => t.name.trim()).length === 0) {
      return 'Добавьте хотя бы один тип билета или участия'
    }
    return null
  }

  const next = () => {
    const msg = validateStep(step)
    if (msg) {
      setError(msg)
      return
    }
    setError(null)
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  const back = () => {
    setError(null)
    setStep((s) => Math.max(s - 1, 0))
  }

  const applyMapCoordinates = async (lat: number, lon: number) => {
    patch({ latitude: lat, longitude: lon })
    geocodeAbortRef.current?.abort()
    const ac = new AbortController()
    geocodeAbortRef.current = ac
    setGeocoding(true)
    try {
      const place = await reverseGeocodeVenue(lat, lon, ac.signal)
      if (place && !ac.signal.aborted) {
        patch({ addressDetail: place.address })
      }
    } catch {
      /* координаты уже сохранены */
    } finally {
      if (!ac.signal.aborted) setGeocoding(false)
    }
  }

  const onPickImage = async (e: ChangeEvent<HTMLInputElement>, target: 'cover' | 'gallery') => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const url = await uploadEventImage(file)
      if (target === 'cover') patch({ coverUrl: url })
      else patch({ galleryUrls: [...draft.galleryUrls, url] })
    } catch {
      setError('Не удалось загрузить изображение')
    } finally {
      setUploading(false)
    }
  }

  const save = async (publish: boolean, asDraft = false) => {
    const lastStep = draft.requiresRegistration ? 3 : 2
    for (let s = 0; s <= lastStep; s++) {
      const msg = validateStep(s)
      if (msg) {
        setError(msg)
        setStep(s)
        return
      }
    }
    setError(null)
    const payload: EventFormDraft = {
      ...draft,
      status: publish ? 'published' : asDraft ? 'draft' : draft.status === 'published' ? 'published' : 'draft'
    }
    try {
      let savedId = eventId
      if (mode === 'create') {
        const created = await createMut.mutateAsync(payload)
        savedId = created.event_id
        if (publish && created.status !== 'published') {
          await publishMut.mutateAsync(created.event_id)
        }
      } else if (eventId) {
        await updateMut.mutateAsync(payload)
        if (publish) await publishMut.mutateAsync(eventId)
      }
      if (!savedId) return
      await queryClient.invalidateQueries({ queryKey: ['organizer', 'events'] })
      await queryClient.refetchQueries({ queryKey: ['organizer', 'events'] })
      if (publish) {
        navigate(`/events/${savedId}`, { state: { from: '/my', label: '← Мои события' } })
      } else {
        navigate('/my')
      }
    } catch (err) {
      setError(formatApiError(err, 'Не удалось сохранить событие'))
    }
  }

  const onDelete = () => {
    if (!eventId || !window.confirm('Удалить событие безвозвратно?')) return
    deleteMut.mutate(eventId, {
      onSuccess: () => navigate('/my')
    })
  }

  if (mode === 'edit' && detailQuery.isLoading) {
    return (
      <div className="page">
        <p className="pageSub">Загрузка события…</p>
      </div>
    )
  }

  return (
    <div className="page eventManagePage">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">{mode === 'create' ? 'Создать событие' : 'Редактировать событие'}</div>
          <div className="pageSub">Многошаговая форма для организаторов</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {mode === 'edit' && eventId ? (
            <button
              type="button"
              className="eventDetailBtn eventDetailBtnDanger"
              disabled={deleteMut.isPending}
              onClick={onDelete}
            >
              Удалить
            </button>
          ) : null}
          <Link to="/my" className="homeGhostBtn">
            ← Мои события
          </Link>
        </div>
      </div>

      <div className="eventWizardSteps" role="tablist" aria-label="Шаги формы">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={step === i}
            className={step === i ? 'eventWizardStep active' : step > i ? 'eventWizardStep done' : 'eventWizardStep'}
            onClick={() => {
              if (i < step) setStep(i)
            }}
          >
            <span className="eventWizardStepNum">{i + 1}</span>
            <span className="eventWizardStepLabel">{label}</span>
          </button>
        ))}
      </div>

      <div className="eventWizardPanel">
        {error ? (
          <p className="eventWizardError" role="alert">
            {error}
          </p>
        ) : null}

        {step === 0 ? (
          <>
            <div className="searchGroup">
              <label className="label" htmlFor="ev-title">
                Название
              </label>
              <input
                id="ev-title"
                className="input"
                value={draft.title}
                onChange={(e) => patch({ title: e.target.value })}
                placeholder="Например: Настольные игры в субботу"
              />
            </div>
            <div className="searchGroup">
              <label className="label" htmlFor="ev-desc">
                Описание
              </label>
              <textarea
                id="ev-desc"
                className="input"
                style={{ minHeight: 120, resize: 'vertical' }}
                value={draft.description}
                onChange={(e) => patch({ description: e.target.value })}
              />
            </div>
            <div className="homeFilterPanel eventWizardFilterPanel">
              <div className="homeFilterCategoryGroups" role="group" aria-label="Категории">
                {CATEGORY_GROUPS.map((group) => (
                  <section key={group.id} className="homeFilterCategoryGroup">
                    <h3 className="homeFilterGroupTitle">{group.title}</h3>
                    <div className="homeChipRow homeChipRowInPanel">
                      {group.categories.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={isCategorySelected(c) ? 'homeChip active' : 'homeChip'}
                          aria-pressed={isCategorySelected(c)}
                          disabled={!categoryIdByName.has(normalizeCategoryName(c))}
                          onClick={() => toggleCategory(c)}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              <div className="homeFilterGrid">
                <div className="searchGroup homeFilterDropdownGroup">
                  <span className="label">Возраст</span>
                  <PointDropdown
                    variant="light"
                    ariaLabel="Возрастное ограничение"
                    options={AGE_OPTIONS}
                    value={String(draft.ageRatingMin)}
                    onChange={(v) => patch({ ageRatingMin: Number(v) as AgeRatingMin })}
                    placeholder="Выберите возраст"
                  />
                </div>
              </div>
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <div className="homeFilterGrid">
              <div className="searchGroup">
                <label className="label" htmlFor="ev-date">
                  Дата
                </label>
                <input
                  id="ev-date"
                  type="date"
                  className="input"
                  value={draft.date}
                  onChange={(e) => patch({ date: e.target.value })}
                />
              </div>
              <div className="searchGroup">
                <label className="label" htmlFor="ev-time">
                  Время
                </label>
                <input
                  id="ev-time"
                  type="time"
                  step={300}
                  className="input"
                  value={draft.time}
                  onChange={(e) => patch({ time: snapTimeToFiveMinutes(e.target.value) })}
                />
              </div>
            </div>
            <div className="searchGroup">
              <label className="label" htmlFor="ev-place">
                Название площадки
              </label>
              <input
                id="ev-place"
                className="input"
                value={draft.location}
                onChange={(e) => patch({ location: e.target.value })}
                placeholder="Например: Клуб «Точка»"
              />
            </div>
            <div className="searchGroup">
              <label className="label" htmlFor="ev-addr">
                Адрес
              </label>
              <input
                id="ev-addr"
                className="input"
                value={draft.addressDetail}
                onChange={(e) => patch({ addressDetail: e.target.value })}
                placeholder="Улица, дом, город"
              />
            </div>
            {geocoding || draft.latitude != null ? (
              <p className="pageSub" style={{ marginBottom: 8 }}>
                {geocoding ? 'Определяем адрес…' : 'Точка на карте выбрана'}
              </p>
            ) : null}
            <div className="mapWrap eventWizardMap">
              <YandexMap
                center={{ lat: draft.latitude ?? city.lat, lon: draft.longitude ?? city.lon, zoom: 14 }}
                points={mapPoint}
                onLocationPick={(lat, lon) => void applyMapCoordinates(lat, lon)}
              />
            </div>
            <p className="pageSub">
              {geocoding
                ? 'Подставляем адрес по выбранной точке…'
                : draft.latitude != null
                  ? 'Нажмите в другое место на карте, чтобы изменить адрес.'
                  : 'Нажмите на карту — адрес подставится автоматически. Название площадки введите вручную.'}
            </p>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className="searchGroup">
              <span className="label">Обложка</span>
              {draft.coverUrl ? (
                <div className="eventWizardGalleryItem" style={{ marginBottom: 10 }}>
                  <div
                    className="eventWizardPreview"
                    style={{ backgroundImage: `url(${draft.coverUrl})`, marginBottom: 0 }}
                  />
                  <button
                    type="button"
                    className="eventWizardGalleryRemove"
                    aria-label="Удалить обложку"
                    onClick={() => patch({ coverUrl: null })}
                  >
                    ×
                  </button>
                </div>
              ) : null}
              <label className="homePrimaryBtn" style={{ display: 'inline-flex', cursor: 'pointer' }}>
                {uploading ? 'Загрузка…' : 'Загрузить обложку'}
                <input type="file" accept="image/*" hidden onChange={(e) => void onPickImage(e, 'cover')} />
              </label>
            </div>
            <div className="searchGroup">
              <span className="label">Галерея</span>
              <div className="eventDetailGallery">
                {draft.galleryUrls.map((url) => (
                  <div key={url} className="eventWizardGalleryItem eventDetailGalleryBtn" style={{ backgroundImage: `url(${url})` }}>
                    <button
                      type="button"
                      className="eventWizardGalleryRemove"
                      aria-label="Удалить фото"
                      onClick={() => patch({ galleryUrls: draft.galleryUrls.filter((u) => u !== url) })}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <label className="eventDetailBtn" style={{ cursor: 'pointer', display: 'inline-flex' }}>
                Добавить фото
                <input type="file" accept="image/*" hidden onChange={(e) => void onPickImage(e, 'gallery')} />
              </label>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <label className="eventWizardCheck">
              <input
                type="checkbox"
                checked={draft.requiresRegistration}
                onChange={(e) => patch({ requiresRegistration: e.target.checked })}
              />
              Нужна запись / билет (иначе — просто объявление)
            </label>
            {!draft.requiresRegistration ? (
              <p className="pageSub">
                Событие будет отображаться как объявление без продажи билетов. Участники смогут отметить «Пойду» на странице
                события.
              </p>
            ) : null}
            {draft.requiresRegistration
              ? draft.ticketTypes.map((t, i) => (
              <div key={i} className="eventWizardTicketRow">
                <input
                  className="input"
                  placeholder="Название (Стандарт, VIP…)"
                  value={t.name}
                  onChange={(e) => {
                    const ticketTypes = [...draft.ticketTypes]
                    ticketTypes[i] = { ...ticketTypes[i], name: e.target.value }
                    patch({ ticketTypes })
                  }}
                />
                <input
                  className="input"
                  type="number"
                  min={0}
                  placeholder="Цена ₽"
                  value={t.price}
                  onChange={(e) => {
                    const ticketTypes = [...draft.ticketTypes]
                    ticketTypes[i] = { ...ticketTypes[i], price: e.target.value }
                    patch({ ticketTypes })
                  }}
                />
                <input
                  className="input"
                  type="number"
                  min={0}
                  placeholder="Кол-во"
                  value={t.quantity}
                  onChange={(e) => {
                    const ticketTypes = [...draft.ticketTypes]
                    ticketTypes[i] = { ...ticketTypes[i], quantity: e.target.value }
                    patch({ ticketTypes })
                  }}
                />
                <button
                  type="button"
                  className="eventDetailBtn eventDetailBtnDanger"
                  aria-label="Удалить тип билета"
                  onClick={() => patch({ ticketTypes: draft.ticketTypes.filter((_, j) => j !== i) })}
                >
                  ×
                </button>
              </div>
                ))
              : null}
            {draft.requiresRegistration ? (
              <button
                type="button"
                className="eventDetailBtn"
                onClick={() => patch({ ticketTypes: [...draft.ticketTypes, { name: '', price: '', quantity: '' }] })}
              >
                + Тип билета
              </button>
            ) : null}
          </>
        ) : null}

        {step === 4 ? (
          <>
            <div className="eventDetailPanel">
              <h3 className="eventDetailPanelTitle">Проверьте перед публикацией</h3>
              <p className="eventDetailDesc">
                <strong>{draft.title || '—'}</strong>
                <br />
                {draft.date} {draft.time} · {draft.location || '—'}
                <br />
                Категорий: {draft.categoryIds.length}
                {draft.requiresRegistration
                  ? ` · Билетов: ${draft.ticketTypes.filter((t) => t.name.trim()).length}`
                  : ' · Без записи'}
              </p>
              <p className="eventDetailMuted">
                Черновик виден только вам в «Мои события». Опубликованное событие появится в ленте и на карте.
              </p>
              {mode === 'edit' && draft.status === 'published' ? (
                <button
                  type="button"
                  className="eventDetailBtn"
                  style={{ marginTop: 12 }}
                  disabled={updateMut.isPending}
                  onClick={() => void save(false, true)}
                >
                  Снять с публикации (черновик)
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <div className="eventWizardNav">
        <button type="button" className="eventDetailBtn" disabled={step === 0} onClick={back}>
          Назад
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" className="homePrimaryBtn" style={{ display: 'inline-flex' }} onClick={next}>
            Далее
          </button>
        ) : (
          <>
            {mode === 'create' || draft.status !== 'published' ? (
              <button
                type="button"
                className="eventDetailBtn"
                disabled={createMut.isPending || updateMut.isPending}
                onClick={() => void save(false)}
              >
                Сохранить черновик
              </button>
            ) : null}
            <button
              type="button"
              className="homePrimaryBtn"
              style={{ display: 'inline-flex' }}
              disabled={createMut.isPending || updateMut.isPending || publishMut.isPending}
              onClick={() => void save(true)}
            >
              {mode === 'edit' && draft.status === 'published' ? 'Сохранить' : 'Опубликовать'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
