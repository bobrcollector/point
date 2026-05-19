/**
 * Ждёт готовности PostgreSQL в контейнере point_db.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const composeFile = path.join(root, 'infra', 'docker-compose.yml')
const maxAttempts = Number(process.env.DB_WAIT_ATTEMPTS || 40)
const delayMs = Number(process.env.DB_WAIT_DELAY_MS || 1500)

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function dockerCompose(args) {
  return spawnSync('docker', ['compose', '-f', composeFile, '--env-file', path.join(root, 'infra', '.env'), ...args], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
}

export async function waitForDatabase() {
  for (let i = 1; i <= maxAttempts; i++) {
    const check = spawnSync(
      'docker',
      ['exec', 'point_db', 'pg_isready', '-U', 'point', '-d', 'point'],
      { encoding: 'utf8', shell: process.platform === 'win32' }
    )
    if (check.status === 0) {
      console.log('PostgreSQL готов.')
      return true
    }
    const ps = dockerCompose(['ps', '--format', 'json'])
    if (ps.status !== 0 || !ps.stdout?.includes('point_db')) {
      console.error('Контейнер point_db не запущен. Выполните: npm run db:up')
      return false
    }
    process.stdout.write(`Ожидание БД (${i}/${maxAttempts})…\r`)
    await sleep(delayMs)
  }
  console.error('\nPostgreSQL не ответил вовремя. Проверьте: docker logs point_db')
  return false
}

if (process.argv[1]?.endsWith('wait-db.mjs')) {
  const ok = await waitForDatabase()
  process.exit(ok ? 0 : 1)
}
