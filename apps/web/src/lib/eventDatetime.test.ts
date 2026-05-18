import { describe, expect, it } from 'vitest'
import { isEventPast } from './eventDatetime'

describe('isEventPast', () => {
  it('returns true when event start is before now', () => {
    expect(isEventPast('2020-01-01T12:00:00Z', Date.parse('2026-01-01'))).toBe(true)
  })

  it('returns false for future events', () => {
    expect(isEventPast('2030-01-01T12:00:00Z', Date.parse('2026-01-01'))).toBe(false)
  })
})
