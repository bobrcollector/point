import { Link } from 'react-router-dom'
import { IconUser } from '../components/NavGlyphs'
import { RequireAuth } from '../components/RequireAuth'
import { useMe } from '../features/auth/queries'
import { ROLE_LABELS } from '../features/auth/types'
import { useAuthStore } from '../stores/authStore'

function AccountContent() {
  const user = useAuthStore((s) => s.user)
  const meQ = useMe()
  const profile = meQ.data ?? user

  if (!profile) {
    return (
      <div className="page">
        <p className="pageSub">Загрузка профиля…</p>
      </div>
    )
  }

  const roleLabel = profile.role === 'admin' ? ROLE_LABELS.admin : null

  return (
    <div className="page accountPage">
      <div className="pageHeader accountHeader">
        <div>
          <div className="pageTitle">Профиль</div>
          <div className="pageSub">Ваши данные и интересы для подбора мероприятий</div>
        </div>
        <Link className="homePrimaryBtn" to="/settings">
          Редактировать
        </Link>
      </div>

      <section className="profileViewCard">
        <div className="profileViewHero">
          <div className="profileViewAvatar" aria-hidden>
            {profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : <IconUser />}
          </div>
          <div className="profileViewIdentity">
            <h1 className="profileViewName">{profile.display_name}</h1>
            <div className="profileViewMeta">
              {roleLabel ? <span className="roleBadge">{roleLabel}</span> : null}
              {profile.email_verified ? (
                <span className="verifiedMark">email подтверждён</span>
              ) : (
                <span className="profileViewMuted">email не подтверждён</span>
              )}
            </div>
            {profile.city ? <p className="profileViewCity">{profile.city}</p> : null}
          </div>
        </div>

        <div className="profileViewBlock">
          <h2 className="profileViewLabel">О себе</h2>
          <p className="profileViewText">{profile.bio?.trim() || 'Пока ничего не указано'}</p>
        </div>

        {profile.phone ? (
          <div className="profileViewBlock">
            <h2 className="profileViewLabel">Контакты</h2>
            <p className="profileViewText">{profile.phone}</p>
          </div>
        ) : null}

        <div className="profileViewBlock">
          <h2 className="profileViewLabel">Интересы</h2>
          <p className="profileViewHint">По этим категориям мы подбираем и выделяем мероприятия в ленте</p>
          {profile.interests.length > 0 ? (
            <div className="profileViewInterests">
              {profile.interests.map((c) => (
                <span key={c.id} className="pill active profileViewPill">
                  {c.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="profileViewText profileViewMuted">Интересы не выбраны</p>
          )}
        </div>
      </section>

      <section className="profileViewCard">
        <h2 className="accountSectionTitle">Мои события</h2>
        <p className="profileViewHint">Создавайте и публикуйте мероприятия — после отправки они проходят модерацию</p>
        <Link to="/create" className="homePrimaryBtn" style={{ display: 'inline-flex', marginTop: 8 }}>
          Создать событие
        </Link>
      </section>
    </div>
  )
}

export function AccountPage() {
  return (
    <RequireAuth>
      <AccountContent />
    </RequireAuth>
  )
}
