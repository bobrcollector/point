import { isAxiosError } from 'axios'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthFormLayout } from '../components/AuthFormLayout'
import { useLogin } from '../features/auth/queries'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const login = useLogin()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const from = (location.state as { from?: string } | null)?.from ?? '/account'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      await login.mutateAsync({ email, password })
      navigate(from, { replace: true })
    } catch {
      // shown below
    }
  }

  const err =
    login.isError && isAxiosError(login.error)
      ? (login.error.response?.data as { detail?: string })?.detail ?? 'Ошибка входа'
      : login.isError
        ? 'Ошибка входа'
        : null

  return (
    <AuthFormLayout
      title="Вход"
      subtitle="Войдите, чтобы участвовать в событиях и управлять профилем"
      footer={
        <p className="authFooter">
          Нет аккаунта? <Link to="/register">Регистрация</Link>
        </p>
      }
    >
      <form className="authForm" onSubmit={onSubmit}>
        <label className="label" htmlFor="login-email">
          Email
        </label>
        <input
          id="login-email"
          className="input authInput"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label className="label" htmlFor="login-password">
          Пароль
        </label>
        <input
          id="login-password"
          className="input authInput"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Link className="authLinkMuted" to="/forgot-password">
          Забыли пароль?
        </Link>
        {err ? <p className="authError">{err}</p> : null}
        <button type="submit" className="homePrimaryBtn authSubmit" disabled={login.isPending}>
          {login.isPending ? 'Входим…' : 'Войти'}
        </button>
      </form>
      <p className="authHint">Демо: dev@point.local / dev12345</p>
    </AuthFormLayout>
  )
}
