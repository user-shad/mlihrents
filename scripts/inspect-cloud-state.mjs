import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const API_URL = process.env.PORTAL_SYNC_URL ?? 'https://www.mlihrent.com/api/portal-sync'

async function loadToken() {
  if (process.env.SYNC_API_TOKEN?.trim()) return process.env.SYNC_API_TOKEN.trim()
  const raw = await readFile(join(__dirname, '..', '.env.import'), 'utf8')
  const match = raw.match(/^SYNC_API_TOKEN="([^"]+)"/m)
  return match?.[1] ?? ''
}

const token = await loadToken()
const data = await fetch(API_URL, { headers: { Authorization: `Bearer ${token}` } }).then((r) =>
  r.json(),
)
const ops = data.ops ?? {}
const paidTotal = (ops.residentList ?? []).reduce((s, r) => s + (Number(r.amountPaid) || 0), 0)
console.log('payments', (ops.payments ?? []).length)
console.log('paidIds', (ops.paidIds ?? []).length)
console.log('paymentResetAt', ops.paymentResetAt ?? '(none)')
console.log('total amountPaid', paidTotal)
