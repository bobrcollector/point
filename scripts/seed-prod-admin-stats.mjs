#!/usr/bin/env node
/**
 * Заполняет метрики админки на production через публичный API.
 * Использование: node scripts/seed-prod-admin-stats.mjs [baseUrl]
 */
const BASE = (process.argv[2] || process.env.POINT_API_BASE || 'https://pointme.site').replace(/\/$/, '')
const ADMIN_EMAIL = process.env.POINT_ADMIN_EMAIL || 'dev@point-demo.ru'
const USER_PASSWORD = process.env.POINT_DEMO_PASSWORD || 'dev12345'

const CHART_USERS_PER_DAY = [2, 4, 1, 5, 3, 6, 4]
const COMPLAINT_REASONS = [
  'Некорректное описание события',
  'Подозрительная ссылка в описании',
  'Дублирует другое мероприятие',
  'Неверное место проведения',
  'Спам в названии',
  'Мероприятие уже отменено',
  'Нарушение правил площадки',
]
const REVIEW_TEXTS = [
  'Отличная атмосфера, обязательно приду ещё!',
  'Организация на высоте, всё началось вовремя.',
  'Интересная программа, но было тесновато.',
  'Понравилось, рекомендую друзьям.',
  'Хороший спикер и полезный материал.',
  'Немного затянулось, но в целом классно.',
  'Супер локация и дружелюбная публика.',
  'Вернусь на следующий сезон.',
]

function chartUserEmails() {
  const out = []
  for (let i = 0; i < CHART_USERS_PER_DAY.length; i += 1) {
    const daysAgo = 6 - i
    for (let n = 0; n < CHART_USERS_PER_DAY[i]; n += 1) {
      out.push(`chart-user-d${daysAgo}-n${n}@point-demo.ru`)
    }
  }
  return out
}

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    const detail = typeof data === 'object' && data?.detail ? JSON.stringify(data.detail) : text
    throw new Error(`${method} ${path} → ${res.status}: ${detail}`)
  }
  return data
}

async function login(email) {
  const data = await api('/api/v1/auth/login', {
    method: 'POST',
    body: { email, password: USER_PASSWORD },
  })
  return data.access_token
}

async function main() {
  console.log(`Seeding admin stats at ${BASE} ...`)
  const adminToken = await login(ADMIN_EMAIL)
  const metricsBefore = await api('/api/v1/admin/dashboard/metrics', { token: adminToken })
  console.log('Before:', metricsBefore)

  const emails = chartUserEmails()
  let participations = 0
  let reviews = 0
  let complaints = 0

  for (let i = 0; i < 18; i += 1) {
    const email = emails[i % emails.length]
    const eventId = 101 + (i % 20)
    try {
      const token = await login(email)
      await api(`/api/v1/catalog/events/${eventId}/participation`, {
        method: 'PUT',
        token,
        body: { enabled: true },
      })
      participations += 1
    } catch (e) {
      console.warn(`participation skip (${email}, event ${eventId}):`, e.message)
    }
  }

  for (let i = 0; i < REVIEW_TEXTS.length; i += 1) {
    const email = emails[i % emails.length]
    const eventId = 101 + i
    try {
      const token = await login(email)
      await api(`/api/v1/catalog/events/${eventId}/reviews`, {
        method: 'POST',
        token,
        body: { text: REVIEW_TEXTS[i], rating: 4 + (i % 2) },
      })
      reviews += 1
    } catch (e) {
      console.warn(`review skip (event ${eventId}):`, e.message)
    }
  }

  let complaintIdx = 0
  for (let i = 0; i < CHART_USERS_PER_DAY.length; i += 1) {
    const count = CHART_USERS_PER_DAY[i]
    for (let n = 0; n < count; n += 1) {
      if (complaintIdx >= 14) break
      const email = emails[complaintIdx % emails.length]
      const eventId = 105 + (complaintIdx % 15)
      try {
        const token = await login(email)
        await api('/api/v1/complaints', {
          method: 'POST',
          token,
          body: { event_id: eventId, reason: COMPLAINT_REASONS[complaintIdx % COMPLAINT_REASONS.length] },
        })
        complaints += 1
      } catch (e) {
        console.warn(`complaint skip (event ${eventId}):`, e.message)
      }
      complaintIdx += 1
    }
  }

  const pendingPayloads = [
    {
      title: 'Open mic: поэзия и музыка',
      description: 'Вечер живой поэзии и акустики в уютном клубе. Участники могут выйти на сцену без записи.',
      location: 'Клуб «Аrt»',
      address_detail: 'Москва, вход по списку',
      event_datetime: '2026-06-25T20:00:00+03:00',
      category_ids: [1],
      latitude: 55.75,
      longitude: 37.62,
      status: 'pending',
    },
    {
      title: 'Мастер-класс по каллиграфии',
      description: 'Погружение в современную каллиграфию: материалы, штрихи и финальный мини-проект.',
      location: 'Студия «Чернила»',
      address_detail: 'Москва, все материалы на месте',
      event_datetime: '2026-06-28T14:00:00+03:00',
      category_ids: [9],
      latitude: 55.76,
      longitude: 37.64,
      status: 'pending',
    },
  ]

  let pending = 0
  for (const payload of pendingPayloads) {
    try {
      await api('/api/v1/organizer/events', {
        method: 'POST',
        token: adminToken,
        body: payload,
      })
      pending += 1
    } catch (e) {
      console.warn(`pending event skip (${payload.title}):`, e.message)
    }
  }

  try {
    const users = await api('/api/v1/admin/users', { token: adminToken })
    const banTarget = users.find((u) => u.email?.startsWith('chart-user-d6-n0@'))
    if (banTarget && !banTarget.is_banned) {
      await api(`/api/v1/admin/users/${banTarget.user_id}/ban`, { method: 'PUT', token: adminToken })
      console.log(`Banned demo user ${banTarget.email}`)
    }
  } catch (e) {
    console.warn('ban skip:', e.message)
  }

  const metricsAfter = await api('/api/v1/admin/dashboard/metrics', { token: adminToken })
  console.log('After:', metricsAfter)
  console.log(
    `Done: +${participations} participations, +${reviews} reviews, +${complaints} complaints, +${pending} pending events`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
