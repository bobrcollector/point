export type EventDetailBack = {
  to: string
  label: string
  state?: unknown
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
    const routeState = state as { from?: unknown; label?: unknown; backState?: unknown }
    const from = routeState.from
    if (typeof from === 'string' && from.startsWith('/') && !from.startsWith('/events/')) {
      const label = typeof routeState.label === 'string' ? routeState.label : LABELS[from] ?? '← Назад'
      return { to: from, label, state: routeState.backState }
    }
  }
  return { to: '/', label: LABELS['/'] }
}
