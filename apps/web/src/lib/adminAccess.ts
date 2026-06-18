import { useSyncExternalStore } from 'react'

const LOCAL_ADMIN_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/** С mobile.css: ниже этой ширины показывается мобильная навигация. */
export const ADMIN_DESKTOP_MIN_WIDTH = 721

const MOBILE_UA = /Android|webOS|iPhone|iPod|iPad|BlackBerry|IEMobile|Opera Mini|Mobile/i

function configuredAdminHosts(): Set<string> {
  const raw = import.meta.env.VITE_ADMIN_ALLOWED_HOSTS
  if (typeof raw !== 'string' || !raw.trim()) return new Set()
  return new Set(
    raw
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  )
}

/** Админка: localhost в dev + хосты из VITE_ADMIN_ALLOWED_HOSTS на production. */
export function isAdminHostAllowed(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname.toLowerCase()
  if (LOCAL_ADMIN_HOSTS.has(host)) return true
  return configuredAdminHosts().has(host)
}

export function isAdminDesktopClient(): boolean {
  if (typeof window === 'undefined') return false
  if (MOBILE_UA.test(navigator.userAgent)) return false
  return window.matchMedia(`(min-width: ${ADMIN_DESKTOP_MIN_WIDTH}px)`).matches
}

export function isAdminAccessAllowed(): boolean {
  return isAdminHostAllowed() && isAdminDesktopClient()
}

function subscribeAdminDesktop(onChange: () => void): () => void {
  const mq = window.matchMedia(`(min-width: ${ADMIN_DESKTOP_MIN_WIDTH}px)`)
  mq.addEventListener('change', onChange)
  window.addEventListener('resize', onChange)
  return () => {
    mq.removeEventListener('change', onChange)
    window.removeEventListener('resize', onChange)
  }
}

function getAdminDesktopSnapshot(): boolean {
  return isAdminDesktopClient()
}

export function useAdminAccessAllowed(): boolean {
  const desktop = useSyncExternalStore(subscribeAdminDesktop, getAdminDesktopSnapshot, () => false)
  return isAdminHostAllowed() && desktop
}
