/**
 * Создаёт services/api/.env из примера с актуальным портом Postgres.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const apiDir = path.join(root, 'services', 'api')
const envPath = path.join(apiDir, '.env')
const examplePath = path.join(apiDir, '.env.example')
const infraEnvPath = path.join(root, 'infra', '.env')

function readPostgresPort() {
  if (fs.existsSync(infraEnvPath)) {
    const m = fs.readFileSync(infraEnvPath, 'utf8').match(/^POSTGRES_PORT=(\d+)/m)
    if (m) return m[1]
  }
  return process.env.POSTGRES_PORT || '5433'
}

export function ensureApiEnv() {
  const port = readPostgresPort()
  const databaseUrl = `postgresql+asyncpg://point:point@127.0.0.1:${port}/point`

  let content = ''
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8')
    if (/^DATABASE_URL=/m.test(content)) {
      content = content.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${databaseUrl}`)
    } else {
      content = `DATABASE_URL=${databaseUrl}\n${content}`
    }
  } else if (fs.existsSync(examplePath)) {
    content = fs.readFileSync(examplePath, 'utf8')
    content = content.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${databaseUrl}`)
  } else {
    content = [
      `DATABASE_URL=${databaseUrl}`,
      'CORS_ORIGINS=http://localhost:5173',
      'JWT_SECRET=dev-point-local-secret-change-in-prod',
      'APP_PUBLIC_URL=http://localhost:5173',
      'VAPID_PUBLIC_KEY=',
      'VAPID_PRIVATE_KEY=',
      'VAPID_CLAIMS_EMAIL=mailto:admin@point.local',
      '',
    ].join('\n')
  }

  fs.writeFileSync(envPath, content.endsWith('\n') ? content : `${content}\n`, 'utf8')
  console.log(`services/api/.env → DATABASE_URL на порту ${port}`)
  return { port, databaseUrl }
}

if (process.argv[1]?.endsWith('ensure-api-env.mjs')) {
  ensureApiEnv()
}
