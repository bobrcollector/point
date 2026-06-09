/**
 * Push на Android: adb reverse + http://localhost:5173 (secure context без HTTPS).
 * Chrome на Android блокирует service worker на самоподписанном https://192.168.x.x
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const webEnvPath = path.join(root, 'apps', 'web', '.env.development.local')
const port = process.env.POINT_WEB_PORT || '5173'

const envContent = [
  '# Сгенерировано scripts/android-push-dev.mjs',
  'VITE_ANDROID_ADB_PUSH=true',
  'VITE_PWA_DEV=true',
  'VITE_API_BASE_URL=',
  '',
].join('\n')

fs.writeFileSync(webEnvPath, envContent, 'utf8')

console.log('')
console.log('══════════════════════════════════════════════════')
console.log('  Android push — режим USB (adb reverse)')
console.log('══════════════════════════════════════════════════')

let adbOk = false
try {
  execSync('adb devices', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  execSync(`adb reverse tcp:${port} tcp:${port}`, { stdio: 'inherit' })
  adbOk = true
  console.log(`  ✓ adb reverse tcp:${port} tcp:${port}`)
} catch {
  console.warn('  ⚠ adb не найден или телефон не подключён')
  console.warn('    1. Включите «Отладка по USB» на телефоне')
  console.warn('    2. Установите Android platform-tools (adb)')
  console.warn('    3. Подключите телефон кабелем к ПК')
}

console.log('')
if (adbOk) {
  console.log('  На телефоне в Chrome откройте:')
  console.log(`  http://localhost:${port}`)
} else {
  console.log('  После подключения adb запустите снова: npm run dev:android:push')
}
console.log('')
console.log('  Не используйте https://192.168.x.x для push на Android — SW не заработает.')
console.log('')
