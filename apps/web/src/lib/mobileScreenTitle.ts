import { ADMIN_SUBNAV } from '../pages/adminNav'
import { MY_EVENTS_SUBNAV } from '../pages/myEventsNav'

const MY_EVENTS_TITLES = Object.fromEntries(MY_EVENTS_SUBNAV.map((item) => [item.to, item.label]))

export function getMobileScreenTitle(pathname: string): string {
  if (pathname === '/') return 'Лента'
  if (pathname.startsWith('/favorites')) return 'Избранное'
  if (pathname.startsWith('/notifications')) return 'Уведомления'
  if (pathname.startsWith('/account')) return 'Профиль'
  if (pathname.startsWith('/settings')) return 'Настройки'
  if (pathname === '/login') return 'Вход'
  if (pathname === '/register') return 'Регистрация'
  if (pathname.startsWith('/forgot-password')) return 'Восстановление пароля'
  if (pathname.startsWith('/reset-password')) return 'Новый пароль'
  if (pathname.startsWith('/verify-email')) return 'Подтверждение email'
  if (pathname === '/create') return 'Создать событие'

  if (pathname.startsWith('/my/attending') || pathname.startsWith('/my/organized')) {
    return 'Мои мероприятия'
  }
  for (const item of MY_EVENTS_SUBNAV) {
    if (pathname === item.to || pathname.startsWith(`${item.to}/`)) {
      return MY_EVENTS_TITLES[item.to] ?? item.label
    }
  }
  if (pathname.startsWith('/my')) return 'Мои мероприятия'

  const adminMatch = ADMIN_SUBNAV.find(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`)
  )
  if (adminMatch) return adminMatch.label
  if (pathname.startsWith('/admin')) return 'Админ-панель'

  if (/^\/events\/[^/]+\/edit$/.test(pathname)) return 'Редактирование'
  if (/^\/events\/[^/]+$/.test(pathname)) return 'Событие'

  return 'Point'
}
