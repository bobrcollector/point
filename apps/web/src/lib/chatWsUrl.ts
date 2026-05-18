import { env } from './env'

export function chatWebSocketUrl(eventId: string, displayName: string, organizerName: string): string {
  const params = new URLSearchParams({
    display_name: displayName,
    organizer_name: organizerName,
  })
  const path = `/api/v1/chat/ws/${encodeURIComponent(eventId)}?${params.toString()}`

  const base = env().API_BASE_URL
  if (base) {
    const http = new URL(base)
    const wsProto = http.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${wsProto}//${http.host}${path}`
  }

  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${wsProto}//${window.location.host}${path}`
}
