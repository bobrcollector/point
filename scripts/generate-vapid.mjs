/**
 * Генерирует пару VAPID-ключей для Web Push.
 * Публичный ключ — в services/api/.env, приватный — в services/api/.vapid_private.pem
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const apiDir = path.join(root, 'services', 'api')
const envPath = path.join(apiDir, '.env')
const pemPath = path.join(apiDir, '.vapid_private.pem')
const python =
  process.platform === 'win32'
    ? path.join(apiDir, '.venv', 'Scripts', 'python.exe')
    : path.join(apiDir, '.venv', 'bin', 'python')

if (!fs.existsSync(python)) {
  console.error('Не найден venv API. Запустите: npm run setup:api')
  process.exit(1)
}

const py = spawnSync(
  python,
  [
    '-c',
    `from py_vapid import Vapid
from py_vapid.utils import b64urlencode
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
v = Vapid()
v.generate_keys()
raw = v.public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
print(b64urlencode(raw))
print('---')
print(v.private_pem().decode())`,
  ],
  { encoding: 'utf8', cwd: apiDir }
)

if (py.status !== 0) {
  console.error(py.stderr || py.stdout || 'Не удалось запустить Python/py_vapid')
  process.exit(1)
}

const [publicKey, privateKey] = py.stdout.trim().split(/\r?\n---\r?\n/)
if (!publicKey || !privateKey) {
  console.error('Неожиданный вывод генератора ключей')
  process.exit(1)
}

function upsertSingleLine(content, key, value) {
  const withoutBlock = content.replace(
    new RegExp(`^${key}=.*(?:\\r?\\n(?!\\S).*)*`, 'm'),
    ''
  )
  const line = `${key}=${value}`
  if (new RegExp(`^${key}=`, 'm').test(withoutBlock)) {
    return withoutBlock.replace(new RegExp(`^${key}=.*$`, 'm'), line)
  }
  return `${withoutBlock.trimEnd()}\n${line}\n`
}

fs.writeFileSync(pemPath, `${privateKey.trim()}\n`, 'utf8')

let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
content = content.replace(/^VAPID_PRIVATE_KEY=-----BEGIN[\s\S]*?-----END PRIVATE KEY-----\r?\n?/m, '')
content = upsertSingleLine(content, 'VAPID_PUBLIC_KEY', publicKey.trim())
content = upsertSingleLine(content, 'VAPID_PRIVATE_KEY', '.vapid_private.pem')
if (!/^VAPID_CLAIMS_EMAIL=/m.test(content)) {
  content = upsertSingleLine(content, 'VAPID_CLAIMS_EMAIL', 'mailto:admin@point.local')
}
fs.writeFileSync(envPath, content.endsWith('\n') ? content : `${content}\n`, 'utf8')

console.log('VAPID: публичный ключ в services/api/.env')
console.log('VAPID: приватный ключ в services/api/.vapid_private.pem')
console.log('Перезапустите API.')
console.log('В настройках отключите и снова включите push — старые подписки в браузере станут недействительны.')
