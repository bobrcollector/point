import { formatAgeRating } from '../features/catalog/ageRatings'

type Props = {
  ageRatingMin?: number | null
  className?: string
}

export function AgeRatingBadge({ ageRatingMin, className }: Props) {
  if (ageRatingMin == null) return null
  const label = formatAgeRating(ageRatingMin)
  return (
    <span className={['ageBadge', className].filter(Boolean).join(' ')} title={`Возрастное ограничение ${label}`}>
      {label}
    </span>
  )
}
