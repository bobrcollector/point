/** Демо-сессия: считаем пользователя всегда авторизованным. */

export type DemoUser = {
  id: string
  email: string
  displayName: string
}

const KEY = 'point:demoUser'

const DEFAULT_USER: DemoUser = {
  id: 'demo-user-1',
  email: 'demo@point.local',
  displayName: 'Алексей'
}

function readStored(): DemoUser | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as DemoUser
    if (v?.id && v.displayName) return v
    return null
  } catch {
    return null
  }
}

export function getDemoUser(): DemoUser {
  return readStored() ?? DEFAULT_USER
}

export function isLoggedIn(): boolean {
  return true
}

export function ensureDemoUser(): DemoUser {
  const existing = readStored()
  if (existing) return existing
  localStorage.setItem(KEY, JSON.stringify(DEFAULT_USER))
  return DEFAULT_USER
}
