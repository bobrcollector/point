/**
 * Полная настройка БД: .env → Docker → ожидание → миграции → сид.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureApiEnv } from './ensure-api-env.mjs'
import { waitForDatabase } from './wait-db.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const composeFile = path.join(root, 'infra', 'docker-compose.yml')
const infraEnvExample = path.join(root, 'infra', '.env.example')
const infraEnv = path.join(root, 'infra', '.env')

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

function ensureInfraEnv() {
  if (fs.existsSync(infraEnv)) return
  if (fs.existsSync(infraEnvExample)) {
    fs.copyFileSync(infraEnvExample, infraEnv)
    console.log('Создан infra/.env (POSTGRES_PORT=5433)')
  }
}

function ensureVenv() {
  const py =
    process.platform === 'win32'
      ? path.join(root, 'services', 'api', '.venv', 'Scripts', 'python.exe')
      : path.join(root, 'services', 'api', '.venv', 'bin', 'python')
  if (!fs.existsSync(py)) {
    console.log('\nСоздание Python venv…')
    run('node', ['scripts/ensure-api-venv.mjs'])
  }
}

console.log('=== Point: настройка базы данных ===\n')

ensureInfraEnv()
ensureApiEnv()
ensureVenv()

console.log('\n1/4 Docker PostGIS…')
run('docker', ['compose', '-f', composeFile, '--env-file', infraEnv, 'up', '-d'])

console.log('\n2/4 Ожидание PostgreSQL…')
const ready = await waitForDatabase()
if (!ready) process.exit(1)

console.log('\n3/4 Миграции…')
run('node', ['scripts/run-python.mjs', '-m', 'alembic', 'upgrade', 'head'])

console.log('\n4/4 Демо-данные…')
run('node', ['scripts/run-python.mjs', '-m', 'app.seed'])

console.log('\n=== База готова ===')
console.log('  Админ:  dev@point-demo.ru / dev12345')
console.log('  Сайт:   npm run dev:all  →  http://localhost:5173')
console.log('  API:    http://127.0.0.1:8000/docs')
