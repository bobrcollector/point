/** Минимальный возраст для допуска на событие (российская маркировка). */
export type AgeRatingMin = 0 | 6 | 12 | 16 | 18

export const AGE_RATINGS: { value: AgeRatingMin; label: string; shortLabel: string }[] = [
  { value: 0, label: '0+ · для всех', shortLabel: '0+' },
  { value: 6, label: '6+ · детям от 6 лет', shortLabel: '6+' },
  { value: 12, label: '12+ · подросткам', shortLabel: '12+' },
  { value: 16, label: '16+ · с 16 лет', shortLabel: '16+' },
  { value: 18, label: '18+ · только взрослым', shortLabel: '18+' },
]

export function formatAgeRating(min: number | undefined | null): string {
  const found = AGE_RATINGS.find((r) => r.value === min)
  return found?.shortLabel ?? '12+'
}

export function parseAgeRatingsParam(raw: string | undefined): AgeRatingMin[] | undefined {
  if (!raw?.trim()) return undefined
  const allowed = new Set(AGE_RATINGS.map((r) => r.value))
  const out: AgeRatingMin[] = []
  for (const part of raw.split(',')) {
    const n = Number(part.trim())
    if (allowed.has(n as AgeRatingMin)) out.push(n as AgeRatingMin)
  }
  return out.length ? out : undefined
}
