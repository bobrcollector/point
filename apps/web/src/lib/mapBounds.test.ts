import { describe, expect, it } from 'vitest'
import { boundsToParam } from './mapBounds'

describe('mapBounds (интерактивная карта ↔ каталог)', () => {
  it('преобразует bounds карты в строку query-параметра', () => {
    const bounds: number[][] = [
      [37.5, 55.7],
      [37.7, 55.8]
    ]
    expect(boundsToParam(bounds)).toBe('37.5,55.7,37.7,55.8')
  })

  it('согласован с форматом parse_bounds на бэкенде', () => {
    const param = boundsToParam([
      [30.2, 59.8],
      [30.5, 60.0]
    ])
    const parts = param.split(',').map(Number)
    expect(parts).toHaveLength(4)
    expect(parts.every((n) => Number.isFinite(n))).toBe(true)
  })
})
