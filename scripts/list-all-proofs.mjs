import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.PORTAL_SYNC_URL?.replace('/api/portal-sync', '') ?? 'https://www.mlihrent.com'

async function loadToken() {
  if (process.env.SYNC_API_TOKEN?.trim()) return process.env.SYNC_API_TOKEN.trim()
  const raw = await readFile(join(__dirname, '..', '.env.import'), 'utf8')
  const match = raw.match(/^SYNC_API_TOKEN="([^"]+)"/m)
  return match?.[1] ?? ''
}

const token = await loadToken()
const headers = { Authorization: `Bearer ${token}` }

const sync = await fetch(`${BASE}/api/portal-sync`, { headers }).then((r) => r.json())
const payments = sync.ops?.payments ?? []
const pending = payments.filter((p) => p.status === 'pending_review')
const withProofMeta = payments.filter((p) => p.transferProof?.name || p.transferProof?.dataUrl)

console.log('storage', sync.storage)
console.log('total payments', payments.length)
console.log('pending_review', pending.length)
console.log('payments with proof metadata in sync blob', withProofMeta.length)

const payIds = payments.filter((p) => /^PAY-/.test(p.id)).map((p) => p.id)
let proofHits = []
for (const id of payIds) {
  const res = await fetch(`${BASE}/api/payment-proof?paymentId=${encodeURIComponent(id)}`, {
    headers,
    cache: 'no-store',
  })
  if (!res.ok) continue
  const data = await res.json()
  if (data.dataUrl) {
    const payment = payments.find((p) => p.id === id)
    proofHits.push({
      id,
      status: payment?.status ?? '?',
      unit: payment?.unit ?? '?',
      name: data.name,
      bytes: data.dataUrl.length,
    })
  }
}

console.log('screenshots in dedicated proof store', proofHits.length)
for (const hit of proofHits) {
  console.log(`  ${hit.id} ${hit.status} ${hit.unit} ${hit.name} (${hit.bytes} bytes)`)
}

if (pending.length === 0 && withProofMeta.length === 0 && proofHits.length === 0) {
  console.log('\nNo uploaded screenshots found on the server.')
}
