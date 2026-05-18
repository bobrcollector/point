import { describe, expect, it } from 'vitest'
import { categoryGroupId, normalizeCategoryName } from './categoryGroups'

describe('categoryGroups', () => {
  it('нормализует устаревшие названия категорий', () => {
    expect(normalizeCategoryName('Концерт')).toBe('Концерты')
    expect(normalizeCategoryName('Спорт')).toBe('Командный спорт')
  })

  it('определяет группу по названию категории', () => {
    expect(categoryGroupId('Концерты')).toBe('culture')
    expect(categoryGroupId('Настолки')).toBe('games')
    expect(categoryGroupId('Фитнес/йога')).toBe('sport')
    expect(categoryGroupId('Фуд-фестивали')).toBe('food')
  })

  it('возвращает culture для неизвестной категории', () => {
    expect(categoryGroupId('Неизвестная категория')).toBe('culture')
  })

  it('учитывает legacy-алиасы при определении группы', () => {
    expect(categoryGroupId('Концерт')).toBe('culture')
    expect(categoryGroupId('Игры')).toBe('games')
  })
})
