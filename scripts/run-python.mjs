/**
 * Запускает Python из venv сервиса API (кроссплатформенно).
 * Пример: node scripts/run-python.mjs -m alembic upgrade head
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
    `Не найден интерпретатор: ${py}\n` +
      'Создайте venv в services/api и установите зависимости (см. services/api/README.md).'
  )
  process.exit(1)
}

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Укажите аргументы для python, например: -m alembic upgrade head')
  process.exit(1)
}

const child = spawn(py, args, { cwd: apiDir, stdio: 'inherit', env: process.env })
child.on('exit', (code) => process.exit(code ?? 1))
