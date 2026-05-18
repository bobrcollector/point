import { describe, expect, it } from 'vitest'
import { formatAgeRating, parseAgeRatingsParam } from './ageRatings'

describe('ageRatings', () => {
  it('форматирует допустимые возрастные метки', () => {
    expect(formatAgeRating(0)).toBe('0+')
    expect(formatAgeRating(18)).toBe('18+')
  })

  it('подставляет 12+ для неизвестного значения', () => {
    expect(formatAgeRating(99)).toBe('12+')
    expect(formatAgeRating(null)).toBe('12+')
  })

  it('парсит параметр age_ratings', () => {
    expect(parseAgeRatingsParam('0,6,12')).toEqual([0, 6, 12])
    expect(parseAgeRatingsParam('')).toBeUndefined()
    expect(parseAgeRatingsParam('99,100')).toBeUndefined()
  })
})
