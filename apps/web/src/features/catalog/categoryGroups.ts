export type CategoryGroupId =
  | 'culture'
  | 'games'
  | 'sport'
  | 'food'
  | 'social'
  | 'festivals'
  | 'health'

export type CategoryGroup = {
  id: CategoryGroupId
  title: string
  categories: readonly string[]
}

export const CATEGORY_GROUPS: readonly CategoryGroup[] = [
  {
    id: 'culture',
    title: 'Культура',
    categories: ['Концерты', 'Театр', 'Выставки', 'Кино', 'Лекции'],
  },
  {
    id: 'games',
    title: 'Игры и хобби',
    categories: ['Настолки', 'Видеоигры', 'Квизы', 'Мастер-классы', 'Рукоделие'],
  },
  {
    id: 'sport',
    title: 'Спорт и активность',
    categories: ['Командный спорт', 'Фитнес/йога', 'Бег/вело', 'Единоборства', 'Экстрим'],
  },
  {
    id: 'food',
    title: 'Еда и шопинг',
    categories: ['Фуд-фестивали', 'Дегустации', 'Ярмарки', 'Акции магазинов', 'Свопы'],
  },
  {
    id: 'social',
    title: 'Социальное',
    categories: ['Нетворкинг', 'Языковые клубы', 'Клубы по интересам', 'Знакомства'],
  },
  {
    id: 'festivals',
    title: 'Массовые праздники',
    categories: ['Городские праздники', 'Музыкальные фестивали', 'Уличная культура', 'Детские фестивали'],
  },
  {
    id: 'health',
    title: 'Здоровье и саморазвитие',
    categories: ['Медитация', 'Психологические группы', 'Благотворительные забеги'],
  },
] as const

export const ALL_CATEGORY_NAMES: string[] = CATEGORY_GROUPS.flatMap((g) => [...g.categories])

/** Старые названия из ранних сидов — для сопоставления с БД до миграции. */
export const LEGACY_CATEGORY_ALIASES: Record<string, string> = {
  Концерт: 'Концерты',
  Спорт: 'Командный спорт',
  Лекция: 'Лекции',
  Игры: 'Настолки',
  Другое: 'Клубы по интересам',
  Выставка: 'Выставки',
}

export function normalizeCategoryName(name: string): string {
  return LEGACY_CATEGORY_ALIASES[name] ?? name
}

export function categoryGroupId(categoryName: string): CategoryGroupId {
  const name = normalizeCategoryName(categoryName)
  for (const group of CATEGORY_GROUPS) {
    if ((group.categories as readonly string[]).includes(name)) return group.id
  }
  return 'culture'
}
