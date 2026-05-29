import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { RequireAuth } from '../components/RequireAuth'
import {
  useAdminComplaints,
  useAdminEventsChart,
  useAdminMetrics,
  useAdminMutations,
  useAdminPendingEvents,
  useAdminUsers,
  useAdminUsersChart,
  type AdminComplaint,
  type AdminEvent,
  type AdminUser,
} from '../features/admin/queries'
import { canModerate } from '../features/auth/types'
import { useAuthStore } from '../stores/authStore'

type Tab = 'dashboard' | 'users' | 'pending' | 'complaints'

function formatDt(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function BarChart({ data, max }: { data: { label: string; count: number }[]; max: number }) {
  return (
    <div className="adminChart">
      {data.map((p) => (
        <div key={p.label} className="adminChartCol">
          <div className="adminChartBar" style={{ height: `${Math.max(8, (p.count / max) * 100)}%` }} title={`${p.count}`} />
          <span className="adminChartLabel">{p.label}</span>
        </div>
      ))}
    </div>
  )
}

function DashboardTab() {
  const metricsQ = useAdminMetrics()
  const usersChartQ = useAdminUsersChart()
  const eventsChartQ = useAdminEventsChart()
  const m = metricsQ.data
  const maxUsers = Math.max(1, ...(usersChartQ.data?.map((x) => x.count) ?? [1]))
  const maxEvents = Math.max(1, ...(eventsChartQ.data?.map((x) => x.count) ?? [1]))

  return (
    <div className="adminTabPanel">
      <h2 className="accountSectionTitle">Статистика</h2>
      {metricsQ.isError ? <p className="authError">Не удалось загрузить метрики</p> : null}
      <div className="adminMetricsGrid">
        <div className="adminMetricTile">
          <div className="adminMetricValue">{m?.total_users ?? '—'}</div>
          <div className="adminMetricLabel">Пользователей</div>
        </div>
        <div className="adminMetricTile">
          <div className="adminMetricValue">{m?.total_events ?? '—'}</div>
          <div className="adminMetricLabel">Событий</div>
        </div>
        <div className="adminMetricTile">
          <div className="adminMetricValue">{m?.active_events_today_or_future ?? '—'}</div>
          <div className="adminMetricLabel">Активных сегодня</div>
        </div>
        <div className="adminMetricTile adminMetricTileWarn">
          <div className="adminMetricValue">{m?.new_complaints ?? '—'}</div>
          <div className="adminMetricLabel">Новых жалоб</div>
        </div>
      </div>
      <div className="adminChartsRow">
        <div className="adminCard">
          <h3 className="adminCardTitle">Регистрации (7 дней)</h3>
          {usersChartQ.data ? <BarChart data={usersChartQ.data} max={maxUsers} /> : <p className="pageSub">…</p>}
        </div>
        <div className="adminCard">
          <h3 className="adminCardTitle">События (7 дней)</h3>
          {eventsChartQ.data ? <BarChart data={eventsChartQ.data} max={maxEvents} /> : <p className="pageSub">…</p>}
        </div>
      </div>
    </div>
  )
}

function UsersTab({ users, mut }: { users: AdminUser[]; mut: ReturnType<typeof useAdminMutations> }) {
  const [roleFilter, setRoleFilter] = useState<'all' | 'user' | 'admin'>('all')
  const filtered = useMemo(() => {
    if (roleFilter === 'all') return users
    return users.filter((u) => u.role === roleFilter)
  }, [users, roleFilter])

  return (
    <div className="adminTabPanel">
      <div className="adminFilters">
        {(['all', 'user', 'admin'] as const).map((r) => (
          <button key={r} type="button" className={roleFilter === r ? 'pill active' : 'pill'} onClick={() => setRoleFilter(r)}>
            {r === 'all' ? 'Все' : r === 'admin' ? 'Админы' : 'Пользователи'}
          </button>
        ))}
      </div>
      <div className="adminList">
        {filtered.map((u) => (
          <article key={u.user_id} className="adminCard">
            <div className="adminCardHead">
              <strong>{u.email}</strong>
              <span className="roleBadge">{u.role}</span>
              {u.is_banned ? <span className="statusBadge status-rejected">заблокирован</span> : null}
            </div>
            <p className="pageSub">ID {u.user_id} · {formatDt(u.created_at)}</p>
            <div className="adminCardBtns">
              {u.is_banned ? (
                <button type="button" className="homeGhostBtn" onClick={() => mut.unban.mutate(u.user_id)}>
                  Разблокировать
                </button>
              ) : (
                <button type="button" className="homeGhostBtn" onClick={() => mut.ban.mutate(u.user_id)}>
                  Заблокировать
                </button>
              )}
              {u.role === 'user' ? (
                <button type="button" className="homePrimaryBtn" onClick={() => mut.setRole.mutate({ userId: u.user_id, role: 'admin' })}>
                  Сделать админом
                </button>
              ) : (
                <button type="button" className="homeGhostBtn" onClick={() => mut.setRole.mutate({ userId: u.user_id, role: 'user' })}>
                  Снять админа
                </button>
              )}
              <button
                type="button"
                className="homeGhostBtn"
                onClick={() => {
                  if (confirm('Удалить пользователя?')) mut.removeUser.mutate(u.user_id)
                }}
              >
                Удалить
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function PendingTab({ events, mut }: { events: AdminEvent[]; mut: ReturnType<typeof useAdminMutations> }) {
  const [rejectId, setRejectId] = useState<number | null>(null)
  const [reason, setReason] = useState('')

  return (
    <div className="adminTabPanel">
      <div className="adminList">
        {events.map((ev) => (
          <article key={ev.event_id} className="adminCard">
            <div className="adminCardHead">
              <strong>{ev.title}</strong>
              <span className={`statusBadge status-${ev.status}`}>{ev.status}</span>
            </div>
            <p className="adminCardDesc">{ev.description.slice(0, 200)}{ev.description.length > 200 ? '…' : ''}</p>
            <p className="pageSub">
              {formatDt(ev.event_datetime)} · {ev.location}
            </p>
            <div className="adminCardBtns">
              <button type="button" className="homePrimaryBtn" onClick={() => mut.moderate.mutate({ eventId: ev.event_id, decision: 'approve' })}>
                Одобрить
              </button>
              <button type="button" className="homeGhostBtn" onClick={() => setRejectId(ev.event_id)}>
                Отклонить
              </button>
              <Link to={`/events/${ev.event_id}`} className="homeGhostBtn" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                Открыть
              </Link>
            </div>
            {rejectId === ev.event_id ? (
              <div className="adminCardActions">
                <input className="input authInput" placeholder="Причина отклонения" value={reason} onChange={(e) => setReason(e.target.value)} />
                <button
                  type="button"
                  className="homePrimaryBtn"
                  onClick={() => {
                    mut.moderate.mutate({ eventId: ev.event_id, decision: 'reject', reason })
                    setRejectId(null)
                    setReason('')
                  }}
                >
                  Подтвердить отклонение
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
      {events.length === 0 ? <p className="emptyCard">Нет событий на модерации</p> : null}
    </div>
  )
}

function ComplaintsTab({ items, mut }: { items: AdminComplaint[]; mut: ReturnType<typeof useAdminMutations> }) {
  const [selected, setSelected] = useState<AdminComplaint | null>(null)
  const [hideEvent, setHideEvent] = useState(false)
  const [blockUser, setBlockUser] = useState(false)

  return (
    <div className="adminTabPanel">
      <div className="adminList">
        {items.map((c) => (
          <article key={c.complaint_id} className="adminCard">
            <div className="adminCardHead">
              <strong>Жалоба #{c.complaint_id}</strong>
              <span className={`statusBadge status-${c.status === 'pending' ? 'pending' : c.status === 'resolved' ? 'approved' : 'rejected'}`}>
                {c.status}
              </span>
            </div>
            <p className="adminCardDesc">{c.reason}</p>
            <p className="pageSub">
              Событие #{c.event_id} · {formatDt(c.created_at)}
            </p>
            {c.status === 'pending' ? (
              <button type="button" className="homePrimaryBtn" onClick={() => setSelected(c)}>
                Разобрать
              </button>
            ) : null}
          </article>
        ))}
      </div>
      {items.length === 0 ? <p className="emptyCard">Жалоб нет</p> : null}

      {selected ? (
        <div className="eventDetailModalBackdrop" role="presentation" onMouseDown={() => setSelected(null)}>
          <div className="eventDetailModal adminModal" role="dialog" aria-modal onMouseDown={(e) => e.stopPropagation()}>
            <h2 className="eventDetailModalTitle">Жалоба #{selected.complaint_id}</h2>
            <p>{selected.reason}</p>
            <label className="accountCheck">
              <input type="checkbox" checked={hideEvent} onChange={(e) => setHideEvent(e.target.checked)} />
              Скрыть событие
            </label>
            <label className="accountCheck">
              <input type="checkbox" checked={blockUser} onChange={(e) => setBlockUser(e.target.checked)} />
              Заблокировать автора события
            </label>
            <div className="adminCardBtns">
              <button
                type="button"
                className="homePrimaryBtn"
                onClick={() => {
                  mut.resolveComplaint.mutate({
                    complaintId: selected.complaint_id,
                    decision: 'resolved',
                    hide_event: hideEvent,
                    block_organizer: blockUser,
                  })
                  setSelected(null)
                }}
              >
                Принять
              </button>
              <button
                type="button"
                className="homeGhostBtn"
                onClick={() => {
                  mut.resolveComplaint.mutate({ complaintId: selected.complaint_id, decision: 'rejected' })
                  setSelected(null)
                }}
              >
                Отклонить жалобу
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function AdminContent() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const usersQ = useAdminUsers()
  const pendingQ = useAdminPendingEvents()
  const complaintsQ = useAdminComplaints()
  const mut = useAdminMutations()

  const tabs: { id: Tab; label: string }[] = [
    { id: 'dashboard', label: 'Дашборд' },
    { id: 'users', label: 'Пользователи' },
    { id: 'pending', label: 'Модерация' },
    { id: 'complaints', label: 'Жалобы' },
  ]

  return (
    <div className="page myEventsPage adminPage">
      <header className="myEventsHeader">
        <div>
          <h1 className="myEventsTitle">Админ-панель</h1>
          <p className="eventDetailMuted">Управление пользователями, событиями и жалобами</p>
        </div>
        <Link to="/" className="homeGhostBtn">
          На сайт
        </Link>
      </header>

      <nav className="adminTabs" aria-label="Разделы админки">
        {tabs.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? 'pill active' : 'pill'} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'dashboard' ? <DashboardTab /> : null}
      {tab === 'users' && usersQ.data ? <UsersTab users={usersQ.data} mut={mut} /> : null}
      {tab === 'pending' && pendingQ.data ? <PendingTab events={pendingQ.data} mut={mut} /> : null}
      {tab === 'complaints' && complaintsQ.data ? <ComplaintsTab items={complaintsQ.data} mut={mut} /> : null}
      {tab === 'users' && usersQ.isPending ? <p className="pageSub">Загрузка…</p> : null}
      {tab === 'pending' && pendingQ.isPending ? <p className="pageSub">Загрузка…</p> : null}
      {tab === 'complaints' && complaintsQ.isPending ? <p className="pageSub">Загрузка…</p> : null}
    </div>
  )
}

export function AdminPage() {
  const role = useAuthStore((s) => s.user?.role)
  return (
    <RequireAuth roles={['admin']}>
      {canModerate(role) ? <AdminContent /> : <Navigate to="/account" replace />}
    </RequireAuth>
  )
}
