/**
 * Запуск uvicorn для сервиса API (ожидается venv в services/api/.venv).
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const apiDir = path.join(root, 'services', 'api')
const py =
  process.platform === 'win32'
    ? path.join(apiDir, '.venv', 'Scripts', 'python.exe')
    : path.join(apiDir, '.venv', 'bin', 'python')

if (!fs.existsSync(py)) {
  console.error(
    `Не найден: ${py}\n` +
      'Выполните в services/api: python -m venv .venv && .venv\\Scripts\\activate && pip install -e .'
  )
  process.exit(1)
}

const child = spawn(
  py,
  ['-m', 'uvicorn', 'app.main:app', '--reload', '--host', process.env.POINT_API_HOST ?? '127.0.0.1', '--port', process.env.POINT_API_PORT ?? '8000'],
  { cwd: apiDir, stdio: 'inherit', env: process.env }
)
child.on('exit', (code) => process.exit(code ?? 1))
