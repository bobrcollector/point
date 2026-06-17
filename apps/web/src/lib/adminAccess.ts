const LOCAL_ADMIN_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

function configuredAdminHosts(): Set<string> {
  const raw = import.meta.env.VITE_ADMIN_ALLOWED_HOSTS
  if (typeof raw !== 'string' || !raw.trim()) return new Set()
  return new Set(
    raw
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean)
  )
}

/** Админка: localhost в dev + хосты из VITE_ADMIN_ALLOWED_HOSTS на production. */
export function isAdminHostAllowed(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname.toLowerCase()
  if (LOCAL_ADMIN_HOSTS.has(host)) return true
  return configuredAdminHosts().has(host)
}
