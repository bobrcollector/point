const LOCAL_ADMIN_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/** Админка доступна только при открытии сайта на этом ПК (localhost), не по LAN IP. */
export function isAdminHostAllowed(): boolean {
  if (typeof window === 'undefined') return false
  return LOCAL_ADMIN_HOSTS.has(window.location.hostname.toLowerCase())
}
