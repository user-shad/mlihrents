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
const res = await fetch(API_URL, { headers: { Authorization: `Bearer ${token}` } })
const data = await res.json()
const pending = (data.ops?.payments ?? []).filter((p) => p.status === 'pending_review')
const withProofMeta = (data.ops?.payments ?? []).filter((p) => p.transferProof?.name)
console.log('storage', data.storage)
console.log('total payments', (data.ops?.payments ?? []).length)
console.log('pending payments', pending.length)
console.log('payments with proof metadata', withProofMeta.length)
for (const p of (data.ops?.payments ?? []).slice(0, 15)) {
  const len = p.transferProof?.dataUrl?.length ?? 0
  console.log(`${p.id} ${p.status} ${p.unit} proof=${p.transferProof?.name ?? '-'} dataUrlLen=${len}`)
}
