import { useMemo } from 'react'
import { PointDropdown } from '../components/PointDropdown'
import { AGE_RATINGS, type AgeRatingMin } from '../features/catalog/ageRatings'
import { CATEGORY_GROUPS } from '../features/catalog/categoryGroups'

export type HomeFilters = {
  q: string
  categories: string[]
  ageRatings: AgeRatingMin[]
  onlyFree: boolean
  priceMin: string
  priceMax: string
  sort: 'rank' | 'date' | 'distance' | 'rating'
}

export const DEFAULT_HOME_FILTERS: Omit<HomeFilters, 'q'> = {
  categories: [],
  ageRatings: [],
  onlyFree: false,
  priceMin: '',
  priceMax: '',
  sort: 'rank',
}

const SORT_OPTIONS = [
  { value: 'rank' as const, label: 'По интересам и близости' },
  { value: 'date' as const, label: 'По дате' },
  { value: 'distance' as const, label: 'По расстоянию' },
  { value: 'rating' as const, label: 'По рейтингу' },
]

const AGE_OPTIONS = AGE_RATINGS.map((r) => ({
  value: String(r.value),
  label: r.label,
  searchText: r.shortLabel,
}))

type Props = {
  id: string
  filters: HomeFilters
  filtersApplied: boolean
  onChange: (patch: Partial<HomeFilters>) => void
  onReset: () => void
  onToggleCategory: (name: string) => void
}

export function homeFiltersDifferFromDefaults(f: HomeFilters): boolean {
  return (
    f.categories.length > 0 ||
    f.ageRatings.length > 0 ||
    f.onlyFree !== DEFAULT_HOME_FILTERS.onlyFree ||
    f.priceMin !== DEFAULT_HOME_FILTERS.priceMin ||
    f.priceMax !== DEFAULT_HOME_FILTERS.priceMax ||
    f.sort !== DEFAULT_HOME_FILTERS.sort
  )
}

export function HomePageFiltersPanel({ id, filters, filtersApplied, onChange, onReset, onToggleCategory }: Props) {
  const ageValue = useMemo(() => filters.ageRatings.map((v) => String(v)), [filters.ageRatings])

  const onAgeChange = (next: string[]) => {
    onChange({ ageRatings: next.map((v) => Number(v) as AgeRatingMin) })
  }

  return (
    <div className="homeFilterPanel" id={id}>
      <div className="homeFilterCategoryGroups" role="group" aria-label="Категории">
        {CATEGORY_GROUPS.map((group) => (
          <section key={group.id} className="homeFilterCategoryGroup">
            <h3 className="homeFilterGroupTitle">{group.title}</h3>
            <div className="homeChipRow homeChipRowInPanel">
              {group.categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={filters.categories.includes(c) ? 'homeChip active' : 'homeChip'}
                  aria-pressed={filters.categories.includes(c)}
                  onClick={() => onToggleCategory(c)}
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
          <span className="label">Сортировка</span>
          <PointDropdown
            variant="light"
            ariaLabel="Сортировка"
            options={SORT_OPTIONS}
            value={filters.sort}
            onChange={(sort) => onChange({ sort })}
          />
        </div>
        <div className="searchGroup homeFilterDropdownGroup">
          <span className="label">Возраст</span>
          <PointDropdown
            variant="light"
            ariaLabel="Возрастное ограничение"
            options={AGE_OPTIONS}
            multi
            value={ageValue}
            onChange={onAgeChange}
            placeholder="Любой возраст"
            emptyLabel="Любой возраст"
          />
        </div>
        <div className="searchGroup homeFilterPriceGroup">
          <span className="label">Цена</span>
          <div className="homePriceRow">
            <button
              type="button"
              className={filters.onlyFree ? 'pill active' : 'pill'}
              onClick={() =>
                onChange({
                  onlyFree: !filters.onlyFree,
                  priceMin: !filters.onlyFree ? '' : filters.priceMin,
                  priceMax: !filters.onlyFree ? '' : filters.priceMax,
                })
              }
              aria-pressed={filters.onlyFree}
            >
              бесплатно
            </button>
            <input
              id="home-price-min"
              type="number"
              min={0}
              step={50}
              className="input homePriceInput"
              placeholder="от, ₽"
              value={filters.priceMin}
              disabled={filters.onlyFree}
              onChange={(e) => onChange({ priceMin: e.target.value, onlyFree: false })}
            />
            <span className="homePriceRangeSep" aria-hidden>
              —
            </span>
            <input
              id="home-price-max"
              type="number"
              min={0}
              step={50}
              className="input homePriceInput"
              placeholder="до, ₽"
              value={filters.priceMax}
              disabled={filters.onlyFree}
              onChange={(e) => onChange({ priceMax: e.target.value, onlyFree: false })}
            />
          </div>
        </div>
        <div className="searchGroup homeFilterResetGroup">
          <span className="label" id="home-filter-reset-label">
            Сброс
          </span>
          <button
            type="button"
            className="homeFilterResetBtn"
            disabled={!filtersApplied}
            aria-labelledby="home-filter-reset-label"
            onClick={onReset}
          >
            Сбросить фильтры
          </button>
        </div>
      </div>
    </div>
  )
}
