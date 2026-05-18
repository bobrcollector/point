import { isAxiosError } from 'axios'
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { AuthFormLayout } from '../components/AuthFormLayout'

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!token) {
      setError('Нет токена в ссылке')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await api.post('/api/v1/auth/reset-password', { token, new_password: password })
      setDone(true)
    } catch (err) {
      if (isAxiosError(err)) {
        const detail = (err.response?.data as { detail?: string })?.detail
        setError(detail ?? 'Ссылка недействительна')
      } else setError('Ошибка')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthFormLayout title="Новый пароль">
      {done ? (
        <>
          <p className="authSuccess">Пароль обновлён.</p>
          <p className="authFooter">
            <Link to="/login">Войти</Link>
          </p>
        </>
      ) : (
        <form className="authForm" onSubmit={onSubmit}>
          <label className="label" htmlFor="rp-password">
            Новый пароль
          </label>
          <input
            id="rp-password"
            className="input authInput"
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error ? <p className="authError">{error}</p> : null}
          <button type="submit" className="homePrimaryBtn authSubmit" disabled={loading || !token}>
            {loading ? 'Сохраняем…' : 'Сохранить пароль'}
          </button>
        </form>
      )}
    </AuthFormLayout>
  )
}
