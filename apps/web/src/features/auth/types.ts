export type UserRole = 'user' | 'admin'

export type CategoryRef = { id: number; name: string }

export type UserMe = {
  id: number
  email: string
  display_name: string
  role: UserRole
  account_type: string
  avatar_url: string | null
  bio: string | null
  organizer_description: string | null
  phone: string | null
  city: string | null
  email_verified: boolean
  created_at: string
  notify_email: boolean
  notify_push: boolean
  locale: string
  profile_visibility: 'public' | 'friends' | 'private'
  interests: CategoryRef[]
}

export const ROLE_LABELS: Record<UserRole, string> = {
  user: 'Пользователь',
  admin: 'Администратор',
}

export function canModerate(role: UserRole | null | undefined) {
  return role === 'admin'
}
