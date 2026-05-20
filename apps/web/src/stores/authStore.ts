import { create } from 'zustand'
import type { UserMe } from '../features/auth/types'

const TOKEN_KEY = 'point:accessToken'

function readToken(): string | null {
  try {
    const fromSession = sessionStorage.getItem(TOKEN_KEY)
    if (fromSession) return fromSession
    // Одноразовая миграция: раньше токен лежал в localStorage — переносим в session.
    const legacy = localStorage.getItem(TOKEN_KEY)
    if (legacy) {
      sessionStorage.setItem(TOKEN_KEY, legacy)
      localStorage.removeItem(TOKEN_KEY)
      return legacy
    }
    return null
  } catch {
    return null
  }
}

function writeToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token)
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore
  }
}

function clearStoredToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore
  }
}

type AuthState = {
  token: string | null
  user: UserMe | null
  hydrated: boolean
  setSession: (token: string, user: UserMe) => void
  setUser: (user: UserMe) => void
  logout: () => void
  hydrate: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  hydrated: false,

  setSession: (token, user) => {
    try {
      writeToken(token)
    } catch {
      // ignore
    }
    set({ token, user, hydrated: true })
  },

  setUser: (user) => set({ user }),

  logout: () => {
    clearStoredToken()
    set({ token: null, user: null })
  },

  hydrate: () => {
    const token = readToken()
    set({ token, hydrated: true })
  },
}))

export function getAccessToken() {
  return useAuthStore.getState().token ?? readToken()
}
