import { env, isLanHostname } from './env'

function isApiMediaPath(pathname: string): boolean {
  return (
    pathname.startsWith('/api/v1/media/') ||
    pathname.startsWith('/api/v1/placeholders/') ||
    pathname.startsWith('/uploads/')
  )
}

/** На dev/LAN картинки грузим через origin Vite (proxy), иначе HTTPS-страница блокирует http://…:8000. */
function preferSameOriginMedia(): boolean {
  if (env().API_BASE_URL === '') return true
  if (typeof window === 'undefined') return import.meta.env.DEV
  const host = window.location.hostname
  if (import.meta.env.DEV) return true
  if (host === 'localhost' || host === '127.0.0.1') return true
  return isLanHostname(host)
}

function toSameOriginMediaPath(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (!isApiMediaPath(parsed.pathname)) return null
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return null
  }
}

/** Превращает /api/v1/media/... и /uploads/... в URL, доступный из браузера. */
export function resolveMediaUrl(url: string | null | undefined): string | undefined {
  if (url == null || !String(url).trim()) return undefined
  const u = String(url).trim()

  if (/^https?:\/\//i.test(u)) {
    if (preferSameOriginMedia()) {
      const sameOrigin = toSameOriginMediaPath(u)
      if (sameOrigin) return sameOrigin
    }
    return u
  }

  if (isApiMediaPath(u.startsWith('/') ? u : `/${u}`)) {
    const path = u.startsWith('/') ? u : `/${u}`
    if (preferSameOriginMedia()) return path
  }

  const configured = env().API_BASE_URL.trim()
  const base =
    configured ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:8000')
  return `${base.replace(/\/$/, '')}${u.startsWith('/') ? u : `/${u}`}`
}

export function resolveGalleryUrls(urls: string[] | null | undefined): string[] {
  if (!urls?.length) return []
  return urls.map((item) => resolveMediaUrl(item) ?? item).filter(Boolean)
}
