import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'

export type PointDropdownOption<T extends string = string> = {
  value: T
  label: string
  /** Дополнительный текст для поиска (если label не совпадает). */
  searchText?: string
}

type BaseProps<T extends string> = {
  options: PointDropdownOption<T>[]
  variant?: 'sidebar' | 'light'
  searchable?: boolean
  searchPlaceholder?: string
  ariaLabel: string
  className?: string
  triggerPrefix?: ReactNode
  disabled?: boolean
  menuMinWidth?: number
  /** false — список формирует родитель (геокодер и т.п.) */
  searchLocally?: boolean
  onSearchQuery?: (query: string) => void
  searchLoading?: boolean
  /** Подпись на кнопке, если value нет в options (например, город с геокодера). */
  labelOverride?: string
}

type SingleProps<T extends string> = BaseProps<T> & {
  multi?: false
  value: T | ''
  onChange: (value: T) => void
  placeholder?: string
}

type MultiProps<T extends string> = BaseProps<T> & {
  multi: true
  value: T[]
  onChange: (value: T[]) => void
  placeholder?: string
  emptyLabel?: string
}

export type PointDropdownProps<T extends string = string> = SingleProps<T> | MultiProps<T>

function normalizeSearch(s: string) {
  return s.trim().toLowerCase()
}

export function PointDropdown<T extends string = string>(props: PointDropdownProps<T>) {
  const {
    options,
    variant = 'light',
    searchable = false,
    searchPlaceholder = 'Поиск…',
    ariaLabel,
    className,
    triggerPrefix,
    disabled = false,
    menuMinWidth,
    searchLocally = true,
    onSearchQuery,
    searchLoading = false,
    labelOverride,
  } = props

  const listId = useId()
  const searchId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const isMulti = props.multi === true

  const selectedSet = useMemo(() => {
    if (isMulti) return new Set(props.value)
    return new Set(props.value ? [props.value] : [])
  }, [isMulti, props.value])

  const filtered = useMemo(() => {
    if (!searchLocally) return options
    const q = normalizeSearch(query)
    if (!q) return options
    return options.filter((o) => {
      const hay = normalizeSearch(`${o.label} ${o.searchText ?? ''}`)
      return hay.includes(q)
    })
  }, [options, query, searchLocally])

  useEffect(() => {
    if (!searchable || searchLocally || !onSearchQuery) return
    const t = window.setTimeout(() => onSearchQuery(query), 280)
    return () => window.clearTimeout(t)
  }, [query, searchable, searchLocally, onSearchQuery])

  const triggerLabel = useMemo(() => {
    if (isMulti) {
      if (!props.value.length) return props.placeholder ?? props.emptyLabel ?? 'Выберите'
      if (props.value.length === 1) {
        return options.find((o) => o.value === props.value[0])?.label ?? props.value[0]
      }
      return props.value
        .map((v) => options.find((o) => o.value === v)?.label ?? v)
        .join(', ')
    }
    if (!props.value) return props.placeholder ?? 'Выберите'
    return options.find((o) => o.value === props.value)?.label ?? props.value
  }, [isMulti, options, props])

  const shownLabel = labelOverride ?? triggerLabel

  useEffect(() => {
    if (!open) {
      setQuery('')
      if (!searchLocally && onSearchQuery) onSearchQuery('')
      return
    }
    if (searchable) {
      const t = window.setTimeout(() => searchRef.current?.focus(), 0)
      return () => window.clearTimeout(t)
    }
  }, [open, searchable, searchLocally, onSearchQuery])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggleOpen = () => {
    if (disabled) return
    setOpen((o) => !o)
  }

  const onPick = (value: T) => {
    if (isMulti) {
      const next = selectedSet.has(value)
        ? props.value.filter((v) => v !== value)
        : [...props.value, value]
      props.onChange(next)
      return
    }
    props.onChange(value)
    setOpen(false)
  }

  const rootClass = ['pointDropdown', `pointDropdown_${variant}`, className].filter(Boolean).join(' ')

  return (
    <div ref={rootRef} className={rootClass}>
      <button
        type="button"
        className="pointDropdownTrigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={toggleOpen}
      >
        {triggerPrefix ? <span className="pointDropdownPrefix">{triggerPrefix}</span> : null}
        <span className="pointDropdownLabel">{shownLabel}</span>
        <span className="pointDropdownChevron" aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div
          className="pointDropdownMenu"
          role="listbox"
          aria-label={ariaLabel}
          aria-multiselectable={isMulti || undefined}
          style={menuMinWidth ? { minWidth: menuMinWidth } : undefined}
        >
          {searchable ? (
            <div className="pointDropdownSearchWrap">
              <input
                ref={searchRef}
                id={searchId}
                type="search"
                className="pointDropdownSearch"
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
                aria-label={searchPlaceholder}
              />
            </div>
          ) : null}
          <ul id={listId} className="pointDropdownList">
            {filtered.length ? (
              filtered.map((o) => {
                const active = selectedSet.has(o.value)
                return (
                  <li key={o.value} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={active ? 'pointDropdownOption active' : 'pointDropdownOption'}
                      onClick={() => onPick(o.value)}
                    >
                      {isMulti ? (
                        <span className="pointDropdownCheck" aria-hidden>
                          {active ? '✓' : ''}
                        </span>
                      ) : null}
                      <span className="pointDropdownOptionLabel">{o.label}</span>
                    </button>
                  </li>
                )
              })
            ) : searchLoading ? (
              <li className="pointDropdownEmpty" role="presentation">
                Ищем…
              </li>
            ) : (
              <li className="pointDropdownEmpty" role="presentation">
                Ничего не найдено
              </li>
            )}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
