import { create } from 'zustand'
import type { UserMe } from '../features/auth/types'

const TOKEN_KEY = 'point:accessToken'

function readToken(): string | null {
  try {
    const fromLocal = localStorage.getItem(TOKEN_KEY)
    if (fromLocal) return fromLocal
    // Миграция: ранее токен мог лежать только в sessionStorage (мобильные сессии).
    const fromSession = sessionStorage.getItem(TOKEN_KEY)
    if (fromSession) {
      localStorage.setItem(TOKEN_KEY, fromSession)
      sessionStorage.removeItem(TOKEN_KEY)
      return fromSession
    }
    return null
  } catch {
    return null
  }
}

function writeToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
  try {
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore
  }
}

function clearStoredToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
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
