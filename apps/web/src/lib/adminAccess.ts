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

export function isAdminMobileClient(): boolean {
  if (typeof window === 'undefined') return false
  if (MOBILE_UA.test(navigator.userAgent)) return true
  return !window.matchMedia(`(min-width: ${ADMIN_DESKTOP_MIN_WIDTH}px)`).matches
}

export function isAdminDesktopClient(): boolean {
  if (typeof window === 'undefined') return false
  if (MOBILE_UA.test(navigator.userAgent)) return false
  return window.matchMedia(`(min-width: ${ADMIN_DESKTOP_MIN_WIDTH}px)`).matches
}

/** Полная админка — только десктоп на разрешённом хосте. */
export function isAdminAccessAllowed(): boolean {
  return isAdminHostAllowed() && isAdminDesktopClient()
}

/** Дашборд статистики — также на мобильных (PWA). */
export function isAdminDashboardAccessAllowed(): boolean {
  return isAdminHostAllowed() && (isAdminDesktopClient() || isAdminMobileClient())
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

function subscribeAdminMobile(onChange: () => void): () => void {
  const mq = window.matchMedia(`(max-width: ${ADMIN_DESKTOP_MIN_WIDTH - 1}px)`)
  mq.addEventListener('change', onChange)
  window.addEventListener('resize', onChange)
  return () => {
    mq.removeEventListener('change', onChange)
    window.removeEventListener('resize', onChange)
  }
}

function getAdminMobileSnapshot(): boolean {
  return isAdminMobileClient()
}

export function useAdminMobileClient(): boolean {
  return useSyncExternalStore(subscribeAdminMobile, getAdminMobileSnapshot, () => false)
}

export function useAdminDashboardAccessAllowed(): boolean {
  const desktop = useSyncExternalStore(subscribeAdminDesktop, getAdminDesktopSnapshot, () => false)
  const mobile = useSyncExternalStore(subscribeAdminMobile, getAdminMobileSnapshot, () => false)
  return isAdminHostAllowed() && (desktop || mobile)
}
