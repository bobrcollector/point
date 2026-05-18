import { isAxiosError } from 'axios'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { AuthFormLayout } from '../components/AuthFormLayout'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await api.post('/api/v1/auth/forgot-password', { email })
      setDone(true)
    } catch (err) {
      if (isAxiosError(err)) setError('Не удалось отправить запрос')
      else setError('Ошибка')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthFormLayout title="Восстановление пароля" subtitle="Укажите email — в dev-режиме ссылка появится в логах API">
      {done ? (
        <p className="authSuccess">
          Если аккаунт существует, инструкция отправлена. Проверьте консоль сервера API (uvicorn).
        </p>
      ) : (
        <form className="authForm" onSubmit={onSubmit}>
          <label className="label" htmlFor="fp-email">
            Email
          </label>
          <input
            id="fp-email"
            className="input authInput"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {error ? <p className="authError">{error}</p> : null}
          <button type="submit" className="homePrimaryBtn authSubmit" disabled={loading}>
            {loading ? 'Отправляем…' : 'Отправить ссылку'}
          </button>
        </form>
      )}
      <p className="authFooter">
        <Link to="/login">← Назад ко входу</Link>
      </p>
    </AuthFormLayout>
  )
}
