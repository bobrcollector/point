export type EventDetailBack = {
  to: string
  label: string
}

const LABELS: Record<string, string> = {
  '/': '← Назад к ленте',
  '/favorites': '← В избранное',
  '/my': '← Мои события',
  '/my/organized': '← Организую',
  '/my/attending': '← Участвую',
  '/create': '← Создать событие',
}

export function getEventDetailBack(state: unknown): EventDetailBack {
  if (state && typeof state === 'object' && 'from' in state) {
    const from = (state as { from?: unknown }).from
    if (typeof from === 'string' && from.startsWith('/') && !from.startsWith('/events/')) {
      return { to: from, label: LABELS[from] ?? '← Назад' }
    }
  }
  return { to: '/', label: LABELS['/'] }
}
