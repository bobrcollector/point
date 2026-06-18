import { cloneElement, isValidElement, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from '../components/RequireAuth'
import {
  useAdminComplaints,
  useAdminComplaintsChart,
  useAdminConversionChart,
  useAdminEventsChart,
  useAdminLowRatedEventsChart,
  useAdminMetrics,
  useAdminMutations,
  useAdminParticipationsChart,
  useAdminParticipationsPerEventChart,
  useAdminPendingEvents,
  useAdminRatingChart,
  useAdminRepeatParticipantsChart,
  useAdminReviewLeaveChart,
  useAdminUsers,
  useAdminUsersChart,
  useAdminUsersTotalChart,
  type AdminComplaint,
  type AdminEvent,
  type AdminUser,
} from '../features/admin/queries'
import { canModerate } from '../features/auth/types'
import { isAdminHostAllowed, useAdminAccessAllowed, useAdminDashboardAccessAllowed } from '../lib/adminAccess'
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

const CHART_PAD_TOP = 12
const TARGET_Y_TICKS = 5
const LABEL_FLIP_TOP_THRESHOLD = 16
const LABEL_FLIP_BOTTOM_THRESHOLD = 88

function shouldShowChartAxisLabel(index: number, total: number): boolean {
  if (total <= 7) return true
  if (index === 0 || index === total - 1) return true
  return index % 5 === 0
}

type ChartScale = { yMin: number; yMax: number; ticks: number[]; decimal: boolean }

function niceStep(range: number, targetTicks = TARGET_Y_TICKS): number {
  if (range <= 0) return 1
  const rough = range / targetTicks
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const normalized = rough / magnitude
  let nice = 1
  if (normalized > 5) nice = 10
  else if (normalized > 2) nice = 5
  else if (normalized > 1) nice = 2
  return nice * magnitude
}

function buildTicks(yMin: number, yMax: number, step: number, decimal: boolean): number[] {
  const ticks: number[] = []
  for (let v = yMax; v >= yMin - step / 2; v -= step) {
    const rounded = decimal ? Math.round(v * 10) / 10 : Math.round(v)
    if (ticks.length === 0 || ticks[ticks.length - 1] !== rounded) ticks.push(rounded)
  }
  if (!decimal && !ticks.includes(0) && yMin <= 0) ticks.push(0)
  return [...new Set(ticks)].sort((a, b) => b - a)
}

function computeChartScale(values: number[]): ChartScale {
  if (values.length === 0) return { yMin: 0, yMax: 1, ticks: [1, 0], decimal: false }

  const dataMax = Math.max(...values)
  if (dataMax === 0) return { yMin: 0, yMax: 1, ticks: [1, 0], decimal: false }

  const yMin = 0
  const paddedMax = dataMax * 1.12 + (dataMax < 5 ? 0.5 : 0)
  const step = niceStep(paddedMax - yMin)
  const yMax = Math.max(step, Math.ceil(paddedMax / step) * step)

  return { yMin, yMax, ticks: buildTicks(yMin, yMax, step, false), decimal: false }
}

function computeRatingChartScale(values: number[]): ChartScale {
  if (values.length === 0) return { yMin: 1, yMax: 5, ticks: [5, 4, 3, 2, 1], decimal: true }

  const dataMin = Math.min(...values)
  const dataMax = Math.max(...values)
  const span = Math.max(0.5, dataMax - dataMin)
  const paddedMin = Math.max(1, dataMin - span * 0.15)
  const paddedMax = Math.min(5, dataMax + span * 0.15)
  const range = Math.max(0.5, paddedMax - paddedMin)
  const step = range <= 1 ? 0.2 : range <= 2 ? 0.5 : 1
  const yMin = Math.max(1, Math.floor(paddedMin / step) * step)
  const yMax = Math.min(5, Math.ceil(paddedMax / step) * step)

  return { yMin, yMax, ticks: buildTicks(yMin, yMax || step, step, true), decimal: true }
}

function computeDecimalChartScale(values: number[]): ChartScale {
  if (values.length === 0) {
    return { yMin: 0, yMax: 0.5, ticks: [0.5, 0], decimal: true }
  }

  const dataMax = Math.max(...values)
  if (dataMax === 0) {
    return { yMin: 0, yMax: 0.5, ticks: [0.5, 0], decimal: true }
  }

  const yMin = 0
  const pad =
    dataMax <= 0.1 ? Math.max(0.05, dataMax * 0.5) : dataMax < 1 ? Math.max(0.1, dataMax * 0.2) : dataMax * 0.12
  const paddedMax = dataMax + pad
  const step =
    dataMax <= 0.1 ? 0.05 : dataMax <= 0.5 ? 0.1 : dataMax <= 2 ? 0.2 : niceStep(paddedMax - yMin)
  const yMax = Math.max(step, Math.ceil(paddedMax / step) * step)

  return { yMin, yMax, ticks: buildTicks(yMin, yMax, step, true), decimal: true }
}

function computePercentChartScale(values: number[]): ChartScale {
  if (values.length === 0) return { yMin: 0, yMax: 100, ticks: [100, 75, 50, 25, 0], decimal: true }

  const dataMax = Math.max(...values)
  const dataMin = Math.min(...values)
  if (dataMax === dataMin) {
    const pad = Math.max(5, dataMax * 0.2)
    const yMin = Math.max(0, dataMin - pad)
    const yMax = Math.min(100, dataMax + pad)
    const step = niceStep(yMax - yMin)
    return { yMin, yMax, ticks: buildTicks(yMin, yMax, step, true), decimal: true }
  }

  const yMin = Math.max(0, dataMin - (dataMax - dataMin) * 0.15)
  const paddedMax = Math.min(100, dataMax + (dataMax - dataMin) * 0.15 + 1)
  const step = niceStep(paddedMax - yMin)
  const yMax = Math.min(100, Math.ceil(paddedMax / step) * step)

  return { yMin, yMax, ticks: buildTicks(yMin, yMax, step, true), decimal: true }
}

function formatChartTick(value: number, decimal: boolean): string {
  if (!decimal) return String(Math.round(value))
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function formatChartValue(value: number, decimal: boolean): string {
  if (!decimal) return String(Math.round(value))
  return value.toFixed(1)
}

function valueToTopPercent(value: number, scale: ChartScale): number {
  const plotSpan = 100 - CHART_PAD_TOP
  const range = scale.yMax - scale.yMin || 1
  const ratio = (value - scale.yMin) / range
  return CHART_PAD_TOP + (1 - ratio) * plotSpan
}

function previousChartValue(values: (number | null)[], index: number): number | null {
  for (let j = index - 1; j >= 0; j -= 1) {
    const value = values[j]
    if (value != null) return value
  }
  return null
}

function shouldLabelPointBelow(values: (number | null)[], index: number, yPercent: number): boolean {
  const current = values[index]
  if (current == null) return false

  const previous = previousChartValue(values, index)
  if (previous != null) {
    if (current < previous) return true
    if (current > previous) return false
  }

  if (yPercent < LABEL_FLIP_TOP_THRESHOLD) return true
  if (yPercent > LABEL_FLIP_BOTTOM_THRESHOLD) return false
  return false
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

function LineChart({ data, title }: { data: { label: string; count: number }[]; title?: string }) {
  const scale = useMemo(() => computeChartScale(data.map((p) => p.count)), [data])
  const points = useMemo(() => buildLinePoints(data, scale), [data, scale])
  const values = useMemo(() => data.map((p) => p.count), [data])
  const linePoints = points.map((p) => `${p.x},${p.y}`).join(' ')
  const yAxisWidth = `${Math.max(...scale.ticks.map((t) => formatChartTick(t, scale.decimal).length), 1) + 0.5}ch`
  const compactValues = points.length > 14

  return (
    <div className="adminChartWrap">
      {title ? <h4 className="adminStatChartTitle">{title}</h4> : null}
      <div className="adminChartYAxis" style={{ width: yAxisWidth }} aria-hidden>
        {scale.ticks.map((tick) => (
          <span
            key={tick}
            className="adminChartYTick"
            style={{ top: `${valueToTopPercent(tick, scale)}%` }}
          >
            {formatChartTick(tick, scale.decimal)}
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
          </div>

          <svg className="adminLineChartSvg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <polyline className="adminLineChartPath" points={linePoints} />
          </svg>

          <div
            className={`adminLineChartMarkers${compactValues ? ' adminLineChartMarkersCompact' : ''}`}
            aria-hidden
          >
            {points.map((p, i) => {
              const below = shouldLabelPointBelow(values, i, p.y)
              return (
                <div
                  key={`${p.label}-${i}`}
                  className="adminLineChartMarker"
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                >
                  <span className="adminLineChartDot" />
                  <span className={`adminChartValue${below ? ' adminChartValueBelow' : ''}`}>
                    {formatChartValue(p.count, scale.decimal)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div
          className="adminChartXAxis"
          style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
          aria-hidden
        >
          {points.map((p, i) => (
            <div key={`${p.label}-${i}`} className="adminChartXSlot">
              <span className="adminChartXTick" />
              <span className="adminChartLabel">
                {shouldShowChartAxisLabel(i, points.length) ? p.label : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

type RatingChartPoint = { label: string; value: number | null; x: number; y: number | null }

function buildRatingPoints(
  data: { label: string; value: number | null }[],
  scale: ChartScale,
): RatingChartPoint[] {
  const n = data.length

  return data.map((p, i) => {
    const x = n <= 1 ? 50 : ((i + 0.5) / n) * 100
    if (p.value == null) return { ...p, x, y: null }
    const y = valueToTopPercent(p.value, scale)
    return { ...p, x, y }
  })
}

function RatingLineChart({ data, title }: { data: { label: string; value: number | null }[]; title?: string }) {
  return <ValueLineChart data={data} title={title} computeScale={computeRatingChartScale} />
}

function PercentLineChart({ data, title }: { data: { label: string; value: number | null }[]; title?: string }) {
  return (
    <ValueLineChart
      data={data}
      title={title}
      computeScale={computePercentChartScale}
      formatValue={(value) => `${formatChartValue(value, true)}%`}
    />
  )
}

function DecimalLineChart({ data, title }: { data: { label: string; value: number | null }[]; title?: string }) {
  return <ValueLineChart data={data} title={title} computeScale={computeDecimalChartScale} />
}

function ValueLineChart({
  data,
  title,
  computeScale,
  formatValue,
}: {
  data: { label: string; value: number | null }[]
  title?: string
  computeScale: (values: number[]) => ChartScale
  formatValue?: (value: number) => string
}) {
  const numericValues = useMemo(
    () => data.map((p) => p.value).filter((v): v is number => v != null),
    [data],
  )
  const scale = useMemo(() => computeScale(numericValues), [computeScale, numericValues])
  const points = useMemo(() => buildRatingPoints(data, scale), [data, scale])
  const values = useMemo(() => data.map((p) => p.value), [data])
  const lineSegments = useMemo(() => {
    const segments: string[] = []
    let current: RatingChartPoint[] = []
    for (const p of points) {
      if (p.y == null || p.value == null) {
        if (current.length) {
          segments.push(current.map((pt) => `${pt.x},${pt.y}`).join(' '))
          current = []
        }
        continue
      }
      current.push(p)
    }
    if (current.length) segments.push(current.map((pt) => `${pt.x},${pt.y}`).join(' '))
    return segments
  }, [points])
  const yAxisWidth = `${Math.max(...scale.ticks.map((t) => formatChartTick(t, scale.decimal).length), 1) + 0.5}ch`
  const compactValues = points.length > 14
  const renderValue = formatValue ?? ((value: number) => formatChartValue(value, scale.decimal))

  return (
    <div className="adminChartWrap">
      {title ? <h4 className="adminStatChartTitle">{title}</h4> : null}
      <div className="adminChartYAxis" style={{ width: yAxisWidth }} aria-hidden>
        {scale.ticks.map((tick) => (
          <span key={tick} className="adminChartYTick" style={{ top: `${valueToTopPercent(tick, scale)}%` }}>
            {formatChartTick(tick, scale.decimal)}
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
          </div>

          <svg className="adminLineChartSvg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            {lineSegments.map((segment, idx) => (
              <polyline key={idx} className="adminLineChartPath" points={segment} />
            ))}
          </svg>

          <div
            className={`adminLineChartMarkers${compactValues ? ' adminLineChartMarkersCompact' : ''}`}
            aria-hidden
          >
            {points.map((p, i) => {
              if (p.y == null || p.value == null) return null
              const below = shouldLabelPointBelow(values, i, p.y)
              return (
                <div
                  key={`${p.label}-${i}`}
                  className="adminLineChartMarker"
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                >
                  <span className="adminLineChartDot" />
                  <span className={`adminChartValue${below ? ' adminChartValueBelow' : ''}`}>
                    {renderValue(p.value)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div
          className="adminChartXAxis"
          style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
          aria-hidden
        >
          {points.map((p, i) => (
            <div key={`${p.label}-${i}`} className="adminChartXSlot">
              <span className="adminChartXTick" />
              <span className="adminChartLabel">
                {shouldShowChartAxisLabel(i, points.length) ? p.label : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ChartQueryBody<T>({
  query,
  title,
  children,
}: {
  query: { isLoading: boolean; isError: boolean; error: unknown; data?: T }
  title: string
  children: (data: T) => ReactNode
}) {
  if (query.isLoading) return <p className="pageSub">Загрузка графика…</p>
  if (query.isError) {
    return <p className="authError">{formatApiError(query.error, 'Не удалось загрузить график')}</p>
  }
  if (!query.data) return null
  const chart = children(query.data)
  if (!isValidElement(chart)) return chart
  return cloneElement(chart as ReactElement<{ title?: string }>, { title })
}

function formatRating(value: number | null | undefined) {
  return value != null ? value.toFixed(1) : '—'
}

function formatDecimal(value: number | null | undefined) {
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

function EventsDashboardSection({
  metrics,
  eventsChartQ,
  participationsChartQ,
  conversionChartQ,
  participationsPerEventChartQ,
}: {
  metrics: ReturnType<typeof useAdminMetrics>['data']
  eventsChartQ: ReturnType<typeof useAdminEventsChart>
  participationsChartQ: ReturnType<typeof useAdminParticipationsChart>
  conversionChartQ: ReturnType<typeof useAdminConversionChart>
  participationsPerEventChartQ: ReturnType<typeof useAdminParticipationsPerEventChart>
}) {
  const [chartMode, setChartMode] = useState<
    'events' | 'participations' | 'conversion' | 'perEvent'
  >('events')

  const eventsChartTitle =
    chartMode === 'events'
      ? 'Новые события (за месяц)'
      : chartMode === 'participations'
        ? 'Регистрации на мероприятия (за месяц)'
        : chartMode === 'conversion'
          ? 'Конверсия просмотр → участие (за месяц)'
          : 'Участий на активное событие (за месяц)'

  return (
    <StatSection
      title="Мероприятия"
      metrics={
        <>
          <MetricTile value={metrics?.upcoming_events ?? '—'} label="Активные события" />
          <MetricTile
            value={formatPercent(metrics?.view_to_participation_percent)}
            label="Конверсия просмотр → участие"
          />
          <MetricTile
            value={formatDecimal(metrics?.participations_per_active_event)}
            label="Участий на активное событие"
          />
          <MetricTile value={metrics?.events_created_today ?? '—'} label="Созданные сегодня" />
          <MetricTile
            value={metrics?.participations_today ?? '—'}
            label="Регистрации на мероприятия сегодня"
          />
        </>
      }
      chart={
        <>
          <div className="adminStatChartHead">
            <div className="adminFilters">
              <button
                type="button"
                className={chartMode === 'events' ? 'pill active' : 'pill'}
                onClick={() => setChartMode('events')}
              >
                Новые события
              </button>
              <button
                type="button"
                className={chartMode === 'participations' ? 'pill active' : 'pill'}
                onClick={() => setChartMode('participations')}
              >
                Регистрации
              </button>
              <button
                type="button"
                className={chartMode === 'conversion' ? 'pill active' : 'pill'}
                onClick={() => setChartMode('conversion')}
              >
                Конверсия
              </button>
              <button
                type="button"
                className={chartMode === 'perEvent' ? 'pill active' : 'pill'}
                onClick={() => setChartMode('perEvent')}
              >
                Участий / событие
              </button>
            </div>
          </div>
          {chartMode === 'events' ? (
            <ChartQueryBody query={eventsChartQ} title={eventsChartTitle}>
              {(data) => <LineChart data={data} />}
            </ChartQueryBody>
          ) : chartMode === 'participations' ? (
            <ChartQueryBody query={participationsChartQ} title={eventsChartTitle}>
              {(data) => <LineChart data={data} />}
            </ChartQueryBody>
          ) : chartMode === 'conversion' ? (
            <ChartQueryBody query={conversionChartQ} title={eventsChartTitle}>
              {(data) => <PercentLineChart data={data} />}
            </ChartQueryBody>
          ) : (
            <ChartQueryBody query={participationsPerEventChartQ} title={eventsChartTitle}>
              {(data) => <DecimalLineChart data={data} />}
            </ChartQueryBody>
          )}
        </>
      }
    />
  )
}

function UsersDashboardSection({
  metrics,
  usersChartQ,
  usersTotalChartQ,
  repeatParticipantsChartQ,
}: {
  metrics: ReturnType<typeof useAdminMetrics>['data']
  usersChartQ: ReturnType<typeof useAdminUsersChart>
  usersTotalChartQ: ReturnType<typeof useAdminUsersTotalChart>
  repeatParticipantsChartQ: ReturnType<typeof useAdminRepeatParticipantsChart>
}) {
  const [chartMode, setChartMode] = useState<'registrations' | 'total' | 'repeat'>('registrations')

  const usersChartTitle =
    chartMode === 'registrations'
      ? 'Регистрации (за месяц)'
      : chartMode === 'total'
        ? 'Всего пользователей (за месяц)'
        : 'Повторные участники (за месяц)'

  return (
    <StatSection
      title="Пользователи"
      metrics={
        <>
          <MetricTile value={metrics?.total_users ?? '—'} label="Всего пользователей" />
          <MetricTile value={metrics?.users_registered_today ?? '—'} label="Зарегистрировались сегодня" />
          <MetricTile
            value={formatPercent(metrics?.repeat_participants_percent)}
            label="Повторные участники"
          />
        </>
      }
      chart={
        <>
          <div className="adminStatChartHead">
            <div className="adminFilters">
              <button
                type="button"
                className={chartMode === 'registrations' ? 'pill active' : 'pill'}
                onClick={() => setChartMode('registrations')}
              >
                Регистрации
              </button>
              <button
                type="button"
                className={chartMode === 'total' ? 'pill active' : 'pill'}
                onClick={() => setChartMode('total')}
              >
                Всего пользователей
              </button>
              <button
                type="button"
                className={chartMode === 'repeat' ? 'pill active' : 'pill'}
                onClick={() => setChartMode('repeat')}
              >
                Повторные участники
              </button>
            </div>
          </div>
          {chartMode === 'registrations' ? (
            <ChartQueryBody query={usersChartQ} title={usersChartTitle}>
              {(data) => <LineChart data={data} />}
            </ChartQueryBody>
          ) : chartMode === 'total' ? (
            <ChartQueryBody query={usersTotalChartQ} title={usersChartTitle}>
              {(data) => <LineChart data={data} />}
            </ChartQueryBody>
          ) : (
            <ChartQueryBody query={repeatParticipantsChartQ} title={usersChartTitle}>
              {(data) => <PercentLineChart data={data} />}
            </ChartQueryBody>
          )}
        </>
      }
    />
  )
}

function ComplaintsDashboardSection({
  metrics,
  complaintsChartQ,
}: {
  metrics: ReturnType<typeof useAdminMetrics>['data']
  complaintsChartQ: ReturnType<typeof useAdminComplaintsChart>
}) {
  return (
    <StatSection
      title="Жалобы"
      metrics={
        <>
          <MetricTile
            value={metrics?.new_complaints ?? '—'}
            label="Новые жалобы"
            warn={(metrics?.new_complaints ?? 0) > 0}
          />
          <MetricTile value={metrics?.complaints_today ?? '—'} label="Поступило сегодня" />
        </>
      }
      chart={
        <ChartQueryBody query={complaintsChartQ} title="Жалобы (за месяц)">
          {(data) => <LineChart data={data} />}
        </ChartQueryBody>
      }
    />
  )
}

function formatPercent(value: number | null | undefined) {
  return value != null ? `${value.toFixed(1)}%` : '—'
}

function ReviewsDashboardSection({
  metrics,
  ratingChartQ,
  lowRatedChartQ,
  reviewLeaveChartQ,
}: {
  metrics: ReturnType<typeof useAdminMetrics>['data']
  ratingChartQ: ReturnType<typeof useAdminRatingChart>
  lowRatedChartQ: ReturnType<typeof useAdminLowRatedEventsChart>
  reviewLeaveChartQ: ReturnType<typeof useAdminReviewLeaveChart>
}) {
  const [chartMode, setChartMode] = useState<'rating' | 'lowRated' | 'reviewLeave'>('rating')

  const reviewsChartTitle =
    chartMode === 'rating'
      ? 'Средний рейтинг (за месяц)'
      : chartMode === 'lowRated'
        ? 'События с рейтингом < 3 (за месяц)'
        : 'Процент оставления отзыва (за месяц)'

  return (
    <StatSection
      title="Отзывы"
      metrics={
        <>
          <MetricTile value={formatRating(metrics?.avg_review_rating)} label="Средний рейтинг" />
          <MetricTile value={formatPercent(metrics?.review_leave_percent)} label="Процент оставления отзыва" />
          <MetricTile
            value={formatPercent(metrics?.low_rated_events_percent)}
            label="События с рейтингом < 3"
          />
        </>
      }
      chart={
        <>
          <div className="adminStatChartHead">
            <div className="adminFilters">
              <button
                type="button"
                className={chartMode === 'rating' ? 'pill active' : 'pill'}
                onClick={() => setChartMode('rating')}
              >
                Средний рейтинг
              </button>
              <button
                type="button"
                className={chartMode === 'lowRated' ? 'pill active' : 'pill'}
                onClick={() => setChartMode('lowRated')}
              >
                Рейтинг &lt; 3
              </button>
              <button
                type="button"
                className={chartMode === 'reviewLeave' ? 'pill active' : 'pill'}
                onClick={() => setChartMode('reviewLeave')}
              >
                Оставление отзыва
              </button>
            </div>
          </div>
          {chartMode === 'rating' ? (
            <ChartQueryBody query={ratingChartQ} title={reviewsChartTitle}>
              {(data) => <RatingLineChart data={data} />}
            </ChartQueryBody>
          ) : chartMode === 'lowRated' ? (
            <ChartQueryBody query={lowRatedChartQ} title={reviewsChartTitle}>
              {(data) => <PercentLineChart data={data} />}
            </ChartQueryBody>
          ) : (
            <ChartQueryBody query={reviewLeaveChartQ} title={reviewsChartTitle}>
              {(data) => <PercentLineChart data={data} />}
            </ChartQueryBody>
          )}
        </>
      }
    />
  )
}

function DashboardTab() {
  const metricsQ = useAdminMetrics()
  const usersChartQ = useAdminUsersChart()
  const usersTotalChartQ = useAdminUsersTotalChart()
  const repeatParticipantsChartQ = useAdminRepeatParticipantsChart()
  const eventsChartQ = useAdminEventsChart()
  const participationsChartQ = useAdminParticipationsChart()
  const conversionChartQ = useAdminConversionChart()
  const participationsPerEventChartQ = useAdminParticipationsPerEventChart()
  const complaintsChartQ = useAdminComplaintsChart()
  const ratingChartQ = useAdminRatingChart()
  const lowRatedChartQ = useAdminLowRatedEventsChart()
  const reviewLeaveChartQ = useAdminReviewLeaveChart()
  const m = metricsQ.data

  return (
    <div className="adminTabPanel">
      <h2 className="accountSectionTitle">Статистика</h2>
      {metricsQ.isError ? (
        <p className="authError">{formatApiError(metricsQ.error, 'Не удалось загрузить метрики')}</p>
      ) : null}

      <div className="adminDashboardSections">
        <StatSection
          title="Срочные метрики"
          urgent
          metrics={
            <>
              <MetricTile
                value={m?.pending_events ?? '—'}
                label="Мероприятия на модерации"
                warn={(m?.pending_events ?? 0) > 0}
              />
              <MetricTile
                value={m?.new_complaints ?? '—'}
                label="Новые жалобы"
                warn={(m?.new_complaints ?? 0) > 0}
              />
            </>
          }
        />

        <EventsDashboardSection
          metrics={m}
          eventsChartQ={eventsChartQ}
          participationsChartQ={participationsChartQ}
          conversionChartQ={conversionChartQ}
          participationsPerEventChartQ={participationsPerEventChartQ}
        />

        <UsersDashboardSection
          metrics={m}
          usersChartQ={usersChartQ}
          usersTotalChartQ={usersTotalChartQ}
          repeatParticipantsChartQ={repeatParticipantsChartQ}
        />

        <ReviewsDashboardSection
          metrics={m}
          ratingChartQ={ratingChartQ}
          lowRatedChartQ={lowRatedChartQ}
          reviewLeaveChartQ={reviewLeaveChartQ}
        />

        <ComplaintsDashboardSection metrics={m} complaintsChartQ={complaintsChartQ} />
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
  if (usersQ.isError) return <p className="authError">{formatApiError(usersQ.error)}</p>
  if (!usersQ.data) return null
  return <UsersTab users={usersQ.data} mut={mut} />
}

function AdminPendingRoute() {
  const pendingQ = useAdminPendingEvents()
  const mut = useAdminMutations()
  if (pendingQ.isPending) return <p className="pageSub">Загрузка…</p>
  if (pendingQ.isError) return <p className="authError">{formatApiError(pendingQ.error)}</p>
  if (!pendingQ.data) return null
  return <PendingTab events={pendingQ.data} mut={mut} />
}

function AdminComplaintsRoute() {
  const complaintsQ = useAdminComplaints()
  const mut = useAdminMutations()
  if (complaintsQ.isPending) return <p className="pageSub">Загрузка…</p>
  if (complaintsQ.isError) return <p className="authError">{formatApiError(complaintsQ.error)}</p>
  if (!complaintsQ.data) return null
  return <ComplaintsTab items={complaintsQ.data} mut={mut} />
}

function AdminContent({ dashboardOnly = false }: { dashboardOnly?: boolean }) {
  return (
    <div className="page myEventsPage adminPage">
      <header className="myEventsHeader">
        <div>
          <h1 className="myEventsTitle">Админ-панель</h1>
          <p className="eventDetailMuted">
            {dashboardOnly ? 'Ключевые метрики и статистика' : 'Управление пользователями, событиями и жалобами'}
          </p>
        </div>
        <Link to="/" className="homeGhostBtn">
          На сайт
        </Link>
      </header>

      <Routes>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DashboardTab />} />
        {!dashboardOnly ? (
          <>
            <Route path="users" element={<AdminUsersRoute />} />
            <Route path="pending" element={<AdminPendingRoute />} />
            <Route path="complaints" element={<AdminComplaintsRoute />} />
          </>
        ) : null}
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>
    </div>
  )
}

export function AdminPage() {
  const role = useAuthStore((s) => s.user?.role)
  const adminAllowed = useAdminAccessAllowed()
  const adminDashboardAllowed = useAdminDashboardAccessAllowed()
  if (!isAdminHostAllowed()) {
    return <Navigate to="/" replace />
  }
  if (!adminDashboardAllowed) {
    return (
      <div className="page">
        <h1 className="myEventsTitle">Админ-панель</h1>
        <p className="pageSub">Админ-панель доступна только с компьютера в браузере на ПК.</p>
        <Link to="/" className="homeGhostBtn">
          На главную
        </Link>
      </div>
    )
  }
  const dashboardOnly = !adminAllowed && adminDashboardAllowed
  return (
    <RequireAuth roles={['admin']}>
      {canModerate(role) ? <AdminContent dashboardOnly={dashboardOnly} /> : <Navigate to="/account" replace />}
    </RequireAuth>
  )
}
