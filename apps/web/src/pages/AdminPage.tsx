import { useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from '../components/RequireAuth'
import {
  useAdminComplaints,
  useAdminComplaintsChart,
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
import { isAdminHostAllowed } from '../lib/adminAccess'
import { ComplaintReviewDialog } from '../features/admin/ComplaintReviewDialog'
import { complaintStatusLabel, parseComplaintReason } from '../features/admin/formatComplaint'
import { formatApiError } from '../lib/apiError'
import { useAuthStore } from '../stores/authStore'

function formatDt(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const CHART_PAD_TOP = 8
const MAX_Y_TICKS = 16

type ChartScale = { yMin: number; yMax: number; ticks: number[] }

function computeChartScale(values: number[]): ChartScale {
  if (values.length === 0) return { yMin: 0, yMax: 1, ticks: [1, 0] }

  const rawMax = Math.max(...values)
  if (rawMax === 0) return { yMin: 0, yMax: 1, ticks: [1, 0] }

  const yMin = 0
  const yMax = rawMax

  if (yMax - yMin + 1 <= MAX_Y_TICKS) {
    const ticks: number[] = []
    for (let v = yMax; v >= yMin; v -= 1) ticks.push(v)
    return { yMin, yMax, ticks }
  }

  const dataTicks = [...new Set(values)].sort((a, b) => b - a)
  if (!dataTicks.includes(0)) dataTicks.push(0)
  return { yMin, yMax, ticks: [...new Set(dataTicks)].sort((a, b) => b - a) }
}

function valueToTopPercent(value: number, scale: ChartScale): number {
  const plotSpan = 100 - CHART_PAD_TOP
  const range = scale.yMax - scale.yMin || 1
  const ratio = (value - scale.yMin) / range
  return CHART_PAD_TOP + (1 - ratio) * plotSpan
}

type ChartPoint = { label: string; count: number; x: number; y: number }

function buildLinePoints(data: { label: string; count: number }[], scale: ChartScale): ChartPoint[] {
  const n = data.length

  return data.map((p, i) => {
    const x = n <= 1 ? 50 : ((i + 0.5) / n) * 100
    const y = valueToTopPercent(p.count, scale)
    return { ...p, x, y }
  })
}

function LineChart({ data }: { data: { label: string; count: number }[] }) {
  const scale = useMemo(() => computeChartScale(data.map((p) => p.count)), [data])
  const points = useMemo(() => buildLinePoints(data, scale), [data, scale])
  const linePoints = points.map((p) => `${p.x},${p.y}`).join(' ')
  const yAxisWidth = `${Math.max(...scale.ticks.map((t) => String(t).length), 1) + 0.5}ch`

  return (
    <div className="adminChartWrap">
      <div className="adminChartYAxis" style={{ width: yAxisWidth }} aria-hidden>
        {scale.ticks.map((tick) => (
          <span
            key={tick}
            className="adminChartYTick"
            style={{ top: `${valueToTopPercent(tick, scale)}%` }}
          >
            {tick}
          </span>
        ))}
      </div>

      <div className="adminChartMain">
        <div className="adminChartPlot">
          <div className="adminChartGrid" aria-hidden>
            {scale.ticks.map((tick) => (
              <div
                key={tick}
                className="adminChartGridLine"
                style={{ top: `${valueToTopPercent(tick, scale)}%` }}
              />
            ))}
            {points.map((p) => (
              <div key={`v-${p.label}`} className="adminChartGridLineV" style={{ left: `${p.x}%` }} />
            ))}
          </div>

          <svg className="adminLineChartSvg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <polyline className="adminLineChartPath" points={linePoints} />
          </svg>

          <div className="adminLineChartMarkers" aria-hidden>
            {points.map((p) => (
              <div
                key={p.label}
                className="adminLineChartMarker"
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
              >
                <span className="adminLineChartDot" />
                <span className="adminChartValue">{p.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div
          className="adminChartXAxis"
          style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
          aria-hidden
        >
          {points.map((p) => (
            <div key={p.label} className="adminChartXSlot">
              <span className="adminChartXTick" />
              <span className="adminChartLabel">{p.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function formatRating(value: number | null | undefined) {
  return value != null ? value.toFixed(1) : '—'
}

function MetricTile({
  value,
  label,
  warn = false,
}: {
  value: ReactNode
  label: string
  warn?: boolean
}) {
  return (
    <div className={`adminMetricTile${warn ? ' adminMetricTileWarn' : ''}`}>
      <div className="adminMetricValue">{value}</div>
      <div className="adminMetricLabel">{label}</div>
    </div>
  )
}

function StatSection({
  title,
  urgent = false,
  metrics,
  chart,
}: {
  title: string
  urgent?: boolean
  metrics: ReactNode
  chart?: ReactNode
}) {
  return (
    <section className={`adminStatSection${urgent ? ' adminStatSectionUrgent' : ''}`}>
      <h3 className="adminStatSectionTitle">{title}</h3>
      <div className="adminMetricsGrid">{metrics}</div>
      {chart ? <div className="adminStatChart">{chart}</div> : null}
    </section>
  )
}

function DashboardTab() {
  const metricsQ = useAdminMetrics()
  const usersChartQ = useAdminUsersChart()
  const eventsChartQ = useAdminEventsChart()
  const complaintsChartQ = useAdminComplaintsChart()
  const m = metricsQ.data

  return (
    <div className="adminTabPanel">
      <h2 className="accountSectionTitle">Статистика</h2>
      {metricsQ.isError ? <p className="authError">Не удалось загрузить метрики</p> : null}

      <div className="adminDashboardSections">
        <StatSection
          title="Срочные метрики"
          urgent
          metrics={
            <>
              <MetricTile
                value={m?.pending_events ?? '—'}
                label="На модерации"
                warn={(m?.pending_events ?? 0) > 0}
              />
              <MetricTile
                value={m?.new_complaints ?? '—'}
                label="Новых жалоб"
                warn={(m?.new_complaints ?? 0) > 0}
              />
              <MetricTile
                value={m?.banned_users ?? '—'}
                label="Заблокировано"
                warn={(m?.banned_users ?? 0) > 0}
              />
            </>
          }
          chart={
            complaintsChartQ.data ? (
              <>
                <h4 className="adminStatChartTitle">Жалобы (7 дней)</h4>
                <LineChart data={complaintsChartQ.data} />
              </>
            ) : (
              <p className="pageSub">…</p>
            )
          }
        />

        <StatSection
          title="Мероприятия"
          metrics={
            <>
              <MetricTile value={m?.total_events ?? '—'} label="Всего событий" />
              <MetricTile value={m?.active_events_today ?? '—'} label="Сегодня" />
              <MetricTile value={m?.upcoming_events ?? '—'} label="Предстоящих" />
              <MetricTile value={m?.total_participations ?? '—'} label="Участий" />
            </>
          }
          chart={
            eventsChartQ.data ? (
              <>
                <h4 className="adminStatChartTitle">Новые события (7 дней)</h4>
                <LineChart data={eventsChartQ.data} />
              </>
            ) : (
              <p className="pageSub">…</p>
            )
          }
        />

        <StatSection
          title="Пользователи"
          metrics={<MetricTile value={m?.total_users ?? '—'} label="Всего пользователей" />}
          chart={
            usersChartQ.data ? (
              <>
                <h4 className="adminStatChartTitle">Регистрации (7 дней)</h4>
                <LineChart data={usersChartQ.data} />
              </>
            ) : (
              <p className="pageSub">…</p>
            )
          }
        />

        <StatSection
          title="Отзывы"
          metrics={
            <>
              <MetricTile value={m?.total_reviews ?? '—'} label="Всего отзывов" />
              <MetricTile value={formatRating(m?.avg_event_rating)} label="Средний рейтинг" />
            </>
          }
        />
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
  const [rejectEvent, setRejectEvent] = useState<AdminEvent | null>(null)
  const [reason, setReason] = useState('')
  const [blockUser, setBlockUser] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const closeRejectDialog = () => {
    setRejectEvent(null)
    setReason('')
    setBlockUser(false)
  }

  const openRejectDialog = (ev: AdminEvent) => {
    setRejectEvent(ev)
    setReason('')
    setBlockUser(false)
    setActionError(null)
  }

  const onModerateError = (err: unknown) => {
    setActionError(formatApiError(err, 'Не удалось обновить статус события'))
  }

  return (
    <div className="adminTabPanel">
      {actionError ? <p className="authBanner">{actionError}</p> : null}
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
              <button
                type="button"
                className="homePrimaryBtn"
                onClick={() =>
                  mut.moderate.mutate(
                    { eventId: ev.event_id, decision: 'approve' },
                    { onSuccess: () => setActionError(null), onError: onModerateError }
                  )
                }
              >
                Одобрить
              </button>
              <button type="button" className="homeGhostBtn" onClick={() => openRejectDialog(ev)}>
                Отклонить
              </button>
              <Link
                to={`/events/${ev.event_id}`}
                state={{ from: '/admin/pending', label: '← Модерация', adminPreview: true }}
                className="homeGhostBtn"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
              >
                Подробнее
              </Link>
            </div>
          </article>
        ))}
      </div>
      {events.length === 0 ? <p className="emptyCard">Нет событий на модерации</p> : null}

      {rejectEvent ? (
        <div className="eventDetailModalBackdrop" role="presentation" onMouseDown={closeRejectDialog}>
          <div
            className="eventDetailModal adminModal adminRejectModal"
            role="dialog"
            aria-modal
            aria-labelledby="reject-event-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id="reject-event-title" className="adminRejectModalTitle">
              Отклонить «{rejectEvent.title}»
            </h2>
            <div className="adminRejectModalField">
              <label className="label" htmlFor="reject-reason">
                Причина отклонения
              </label>
              <textarea
                id="reject-reason"
                className="input adminRejectModalTextarea"
                placeholder="Опишите, что нужно исправить"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <label className="adminRejectModalCheck">
              <input type="checkbox" checked={blockUser} onChange={(e) => setBlockUser(e.target.checked)} />
              Заблокировать пользователя
            </label>
            <div className="adminRejectModalActions">
              <button
                type="button"
                className="homePrimaryBtn"
                disabled={!reason.trim() || mut.moderate.isPending}
                onClick={() => {
                  mut.moderate.mutate(
                    {
                      eventId: rejectEvent.event_id,
                      decision: 'reject',
                      reason: reason.trim(),
                      block_organizer: blockUser,
                    },
                    {
                      onSuccess: () => {
                        setActionError(null)
                        closeRejectDialog()
                      },
                      onError: onModerateError,
                    }
                  )
                }}
              >
                Подтвердить отклонение
              </button>
              <button type="button" className="homeGhostBtn" onClick={closeRejectDialog}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ComplaintsTab({ items, mut }: { items: AdminComplaint[]; mut: ReturnType<typeof useAdminMutations> }) {
  const [selected, setSelected] = useState<AdminComplaint | null>(null)

  return (
    <div className="adminTabPanel">
      <div className="adminList">
        {items.map((c) => {
          const parsed = parseComplaintReason(c.reason)
          return (
            <article key={c.complaint_id} className="adminCard">
            <div className="adminCardHead">
              <strong>{parsed.title}</strong>
              <span className={`statusBadge status-${c.status === 'pending' ? 'pending' : c.status === 'resolved' ? 'approved' : 'rejected'}`}>
                {complaintStatusLabel(c.status)}
              </span>
            </div>
            <p className="pageSub">
              {c.user_name} · {c.event_title}
            </p>
            {parsed.comment ? <p className="adminCardDesc">{parsed.comment}</p> : null}
            <p className="pageSub">
              Жалоба #{c.complaint_id} · {formatDt(c.created_at)}
            </p>
            {c.status === 'pending' ? (
              <button type="button" className="homePrimaryBtn" onClick={() => setSelected(c)}>
                Разобрать
              </button>
            ) : null}
            </article>
          )
        })}
      </div>
      {items.length === 0 ? <p className="emptyCard">Жалоб нет</p> : null}

      {selected ? (
        <ComplaintReviewDialog complaint={selected} mut={mut} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  )
}

function AdminUsersRoute() {
  const usersQ = useAdminUsers()
  const mut = useAdminMutations()
  if (usersQ.isPending) return <p className="pageSub">Загрузка…</p>
  if (!usersQ.data) return null
  return <UsersTab users={usersQ.data} mut={mut} />
}

function AdminPendingRoute() {
  const pendingQ = useAdminPendingEvents()
  const mut = useAdminMutations()
  if (pendingQ.isPending) return <p className="pageSub">Загрузка…</p>
  if (!pendingQ.data) return null
  return <PendingTab events={pendingQ.data} mut={mut} />
}

function AdminComplaintsRoute() {
  const complaintsQ = useAdminComplaints()
  const mut = useAdminMutations()
  if (complaintsQ.isPending) return <p className="pageSub">Загрузка…</p>
  if (!complaintsQ.data) return null
  return <ComplaintsTab items={complaintsQ.data} mut={mut} />
}

function AdminContent() {
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

      <Routes>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DashboardTab />} />
        <Route path="users" element={<AdminUsersRoute />} />
        <Route path="pending" element={<AdminPendingRoute />} />
        <Route path="complaints" element={<AdminComplaintsRoute />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>
    </div>
  )
}

export function AdminPage() {
  const role = useAuthStore((s) => s.user?.role)
  if (!isAdminHostAllowed()) {
    return <Navigate to="/" replace />
  }
  return (
    <RequireAuth roles={['admin']}>
      {canModerate(role) ? <AdminContent /> : <Navigate to="/account" replace />}
    </RequireAuth>
  )
}
