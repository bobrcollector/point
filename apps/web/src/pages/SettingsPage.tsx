import { isAxiosError } from 'axios'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ProfileAvatarUpload } from '../components/ProfileAvatarUpload'
import { RequireAuth } from '../components/RequireAuth'
import { useCategories } from '../features/catalog/queries'
import {
  useMe,
  useSetInterests,
  useUpdateProfile,
  useUpdateSettings,
  useUploadAvatar,
} from '../features/auth/queries'
import { api } from '../lib/api'
import { enablePwaPush } from '../lib/push'
import { useAuthStore } from '../stores/authStore'
import type { UserMe } from '../features/auth/types'

function SettingsForm({ profile }: { profile: UserMe }) {
  const logout = useAuthStore((s) => s.logout)
  const updateProfile = useUpdateProfile()
  const uploadAvatar = useUploadAvatar()
  const setInterests = useSetInterests()
  const updateSettings = useUpdateSettings()
  const categoriesQ = useCategories()
  const [displayName, setDisplayName] = useState(profile.display_name)
  const [bio, setBio] = useState(profile.bio ?? '')
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [city, setCity] = useState(profile.city ?? '')
  const [selectedCats, setSelectedCats] = useState<number[]>(() => profile.interests.map((c) => c.id))

  const [notifyEmail, setNotifyEmail] = useState(profile.notify_email)
  const [notifyPush, setNotifyPush] = useState(profile.notify_push)
  const [locale, setLocale] = useState(profile.locale)
  const [visibility, setVisibility] = useState<'public' | 'friends' | 'private'>(profile.profile_visibility)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  async function saveProfile(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    try {
      await updateProfile.mutateAsync({
        display_name: displayName,
        bio: bio || null,
        phone: phone || null,
        city: city || null,
      })
      setMsg('Профиль сохранён')
    } catch {
      setMsg('Ошибка сохранения профиля')
    }
  }

  async function saveInterests(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    try {
      await setInterests.mutateAsync(selectedCats)
      setMsg('Интересы сохранены')
    } catch {
      setMsg('Ошибка сохранения интересов')
    }
  }

  async function saveAppSettings(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    try {
      await updateSettings.mutateAsync({
        notify_email: notifyEmail,
        notify_push: notifyPush,
        locale,
        profile_visibility: visibility,
      })
      if (notifyPush) await enablePwaPush()
      setMsg('Настройки приложения сохранены')
    } catch {
      setMsg('Ошибка сохранения')
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    try {
      await api.post('/api/v1/users/me/password', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      setCurrentPassword('')
      setNewPassword('')
      setMsg('Пароль изменён')
    } catch (err) {
      const detail = isAxiosError(err) ? (err.response?.data as { detail?: string })?.detail : null
      setMsg(detail ?? 'Ошибка смены пароля')
    }
  }

  async function resendVerification() {
    try {
      await api.post('/api/v1/auth/resend-verification')
      setMsg('Ссылка подтверждения в логах API')
    } catch {
      setMsg('Не удалось отправить подтверждение')
    }
  }

  const toggleCat = (id: number) => {
    setSelectedCats((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return (
    <div className="page myEventsPage settingsPage">
      <header className="myEventsHeader">
        <div>
          <h1 className="myEventsTitle">Настройки профиля</h1>
          <p className="eventDetailMuted">Редактирование профиля, интересов и параметров аккаунта</p>
        </div>
        <Link className="homeGhostBtn" to="/account">
          ← К профилю
        </Link>
      </header>

      {msg ? <p className="authBanner">{msg}</p> : null}

      {!profile.email_verified ? (
        <section className="accountSection">
          <h2 className="accountSectionTitle">Подтверждение email</h2>
          <p className="pageSub">{profile.email}</p>
          <button type="button" className="homeGhostBtn" onClick={resendVerification}>
            Отправить ссылку повторно
          </button>
        </section>
      ) : null}

      <section className="accountSection" id="profile">
        <h2 className="accountSectionTitle">Профиль</h2>
        <ProfileAvatarUpload
          avatarUrl={profile.avatar_url}
          displayName={displayName || profile.display_name}
          uploading={uploadAvatar.isPending}
          onUpload={(file) => {
            setMsg(null)
            uploadAvatar.mutate(file, {
              onSuccess: () => setMsg('Фото обновлено'),
              onError: () => setMsg('Не удалось загрузить фото'),
            })
          }}
        />
        <form className="accountForm" onSubmit={saveProfile}>
          <label className="label">Имя</label>
          <input
            className="input authInput"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
          <label className="label">О себе</label>
          <textarea className="input authTextarea" value={bio} onChange={(e) => setBio(e.target.value)} rows={4} />
          <label className="label">Телефон</label>
          <input className="input authInput" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <label className="label">Город</label>
          <input className="input authInput" value={city} onChange={(e) => setCity(e.target.value)} />
          <button type="submit" className="homePrimaryBtn" disabled={updateProfile.isPending}>
            Сохранить профиль
          </button>
        </form>
      </section>

      <section className="accountSection">
        <h2 className="accountSectionTitle">Интересы</h2>
        <p className="pageSub">По выбранным категориям подбираются мероприятия в ленте и на карте</p>
        <form className="accountForm" onSubmit={saveInterests}>
          <div className="interestGrid">
            {categoriesQ.data?.map((c) => (
              <button
                key={c.id}
                type="button"
                className={selectedCats.includes(c.id) ? 'pill active' : 'pill'}
                onClick={() => toggleCat(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
          <button type="submit" className="homePrimaryBtn" disabled={setInterests.isPending}>
            Сохранить интересы
          </button>
        </form>
      </section>

      <section className="accountSection">
        <h2 className="accountSectionTitle">Уведомления и интерфейс</h2>
        <form className="accountForm" onSubmit={saveAppSettings}>
          <label className="accountCheck">
            <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} />
            Email-уведомления
          </label>
          <label className="accountCheck">
            <input type="checkbox" checked={notifyPush} onChange={(e) => setNotifyPush(e.target.checked)} />
            Push-уведомления
          </label>
          <label className="label">Язык интерфейса</label>
          <select className="select authInput" value={locale} onChange={(e) => setLocale(e.target.value)}>
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
          <label className="label">Приватность профиля</label>
          <select
            className="select authInput"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as 'public' | 'friends' | 'private')}
          >
            <option value="public">Публичный</option>
            <option value="friends">Только участники моих событий</option>
            <option value="private">Скрытый</option>
          </select>
          <button type="submit" className="homePrimaryBtn" disabled={updateSettings.isPending}>
            Сохранить
          </button>
        </form>
      </section>

      <section className="accountSection">
        <h2 className="accountSectionTitle">Смена пароля</h2>
        <form className="accountForm" onSubmit={changePassword}>
          <label className="label">Текущий пароль</label>
          <input
            className="input authInput"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <label className="label">Новый пароль</label>
          <input
            className="input authInput"
            type="password"
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <button type="submit" className="homeGhostBtn">
            Обновить пароль
          </button>
        </form>
      </section>

      <section className="accountSection">
        <button type="button" className="homeGhostBtn authLogoutBtn" onClick={() => logout()}>
          Выйти из аккаунта
        </button>
      </section>
    </div>
  )
}

function SettingsContent() {
  const user = useAuthStore((s) => s.user)
  const meQ = useMe()
  const profile = meQ.data ?? user

  if (!profile) {
    return (
      <div className="page myEventsPage settingsPage">
        <header className="myEventsHeader">
          <h1 className="myEventsTitle">Настройки профиля</h1>
        </header>
        <p className="pageSub">Загрузка…</p>
      </div>
    )
  }

  return <SettingsForm key={profile.id} profile={profile} />
}

export function SettingsPage() {
  return (
    <RequireAuth>
      <SettingsContent />
    </RequireAuth>
  )
}
