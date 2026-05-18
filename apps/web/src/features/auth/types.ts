export type UserRole = 'user' | 'organizer' | 'moderator' | 'admin'
export type AccountType = 'viewer' | 'organizer'

export type CategoryRef = { id: number; name: string }

export type UserMe = {
  id: number
  email: string
  display_name: string
  role: UserRole
  account_type: AccountType
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

export type OrganizerRequest = {
  id: number
  status: 'pending' | 'approved' | 'rejected'
  description: string
  document_path: string
  admin_note: string | null
  created_at: string
  reviewed_at: string | null
}

export type OrganizerRequestAdmin = OrganizerRequest & {
  user_id: number
  user_email: string
  user_display_name: string
}

export const ROLE_LABELS: Record<UserRole, string> = {
  user: 'Пользователь',
  organizer: 'Организатор',
  moderator: 'Модератор',
  admin: 'Администратор',
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  viewer: 'Зритель',
  organizer: 'Организатор',
}

export function canModerate(role: UserRole | null | undefined) {
  return role === 'moderator' || role === 'admin'
}

export function isOrganizerRole(role: UserRole | null | undefined) {
  return role === 'organizer' || canModerate(role)
}

/** Профиль с разделом организатора (выбран при регистрации) */
export function isOrganizerProfile(user: Pick<UserMe, 'account_type'> | null | undefined) {
  return user?.account_type === 'organizer'
}
