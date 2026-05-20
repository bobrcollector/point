import { isAxiosError } from 'axios'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthFormLayout } from '../components/AuthFormLayout'
import { useMe, useRegister } from '../features/auth/queries'
import { useAuthStore } from '../stores/authStore'

export function RegisterPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const meQ = useMe(Boolean(token))
  const register = useRegister()

  const fromRaw = (location.state as { from?: string } | null)?.from
  const from = fromRaw && fromRaw !== '/login' && fromRaw !== '/register' ? fromRaw : '/'

  const profile = user ?? meQ.data
  if (token && profile) {
    return <Navigate to={from} replace />
  }
  if (token && meQ.isPending) {
    return (
      <div className="page authPage">
        <p className="pageSub">Загрузка сессии…</p>
      </div>
    )
  }

  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      await register.mutateAsync({ email, password, display_name: displayName })
      navigate('/account', { replace: true })
    } catch {
      // shown below
    }
  }

  const err =
    register.isError && isAxiosError(register.error)
      ? (register.error.response?.data as { detail?: string })?.detail ?? 'Ошибка регистрации'
      : register.isError
        ? 'Ошибка регистрации'
        : null

  return (
    <AuthFormLayout
      title="Регистрация"
      subtitle="Создайте аккаунт — события можно публиковать сразу после входа"
      footer={
        <p className="authFooter">
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </p>
      }
    >
      <form className="authForm" onSubmit={onSubmit}>
        <label className="label" htmlFor="reg-email">
          Email
        </label>
        <input
          id="reg-email"
          className="input authInput"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="label" htmlFor="reg-name">
          Имя
        </label>
        <input
          id="reg-name"
          className="input authInput"
          required
          minLength={2}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />

        <label className="label" htmlFor="reg-pass">
          Пароль
        </label>
        <input
          id="reg-pass"
          className="input authInput"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {err ? <p className="authError">{err}</p> : null}

        <button type="submit" className="homePrimaryBtn authSubmit" disabled={register.isPending}>
          {register.isPending ? 'Регистрация…' : 'Зарегистрироваться'}
        </button>
      </form>
    </AuthFormLayout>
  )
}
