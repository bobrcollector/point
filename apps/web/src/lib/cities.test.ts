import { describe, expect, it } from 'vitest'
import { CITIES, detectNearestCityId, eventInCity, getCityById, haversineMeters } from './cities'

describe('cities / геофильтрация каталога', () => {
  it('haversineMeters: нулевая дистанция для одной точки', () => {
    const moscow = CITIES[0]
    expect(haversineMeters(moscow, moscow)).toBeLessThan(1)
  })

  it('detectNearestCityId: центр Москвы → moscow', () => {
    expect(detectNearestCityId(55.7558, 37.6173)).toBe('moscow')
  })

  it('eventInCity: событие в радиусе города', () => {
    const moscow = getCityById('moscow')
    expect(eventInCity(55.76, 37.62, moscow)).toBe(true)
  })

  it('eventInCity: без координат — только для Москвы по умолчанию', () => {
    const moscow = getCityById('moscow')
    const spb = getCityById('spb')
    expect(eventInCity(undefined, undefined, moscow)).toBe(true)
    expect(eventInCity(undefined, undefined, spb)).toBe(false)
  })
})
