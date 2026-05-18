import { useState } from 'react'
import { RequireAuth } from '../components/RequireAuth'
import { useAdminOrganizerRequests, useReviewOrganizerRequest } from '../features/auth/queries'
import { canModerate } from '../features/auth/types'
import { useAuthStore } from '../stores/authStore'
import { Navigate } from 'react-router-dom'

function AdminContent() {
  const [filter, setFilter] = useState<string>('pending')
  const q = useAdminOrganizerRequests(filter || undefined)
  const review = useReviewOrganizerRequest()
  const [note, setNote] = useState<Record<number, string>>({})

  return (
    <div className="page adminPage">
      <div className="pageHeader">
        <div>
          <div className="pageTitle">Админ-панель</div>
          <div className="pageSub">Заявки на статус организатора</div>
        </div>
      </div>

      <div className="adminFilters">
        {['pending', 'approved', 'rejected', ''].map((s) => (
          <button
            key={s || 'all'}
            type="button"
            className={filter === s ? 'pill active' : 'pill'}
            onClick={() => setFilter(s)}
          >
            {s === '' ? 'Все' : s === 'pending' ? 'На рассмотрении' : s === 'approved' ? 'Одобрено' : 'Отклонено'}
          </button>
        ))}
      </div>

      {q.isPending ? <p className="pageSub">Загрузка…</p> : null}
      <div className="adminList">
        {q.data?.map((item) => {
          const docHref = item.document_path.startsWith('http')
            ? item.document_path
            : `/uploads/${item.document_path.replace(/^uploads[/\\]/, '')}`
          return (
            <article key={item.id} className="adminCard">
              <div className="adminCardHead">
                <strong>{item.user_display_name}</strong>
                <span className="roleBadge">{item.user_email}</span>
                <span className={`statusBadge status-${item.status}`}>{item.status}</span>
              </div>
              <p className="adminCardDesc">{item.description}</p>
              <p className="pageSub">
                <a href={docHref} target="_blank" rel="noreferrer">
                  Документ
                </a>
                {' · '}
                {new Date(item.created_at).toLocaleString('ru-RU')}
              </p>
              {item.status === 'pending' ? (
                <div className="adminCardActions">
                  <input
                    className="input authInput"
                    placeholder="Комментарий модератора"
                    value={note[item.id] ?? ''}
                    onChange={(e) => setNote((n) => ({ ...n, [item.id]: e.target.value }))}
                  />
                  <div className="adminCardBtns">
                    <button
                      type="button"
                      className="homePrimaryBtn"
                      disabled={review.isPending}
                      onClick={() =>
                        review.mutate({ id: item.id, status: 'approved', admin_note: note[item.id] })
                      }
                    >
                      Одобрить
                    </button>
                    <button
                      type="button"
                      className="homeGhostBtn"
                      disabled={review.isPending}
                      onClick={() =>
                        review.mutate({ id: item.id, status: 'rejected', admin_note: note[item.id] })
                      }
                    >
                      Отклонить
                    </button>
                  </div>
                </div>
              ) : item.admin_note ? (
                <p className="pageSub">Комментарий: {item.admin_note}</p>
              ) : null}
            </article>
          )
        })}
      </div>
      {q.data?.length === 0 && !q.isPending ? <p className="emptyCard">Заявок нет</p> : null}
    </div>
  )
}

export function AdminPage() {
  const role = useAuthStore((s) => s.user?.role)
  return (
    <RequireAuth roles={['moderator', 'admin']}>
      {canModerate(role) ? <AdminContent /> : <Navigate to="/account" replace />}
    </RequireAuth>
  )
}
