export const ADMIN_DASHBOARD_NAV = { to: '/admin/dashboard', label: 'Дашборд' } as const

export const ADMIN_SUBNAV = [
  ADMIN_DASHBOARD_NAV,
  { to: '/admin/users', label: 'Пользователи' },
  { to: '/admin/pending', label: 'Модерация' },
  { to: '/admin/complaints', label: 'Жалобы' },
] as const
