import { Link } from 'react-router-dom'
import { IconUser } from '../components/NavGlyphs'
import { RequireAuth } from '../components/RequireAuth'
import { useMe, useOrganizerRequest } from '../features/auth/queries'
import {
  ACCOUNT_TYPE_LABELS,
  ROLE_LABELS,
  isOrganizerProfile,
  isOrganizerRole,
} from '../features/auth/types'
import { useAuthStore } from '../stores/authStore'

function AccountContent() {
  const user = useAuthStore((s) => s.user)
  const meQ = useMe()
  const profile = meQ.data ?? user
  const orgReqQ = useOrganizerRequest()

  const showOrganizerSection = profile ? isOrganizerProfile(profile) : false

  if (!profile) {
    return (
      <div className="page">
        <p className="pageSub">Загрузка профиля…</p>
      </div>
    )
  }

  const accountLabel = ACCOUNT_TYPE_LABELS[profile.account_type]
  const roleLabel = isOrganizerRole(profile.role) ? ROLE_LABELS[profile.role] : null

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
              <span className="roleBadge">{accountLabel}</span>
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

      {showOrganizerSection ? (
        <section className="profileViewCard">
          <h2 className="accountSectionTitle">Организатор</h2>
          {isOrganizerRole(profile.role) ? (
            <p className="profileViewHint">Статус подтверждён — можно создавать события</p>
          ) : orgReqQ.data?.status === 'pending' ? (
            <p className="profileViewHint">Заявка на проверке</p>
          ) : orgReqQ.data?.status === 'rejected' ? (
            <p className="authError">Заявка отклонена: {orgReqQ.data.admin_note ?? 'без комментария'}</p>
          ) : (
            <p className="profileViewHint">Отправьте документы в настройках профиля</p>
          )}
          <div className="profileViewBlock">
            <h3 className="profileViewLabel">О деятельности</h3>
            <p className="profileViewText">
              {profile.organizer_description?.trim() || 'Описание не заполнено'}
            </p>
          </div>
        </section>
      ) : null}
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
