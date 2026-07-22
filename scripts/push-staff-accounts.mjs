import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const API_URL = process.env.PORTAL_SYNC_URL ?? 'https://www.mlihrent.com/api/portal-sync'

const staffAccounts = [
  { phone: '0553262626', pin: '1989', name: 'Bo 3baid', tier: 'admin' },
  { phone: '0505001021', pin: '3004', name: 'Kalban', tier: 'staff' },
  { phone: '0529999799', pin: '1988', name: 'Mosa', tier: 'admin' },
  { phone: '0503262626', pin: '1983', name: 'Mohammed', tier: 'admin' },
]

function normalizePhone(phone) {
  let digits = String(phone).replace(/\D/g, '')
  if (digits.startsWith('971') && digits.length >= 12) digits = `0${digits.slice(3)}`
  if (digits.length === 9 && digits.startsWith('5')) digits = `0${digits}`
  return digits
}

function ensureBootstrapStaff(list) {
  let next = [...list]
  for (const s of staffAccounts) {
    const phone = normalizePhone(s.phone)
    if (!phone) continue
    const idx = next.findIndex((a) => a.role === 'admin' && normalizePhone(a.phone) === phone)
    const row = { phone, pin: s.pin, role: 'admin', name: s.name, staffTier: s.tier }
    if (idx >= 0) next[idx] = { ...next[idx], ...row }
    else next.push(row)
  }
  return next
}

async function loadToken() {
  if (process.env.SYNC_API_TOKEN?.trim()) return process.env.SYNC_API_TOKEN.trim()
  const raw = await readFile(join(__dirname, '..', '.env.import'), 'utf8')
  return raw.match(/^SYNC_API_TOKEN="([^"]+)"/m)?.[1] ?? ''
}

const token = await loadToken()
if (!token) {
  console.error('Missing SYNC_API_TOKEN')
  process.exit(1)
}

const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
const data = await fetch(API_URL, { headers }).then((r) => r.json())
if (!data.ops) {
  console.error('Could not load cloud row', data)
  process.exit(1)
}

const accounts = ensureBootstrapStaff(data.accounts ?? [])
const staff = accounts.filter((a) => a.role === 'admin')
console.log(
  'Staff accounts:',
  staff.map((a) => `${a.name} (${a.phone})`).join(', '),
)

const res = await fetch(API_URL, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ accounts, ops: data.ops }),
})
const out = await res.json().catch(() => ({}))
console.log('push status', res.status, out.ok ? 'ok' : out.error ?? out)
process.exit(res.ok ? 0 : 1)
