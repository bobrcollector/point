const COMPLAINT_REASON_LABELS: Record<string, string> = {
  spam: 'Спам / реклама',
  misleading: 'Вводит в заблуждение',
  unsafe: 'Небезопасно',
  other: 'Другое',
}

const COMPLAINT_STATUS_LABELS: Record<string, string> = {
  pending: 'На рассмотрении',
  resolved: 'Принята',
  rejected: 'Отклонена',
}

function reasonLabel(key: string): string {
  return COMPLAINT_REASON_LABELS[key] ?? key
}

function stripDemoMarker(raw: string): string {
  const markerIdx = raw.indexOf('|')
  if (markerIdx === -1) return raw
  const prefix = raw.slice(0, markerIdx)
  if (!prefix.startsWith('demo-complaint-')) return raw
  return raw.slice(markerIdx + 1).trim()
}

export function complaintStatusLabel(status: string): string {
  return COMPLAINT_STATUS_LABELS[status] ?? status
}

export function parseComplaintReason(raw: string): { title: string; comment: string | null } {
  const normalized = stripDemoMarker(raw.trim())
  if (!normalized) {
    return { title: 'Жалоба', comment: null }
  }

  const segments = normalized.split(':').map((part) => part.trim()).filter(Boolean)
  if (segments.length === 0) {
    return { title: 'Жалоба', comment: null }
  }

  if (segments[0].startsWith('review')) {
    const typeKey = segments[1] ?? 'other'
    const commentParts = segments.slice(2)
    const typeLabel = reasonLabel(typeKey)
    const comment = commentParts.length ? commentParts.join(': ') : null
    return {
      title: 'Жалоба на отзыв',
      comment: comment ? `${typeLabel}: ${comment}` : typeLabel,
    }
  }

  const typeKey = segments[0]
  const knownType = typeKey in COMPLAINT_REASON_LABELS
  if (!knownType) {
    return { title: normalized, comment: null }
  }

  const commentParts = segments.slice(1)
  return {
    title: reasonLabel(typeKey),
    comment: commentParts.length ? commentParts.join(': ') : null,
  }
}

export function formatComplaintDescription(raw: string): string {
  const { title, comment } = parseComplaintReason(raw)
  return comment ?? title
}
