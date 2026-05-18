import { isAxiosError } from 'axios'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthFormLayout } from '../components/AuthFormLayout'
import { useRegister, useRegisterOrganizer } from '../features/auth/queries'
import type { AccountType } from '../features/auth/types'

export function RegisterPage() {
  const navigate = useNavigate()
  const registerViewer = useRegister()
  const registerOrganizer = useRegisterOrganizer()

  const [accountType, setAccountType] = useState<AccountType>('viewer')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [orgDesc, setOrgDesc] = useState('')
  const [orgFile, setOrgFile] = useState<File | null>(null)

  const pending = registerViewer.isPending || registerOrganizer.isPending

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      if (accountType === 'viewer') {
        await registerViewer.mutateAsync({
          email,
          password,
          display_name: displayName,
          account_type: 'viewer',
        })
      } else {
        if (!orgFile) return
        const fd = new FormData()
        fd.append('email', email)
        fd.append('password', password)
        fd.append('display_name', displayName)
        fd.append('organizer_description', orgDesc)
        fd.append('document', orgFile)
        await registerOrganizer.mutateAsync(fd)
      }
      navigate('/account', { replace: true })
    } catch {
      // shown below
    }
  }

  const errSource = registerOrganizer.isError ? registerOrganizer.error : registerViewer.error
  const isError = registerViewer.isError || registerOrganizer.isError
  const err =
    isError && isAxiosError(errSource)
      ? (errSource.response?.data as { detail?: string })?.detail ?? 'Ошибка регистрации'
      : isError
        ? 'Ошибка регистрации'
        : null

  return (
    <AuthFormLayout
      title="Регистрация"
      subtitle="Выберите тип профиля — его можно будет изменить только через поддержку"
      footer={
        <p className="authFooter">
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </p>
      }
    >
      <form className="authForm" onSubmit={onSubmit}>
        <span className="label">Тип профиля</span>
        <div className="profileTypePicker" role="group" aria-label="Тип профиля">
          <button
            type="button"
            className={accountType === 'viewer' ? 'profileTypeOption active' : 'profileTypeOption'}
            onClick={() => setAccountType('viewer')}
          >
            <strong>Зритель</strong>
            <span>Смотрю события, сохраняю интересы</span>
          </button>
          <button
            type="button"
            className={accountType === 'organizer' ? 'profileTypeOption active' : 'profileTypeOption'}
            onClick={() => setAccountType('organizer')}
          >
            <strong>Организатор</strong>
            <span>Создаю и веду мероприятия</span>
          </button>
        </div>

        <label className="label" htmlFor="reg-name">
          Имя
        </label>
        <input
          id="reg-name"
          className="input authInput"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          minLength={2}
          required
        />
        <label className="label" htmlFor="reg-email">
          Email
        </label>
        <input
          id="reg-email"
          className="input authInput"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label className="label" htmlFor="reg-password">
          Пароль (от 8 символов)
        </label>
        <input
          id="reg-password"
          className="input authInput"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />

        {accountType === 'organizer' ? (
          <>
            <label className="label" htmlFor="reg-org-desc">
              О деятельности организатора
            </label>
            <textarea
              id="reg-org-desc"
              className="input authTextarea"
              value={orgDesc}
              onChange={(e) => setOrgDesc(e.target.value)}
              minLength={20}
              rows={4}
              required
              placeholder="Формат мероприятий, опыт, площадки…"
            />
            <label className="label" htmlFor="reg-org-doc">
              Подтверждающий документ (PDF, JPG, PNG, до 5 МБ)
            </label>
            <input
              id="reg-org-doc"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(e) => setOrgFile(e.target.files?.[0] ?? null)}
              required
            />
          </>
        ) : null}

        {err ? <p className="authError">{err}</p> : null}
        <button type="submit" className="homePrimaryBtn authSubmit" disabled={pending}>
          {pending ? 'Создаём…' : accountType === 'organizer' ? 'Зарегистрироваться как организатор' : 'Зарегистрироваться'}
        </button>
      </form>
    </AuthFormLayout>
  )
}
