/**
 * Создаёт venv и ставит зависимости API, если ещё не установлены.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const apiDir = path.join(root, 'services', 'api')
const py =
  process.platform === 'win32'
    ? path.join(apiDir, '.venv', 'Scripts', 'python.exe')
    : path.join(apiDir, '.venv', 'bin', 'python')

function run(cmd, args, cwd = apiDir) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

if (fs.existsSync(py)) {
  console.log('Python venv уже есть:', py)
  process.exit(0)
}

console.log('Создание venv в services/api…')
run('python', ['-m', 'venv', '.venv'])

console.log('Установка зависимостей…')
run(py, ['-m', 'pip', 'install', '-U', 'pip'])
run(py, ['-m', 'pip', 'install', '-e', '.'])

console.log('Готово.')
