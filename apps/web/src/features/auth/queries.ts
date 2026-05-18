import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import type { OrganizerRequest, OrganizerRequestAdmin, UserMe } from './types'

const CategoryRefSchema = z.object({ id: z.number(), name: z.string() })

const UserMeSchema = z.object({
  id: z.number(),
  email: z.string(),
  display_name: z.string(),
  role: z.enum(['user', 'organizer', 'moderator', 'admin']),
  account_type: z.enum(['viewer', 'organizer']),
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

const OrganizerRequestSchema = z.object({
  id: z.number(),
  status: z.enum(['pending', 'approved', 'rejected']),
  description: z.string(),
  document_path: z.string(),
  admin_note: z.string().nullable(),
  created_at: z.string(),
  reviewed_at: z.string().nullable(),
})

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
      return me
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth'] }),
  })
}

export function useRegister() {
  const qc = useQueryClient()
  const setSession = useAuthStore((s) => s.setSession)
  return useMutation({
    mutationFn: async (body: {
      email: string
      password: string
      display_name: string
      account_type?: 'viewer' | 'organizer'
      organizer_description?: string
    }) => {
      const res = await api.post('/api/v1/auth/register', {
        ...body,
        account_type: body.account_type ?? 'viewer',
      })
      const { access_token } = TokenSchema.parse(res.data)
      useAuthStore.setState({ token: access_token })
      try {
        localStorage.setItem('point:accessToken', access_token)
      } catch {
        // ignore
      }
      const me = await fetchMe()
      setSession(access_token, me)
      return me
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth'] }),
  })
}

export function useRegisterOrganizer() {
  const qc = useQueryClient()
  const setSession = useAuthStore((s) => s.setSession)
  return useMutation({
    mutationFn: async (form: FormData) => {
      const res = await api.post('/api/v1/auth/register/organizer', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const { access_token } = TokenSchema.parse(res.data)
      useAuthStore.setState({ token: access_token })
      try {
        localStorage.setItem('point:accessToken', access_token)
      } catch {
        // ignore
      }
      const me = await fetchMe()
      setSession(access_token, me)
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

export function useOrganizerRequest() {
  const token = useAuthStore((s) => s.token)
  return useQuery({
    queryKey: ['auth', 'organizer-request'],
    queryFn: async (): Promise<OrganizerRequest | null> => {
      const res = await api.get('/api/v1/users/me/organizer-request')
      if (res.data == null) return null
      return OrganizerRequestSchema.parse(res.data)
    },
    enabled: Boolean(token),
  })
}

export function useSubmitOrganizerRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (form: FormData) => {
      const res = await api.post('/api/v1/users/me/organizer-request', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return OrganizerRequestSchema.parse(res.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'organizer-request'] }),
  })
}

export function useAdminOrganizerRequests(status?: string) {
  return useQuery({
    queryKey: ['admin', 'organizer-requests', status],
    queryFn: async (): Promise<OrganizerRequestAdmin[]> => {
      const res = await api.get('/api/v1/admin/organizer-requests', { params: status ? { status } : {} })
      const schema = z.object({
        items: z.array(
          OrganizerRequestSchema.extend({
            user_id: z.number(),
            user_email: z.string(),
            user_display_name: z.string(),
          })
        ),
      })
      return schema.parse(res.data).items
    },
  })
}

export function useReviewOrganizerRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { id: number; status: 'approved' | 'rejected'; admin_note?: string }) => {
      const res = await api.patch(`/api/v1/admin/organizer-requests/${args.id}`, {
        status: args.status,
        admin_note: args.admin_note,
      })
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  })
}

export async function hydrateSessionFromToken() {
  const token = useAuthStore.getState().token
  if (!token) return null
  try {
    const me = await fetchMe()
    useAuthStore.getState().setUser(me)
    return me
  } catch {
    useAuthStore.getState().logout()
    return null
  }
}
