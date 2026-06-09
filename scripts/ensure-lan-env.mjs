/**

 * Добавляет LAN-адрес ПК в CORS и публичные URL API для доступа с телефона.

 */

import fs from 'node:fs'

import os from 'node:os'

import path from 'node:path'

import { fileURLToPath } from 'node:url'

import { generateLanCert } from './generate-lan-cert.mjs'



const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const envPath = path.join(root, 'services', 'api', '.env')

const webPort = process.env.POINT_WEB_PORT || '5173'

const apiPort = process.env.POINT_API_PORT || '8000'



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

      if (/Ethernet|eth/i.test(name)) score += 3

      candidates.push({ ip, score, name })

    }

  }

  candidates.sort((a, b) => b.score - a.score)

  return candidates[0]?.ip ?? null

}



function upsertEnvValue(content, key, value) {

  const line = `${key}=${value}`

  if (new RegExp(`^${key}=`, 'm').test(content)) {

    return content.replace(new RegExp(`^${key}=.*$`, 'm'), line)

  }

  return `${content.trimEnd()}\n${line}\n`

}



function mergeOrigins(content, origin) {

  const match = content.match(/^CORS_ORIGINS=(.*)$/m)

  const current = match?.[1]?.trim() ?? 'http://localhost:5173'

  const parts = current.split(',').map((s) => s.trim()).filter(Boolean)

  if (!parts.includes(origin)) parts.push(origin)

  return upsertEnvValue(content, 'CORS_ORIGINS', parts.join(','))

}



const ip = detectLanIp()

if (!ip) {

  console.warn('LAN: не найден IPv4 в локальной сети (192.168.x.x / 10.x.x.x).')

  process.exit(0)

}



const webOrigin = `https://${ip}:${webPort}`

const apiOrigin = `http://${ip}:${apiPort}`

const webEnvPath = path.join(root, 'apps', 'web', '.env.lan')
const webDevLocalPath = path.join(root, 'apps', 'web', '.env.development.local')



let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''

content = mergeOrigins(content, webOrigin)

content = upsertEnvValue(content, 'APP_PUBLIC_URL', webOrigin)

content = upsertEnvValue(content, 'API_PUBLIC_URL', apiOrigin)

fs.writeFileSync(envPath, content.endsWith('\n') ? content : `${content}\n`, 'utf8')



// Vite в lan-режиме слушает только Wi‑Fi/Ethernet IP, не Docker/WSL (172.17.x).

const webLanEnv = [
  '# Сгенерировано scripts/ensure-lan-env.mjs — не редактировать вручную',
  `VITE_LAN_HOST=${ip}`,
  '# API с телефона — через proxy Vite на :5173, не напрямую на :8000',
  'VITE_API_BASE_URL=',
  '# Service worker для push на телефоне в LAN',
  'VITE_PWA_DEV=true',
  '',
].join('\n')

fs.writeFileSync(webEnvPath, webLanEnv, 'utf8')
fs.writeFileSync(webDevLocalPath, webLanEnv, 'utf8')

const certDir = path.join(root, 'apps', 'web', '.lan-cert')
const certPath = path.join(certDir, 'cert.pem')
const keyPath = path.join(certDir, 'key.pem')
const mkcertMarker = path.join(certDir, '.mkcert')
const hasMkcertCert = fs.existsSync(mkcertMarker) && fs.existsSync(certPath) && fs.existsSync(keyPath)
const hasAnyCert = fs.existsSync(certPath) && fs.existsSync(keyPath)

if (hasMkcertCert) {
  console.log('  HTTPS: mkcert-сертификат сохранён (не перезаписываем)')
} else if (!hasAnyCert) {
  await generateLanCert(ip)
  console.log('  HTTPS: создан самоподписанный сертификат (для телефона лучше: npm run setup:mkcert)')
} else {
  console.log('  HTTPS: используется существующий .lan-cert (npm run setup:mkcert — доверенный сертификат)')
}

console.log('')
console.log('══════════════════════════════════════════════════')
console.log('  ТЕЛЕФОН: откройте ТОЛЬКО этот адрес в браузере:')
console.log(`  ${webOrigin}`)
console.log('══════════════════════════════════════════════════')
console.log('  Важно: используйте https (не http) — иначе push на телефоне не работает')
if (hasMkcertCert) {
  console.log('  mkcert: rootCA.pem должен быть установлен на телефоне как CA')
} else {
  console.log('  При первом открытии примите предупреждение о сертификате')
  console.log('  Или: npm run setup:mkcert → установить rootCA.pem на телефон')
}
console.log('  iPhone: Safari → На экран Домой → открыть оттуда для push')
console.log('  Не используйте 172.17.x.x — это Docker, с телефона недоступен')
console.log('  Телефон и ПК — одна Wi‑Fi сеть')
console.log('  Если «не удалось получить доступ» — разрешите npm run open-firewall (UAC → Да)')
console.log('  Чёрный экран: очистите данные сайта в Chrome или откройте в режиме инкогнито')
console.log('  Обновлены: services/api/.env, apps/web/.env.development.local')
console.log('')


