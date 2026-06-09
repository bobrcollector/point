/**
 * Проверка доступа к dev-серверу с телефона (LAN).
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const webPort = process.env.POINT_WEB_PORT || '5173'
const ruleName = `Point Dev ${webPort}`

const VIRTUAL_ADAPTER = /vEthernet|WSL|Docker|Hyper-V|VirtualBox|VMware|Loopback|Teredo|Npcap/i

function isVirtualIp(ip) {
  if (ip.startsWith('169.254.')) return true
  const parts = ip.split('.').map(Number)
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  return false
}

function detectLanIp() {
  const candidates = []
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    if (!entries || VIRTUAL_ADAPTER.test(name)) continue
    for (const entry of entries) {
      if (entry.family !== 'IPv4' && entry.family !== 4) continue
      if (entry.internal) continue
      const ip = entry.address
      if (isVirtualIp(ip)) continue
      let score = 0
      if (ip.startsWith('192.168.')) score = 30
      else if (ip.startsWith('10.')) score = 20
      else continue
      if (/Wi-?Fi|WLAN|Беспровод/i.test(name)) score += 5
      candidates.push({ ip, score, name })
    }
  }
  candidates.sort((a, b) => b.score - a.score)
  return candidates[0]?.ip ?? null
}

function readEnvIp() {
  const envPath = path.join(root, 'apps', 'web', '.env.development.local')
  if (!fs.existsSync(envPath)) return null
  const match = fs.readFileSync(envPath, 'utf8').match(/^VITE_LAN_HOST=(.+)$/m)
  return match?.[1]?.trim() ?? null
}

function firewallOpen() {
  if (process.platform !== 'win32') return true
  try {
    const out = execSync(`netsh advfirewall firewall show rule name="${ruleName}"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return new RegExp(`(?:Локальный порт|LocalPort):\\s+${webPort}`).test(out)
  } catch {
    return false
  }
}

function portOpen(host) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: Number(webPort), timeout: 2000 }, () => {
      socket.end()
      resolve(true)
    })
    socket.on('error', () => resolve(false))
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

const detected = detectLanIp()
const configured = readEnvIp()
const ip = detected ?? configured

console.log('')
if (!ip) {
  console.warn('LAN: Wi‑Fi IP не найден. Подключите ПК к Wi‑Fi.')
  process.exit(1)
}

if (configured && detected && configured !== detected) {
  console.warn(`LAN: IP изменился ${configured} → ${detected}. Перезапустите npm run dev:all`)
}

const fw = firewallOpen()
const listening = await portOpen('127.0.0.1')
const lanReachable = await portOpen(ip)

const httpsUrl = `https://${ip}:${webPort}`
const httpUrl = `http://${ip}:${webPort}`

console.log('══════════════════════════════════════════════════')
console.log('  ТЕЛЕФОН — откройте в браузере (только Wi‑Fi IP):')
console.log(`  ${httpsUrl}`)
console.log('══════════════════════════════════════════════════')

const issues = []
if (!fw) issues.push('  ⚠ Брандмауэр: порт закрыт → npm run open-firewall (UAC → Да)')
if (!listening) issues.push('  ⚠ Dev-сервер не запущен → npm run dev:all')
else if (!lanReachable) issues.push(`  ⚠ Порт ${webPort} не отвечает на ${ip} — брандмауэр / Wi‑Fi`)
else console.log('  ✓ Порт доступен с этого ПК по Wi‑Fi IP')

for (const line of issues) console.warn(line)

console.log('')
console.log('  Не открывайте 172.17.x.x (Docker) — с телефона не работает')
console.log('  Только https, не http (http не слушается в LAN-режиме)')
console.log('  Телефон и ПК — одна Wi‑Fi сеть, не мобильный интернет')
console.log('  При ошибке сертификата: Дополнительно → Продолжить')
console.log('')
console.log('  Push на Android: https://192.168.x.x НЕ работает с service worker.')
console.log('  Используйте USB: npm run dev:android:push → http://localhost:5173 на телефоне')
console.log('')
