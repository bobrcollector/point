/**
 * Сертификат HTTPS с IP в SAN — телефон лучше принимает, чем basic-ssl только для localhost.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import selfsigned from 'selfsigned'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const certDir = path.join(root, 'apps', 'web', '.lan-cert')

export async function generateLanCert(ip) {
  if (!ip) return false

  const attrs = [{ name: 'commonName', value: ip }]
  const pems = await selfsigned.generate(attrs, {
    algorithm: 'sha256',
    days: 365,
    keySize: 2048,
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 7, ip },
          { type: 2, value: 'localhost' },
        ],
      },
    ],
  })

  fs.mkdirSync(certDir, { recursive: true })
  fs.writeFileSync(path.join(certDir, 'cert.pem'), pems.cert)
  fs.writeFileSync(path.join(certDir, 'key.pem'), pems.private)
  return true
}

const ip = process.argv[2]?.trim()
if (ip) {
  await generateLanCert(ip)
  console.log(`LAN: сертификат HTTPS для ${ip} → apps/web/.lan-cert/`)
}
