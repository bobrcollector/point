import { create } from 'zustand'
import type { UserMe } from '../features/auth/types'

const TOKEN_KEY = 'point:accessToken'

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
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
      localStorage.setItem(TOKEN_KEY, token)
    } catch {
      // ignore
    }
    set({ token, user, hydrated: true })
  },

  setUser: (user) => set({ user }),

  logout: () => {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      // ignore
    }
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
