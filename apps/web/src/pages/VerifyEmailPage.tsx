import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { AuthFormLayout } from '../components/AuthFormLayout'

export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      return
    }
    api
      .post('/api/v1/auth/verify-email', { token })
      .then(() => setStatus('ok'))
      .catch(() => setStatus('error'))
  }, [token])

  return (
    <AuthFormLayout title="Подтверждение email">
      {status === 'loading' ? <p className="authSub">Проверяем ссылку…</p> : null}
      {status === 'ok' ? (
        <>
          <p className="authSuccess">Email подтверждён. Спасибо!</p>
          <p className="authFooter">
            <Link to="/account">В профиль</Link>
          </p>
        </>
      ) : null}
      {status === 'error' ? (
        <>
          <p className="authError">Ссылка недействительна или устарела.</p>
          <p className="authFooter">
            <Link to="/account">В профиль</Link> — можно запросить письмо повторно
          </p>
        </>
      ) : null}
    </AuthFormLayout>
  )
}
