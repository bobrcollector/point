/**
 * Разрешает входящие подключения к dev-серверу Vite с телефона в локальной сети (Windows).
 */
import { execSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const webPort = process.env.POINT_WEB_PORT || '5173'
const scriptDir = path.dirname(fileURLToPath(import.meta.url))

if (process.platform !== 'win32') {
  process.exit(0)
}

const ruleName = `Point Dev ${webPort}`

function ruleExists() {
  try {
    const existing = execSync(`netsh advfirewall firewall show rule name="${ruleName}"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return new RegExp(`(?:Локальный порт|LocalPort):\\s+${webPort}`).test(existing)
  } catch {
    return false
  }
}

function addRule() {
  execSync(
    `netsh advfirewall firewall add rule name="${ruleName}" dir=in action=allow protocol=TCP localport=${webPort} profile=private,domain,public`,
    { stdio: 'pipe' },
  )
}

function tryElevated() {
  const adminScript = path.join(scriptDir, 'open-lan-firewall-admin.ps1')
  const arg = `-NoProfile -ExecutionPolicy Bypass -File "${adminScript}"`
  const ps = `Start-Process powershell -Verb RunAs -Wait -ArgumentList '${arg.replace(/'/g, "''")}'`
  spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit' })
}

if (ruleExists()) {
  process.exit(0)
}

try {
  addRule()
  console.log(`LAN: открыт порт ${webPort} в брандмауэре Windows`)
  process.exit(0)
} catch {
  console.log('')
  console.log('LAN: нужны права администратора для открытия порта', webPort)
  console.log('     Сейчас появится запрос UAC — нажмите «Да»')
  console.log('')
  tryElevated()
}

if (ruleExists()) {
  console.log(`LAN: порт ${webPort} открыт — телефон может подключиться`)
} else {
  console.warn('')
  console.warn('══════════════════════════════════════════════════')
  console.warn(`  БРАНДМАУЭР: порт ${webPort} ЗАКРЫТ — телефон не откроет сайт`)
  console.warn('  Запустите PowerShell от администратора:')
  console.warn(`    npm run open-firewall:admin`)
  console.warn('  или вручную разрешите входящий TCP', webPort)
  console.warn('══════════════════════════════════════════════════')
  console.warn('')
}
