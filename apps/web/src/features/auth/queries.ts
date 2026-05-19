import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import { enablePwaPush } from '../../lib/push'
import type { UserMe } from './types'

const CategoryRefSchema = z.object({ id: z.number(), name: z.string() })

const UserMeSchema = z.object({
  id: z.number(),
  email: z.string(),
  display_name: z.string(),
  role: z.enum(['user', 'admin']),
  account_type: z.string(),
  avatar_url: z.string().nullable(),
  bio: z.string().nullable(),
  organizer_description: z.string().nullable(),
  phone: z.string().nullable(),
  city: z.string().nullable(),
  email_verified: z.boolean(),
  created_at: z.string(),
  notify_email: z.boolean(),
  notify_push: z.boolean(),
  locale: z.string(),
  profile_visibility: z.enum(['public', 'friends', 'private']),
  interests: z.array(CategoryRefSchema),
})

const TokenSchema = z.object({ access_token: z.string(), token_type: z.string().optional() })

async function fetchMe(): Promise<UserMe> {
  const res = await api.get('/api/v1/users/me')
  return UserMeSchema.parse(res.data)
}

export function useMe(enabled = true) {
  const token = useAuthStore((s) => s.token)
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchMe,
    enabled: enabled && Boolean(token),
    staleTime: 30_000,
  })
}

export function useLogin() {
  const qc = useQueryClient()
  const setSession = useAuthStore((s) => s.setSession)
  return useMutation({
    mutationFn: async (body: { email: string; password: string }) => {
      const res = await api.post('/api/v1/auth/login', body)
      const { access_token } = TokenSchema.parse(res.data)
      useAuthStore.setState({ token: access_token })
      try {
        localStorage.setItem('point:accessToken', access_token)
      } catch {
        // ignore
      }
      const me = await fetchMe()
      setSession(access_token, me)
      if (me.notify_push) void enablePwaPush()
      return me
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth'] }),
  })
}

export function useRegister() {
  const qc = useQueryClient()
  const setSession = useAuthStore((s) => s.setSession)
  return useMutation({
    mutationFn: async (body: { email: string; password: string; display_name: string }) => {
      const res = await api.post('/api/v1/auth/register', body)
      const { access_token } = TokenSchema.parse(res.data)
      useAuthStore.setState({ token: access_token })
      try {
        localStorage.setItem('point:accessToken', access_token)
      } catch {
        // ignore
      }
      const me = await fetchMe()
      setSession(access_token, me)
      if (me.notify_push) void enablePwaPush()
      return me
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth'] }),
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)
  return useMutation({
    mutationFn: async (
      body: Partial<Pick<UserMe, 'display_name' | 'bio' | 'organizer_description' | 'phone' | 'city'>>
    ) => {
      const res = await api.patch('/api/v1/users/me', body)
      const me = UserMeSchema.parse(res.data)
      setUser(me)
      return me
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'me'] }),
  })
}

export function useUploadAvatar() {
  const qc = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData()
      fd.append('avatar', file)
      const res = await api.post('/api/v1/users/me/avatar', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const me = UserMeSchema.parse(res.data)
      setUser(me)
      return me
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'me'] }),
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)
  return useMutation({
    mutationFn: async (body: Partial<Pick<UserMe, 'notify_email' | 'notify_push' | 'locale' | 'profile_visibility'>>) => {
      const res = await api.patch('/api/v1/users/me/settings', body)
      const me = UserMeSchema.parse(res.data)
      setUser(me)
      return me
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'me'] }),
  })
}

export function useSetInterests() {
  const qc = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)
  return useMutation({
    mutationFn: async (category_ids: number[]) => {
      const res = await api.put('/api/v1/users/me/interests', { category_ids })
      const me = UserMeSchema.parse(res.data)
      setUser(me)
      try {
        const names = me.interests.map((c) => c.name)
        localStorage.setItem('point:userInterests', JSON.stringify(names))
      } catch {
        // ignore
      }
      return me
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'me'] }),
  })
}

export async function hydrateSessionFromToken() {
  const token = useAuthStore.getState().token
  if (!token) return null
  try {
    const me = await fetchMe()
    useAuthStore.getState().setUser(me)
    if (me.notify_push) void enablePwaPush()
    return me
  } catch {
    useAuthStore.getState().logout()
    return null
  }
}
