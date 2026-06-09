/**
 * Доверенный HTTPS для LAN (альтернатива adb). Требует mkcert + установку rootCA на телефон.
 */
import { execSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const certDir = path.join(root, 'apps', 'web', '.lan-cert')

function hasMkcert() {
  try {
    execSync('mkcert -version', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function detectIp() {
  for (const [, entries] of Object.entries(os.networkInterfaces())) {
    if (!entries) continue
    for (const entry of entries) {
      if (entry.family !== 'IPv4' && entry.family !== 4) continue
      if (entry.internal) continue
      const ip = entry.address
      if (ip.startsWith('192.168.') || ip.startsWith('10.')) return ip
    }
  }
  return null
}

const ip = detectIp()
if (!ip) {
  console.warn('LAN IP не найден')
  process.exit(1)
}

if (!hasMkcert()) {
  console.log('')
  console.log('mkcert не установлен. Установите:')
  console.log('  winget install FiloSottile.mkcert')
  console.log('  mkcert -install')
  console.log('  npm run setup:mkcert')
  console.log('')
  console.log('Или для push без mkcert используйте: npm run dev:android:push')
  process.exit(1)
}

fs.mkdirSync(certDir, { recursive: true })
const certFile = path.join(certDir, 'cert.pem')
const keyFile = path.join(certDir, 'key.pem')

spawnSync('mkcert', ['-cert-file', certFile, '-key-file', keyFile, ip, 'localhost', '127.0.0.1'], {
  stdio: 'inherit',
  shell: true,
})

let caroot = ''
try {
  caroot = execSync('mkcert -CAROOT', { encoding: 'utf8' }).trim()
} catch {
  // ignore
}

if (caroot) {
  const rootCa = path.join(caroot, 'rootCA.pem')
  if (fs.existsSync(rootCa)) {
    fs.copyFileSync(rootCa, path.join(certDir, 'rootCA.pem'))
    console.log('')
    console.log('Скопируйте на телефон файл:')
    console.log(`  ${path.join(certDir, 'rootCA.pem')}`)
    console.log('Android: Настройки → Безопасность → Установить сертификат → CA')
    console.log(`Затем откройте https://${ip}:5173`)
    console.log('')
  }
}

fs.writeFileSync(path.join(certDir, '.mkcert'), `${new Date().toISOString()}\n`, 'utf8')

console.log(`Сертификат mkcert для ${ip} готов.`)
console.log('npm run dev:all больше не перезапишет этот сертификат.')
