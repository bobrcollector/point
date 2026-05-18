import { isAxiosError } from 'axios'

export function formatApiError(err: unknown, fallback = 'Не удалось выполнить запрос'): string {
  if (isAxiosError(err)) {
    const detail = err.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      const msgs = detail
        .map((item) => {
          if (item && typeof item === 'object' && 'msg' in item) return String(item.msg)
          return null
        })
        .filter(Boolean)
      if (msgs.length) return msgs.join('. ')
    }
    if (err.response?.status === 401) {
      return 'Нет доступа. Запустите npm run db:seed и npm run dev:api.'
    }
    if (!err.response) {
      return 'Нет связи с API. Запустите npm run dev:api.'
    }
    return fallback
  }
  if (err instanceof Error && err.message) return err.message
  return fallback
}
