import { env } from './env'

/** Превращает /api/v1/media/... и /uploads/... в полный URL API (нужно на другом ПК и в production). */
export function resolveMediaUrl(url: string | null | undefined): string | undefined {
  if (url == null || !String(url).trim()) return undefined
  const u = String(url).trim()
  if (/^https?:\/\//i.test(u)) return u
  const configured = env().API_BASE_URL.trim()
  const base =
    configured ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:8000')
  return `${base.replace(/\/$/, '')}${u.startsWith('/') ? u : `/${u}`}`
}

export function resolveGalleryUrls(urls: string[] | null | undefined): string[] {
  if (!urls?.length) return []
  return urls.map((u) => resolveMediaUrl(u) ?? u).filter(Boolean)
}
