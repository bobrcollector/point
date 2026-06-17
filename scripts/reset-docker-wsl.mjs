import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const script = path.join(root, 'scripts', 'reset-docker-wsl-admin.ps1')

const ps = [
  '-NoProfile',
  '-ExecutionPolicy',
  'Bypass',
  '-Command',
  `Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File "${script}"'`,
]

const child = spawn('powershell', ps, { stdio: 'inherit', shell: false })
child.on('exit', (code) => process.exit(code ?? 0))
