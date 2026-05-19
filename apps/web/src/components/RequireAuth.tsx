import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

type Props = {
  children: React.ReactNode
  roles?: Array<'user' | 'admin'>
}

export function RequireAuth({ children, roles }: Props) {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const location = useLocation()

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (roles && user && !roles.includes(user.role)) {
    return <Navigate to="/account" replace />
  }

  return <>{children}</>
}
