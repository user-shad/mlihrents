/**
 * Remove all payment records, proofs, paid invoice flags, and amountPaid totals.
 * Usage: node scripts/clean-all-payments.mjs [--dry-run]
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRY_RUN = process.argv.includes('--dry-run')
const API_URL = process.env.PORTAL_SYNC_URL ?? 'https://www.mlihrent.com/api/portal-sync'

function isPastDue(dueDateIso) {
  if (!dueDateIso) return false
  const due = new Date(dueDateIso)
  if (Number.isNaN(due.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return due < today
}

function cleanAllPaymentData(ops) {
  const residentList = (ops.residentList ?? []).map((resident) => ({
    ...resident,
    amountPaid: 0,
    status:
      resident.status === 'arrears'
        ? 'active'
        : resident.status === 'notice'
          ? 'notice'
          : resident.status ?? 'active',
  }))

  const invoiceMap = {}
  for (const [residentId, invoices] of Object.entries(ops.invoiceMap ?? {})) {
    invoiceMap[residentId] = (invoices ?? []).map((inv) => {
      if (inv.status !== 'paid') return inv
      return {
        ...inv,
        status: isPastDue(inv.dueDateIso) ? 'overdue' : 'due',
      }
    })
  }

  return {
    ...ops,
    payments: [],
    paidIds: [],
    residentList,
    invoiceMap,
    paymentResetAt: new Date().toISOString(),
  }
}

async function loadToken() {
  if (process.env.SYNC_API_TOKEN?.trim()) return process.env.SYNC_API_TOKEN.trim()
  try {
    const raw = await readFile(join(__dirname, '..', '.env.import'), 'utf8')
    const match = raw.match(/^SYNC_API_TOKEN="([^"]+)"/m)
    if (match?.[1]) return match[1]
  } catch {
    /* optional */
  }
  return ''
}

async function main() {
  const token = await loadToken()
  if (!token && !DRY_RUN) {
    console.error('Set SYNC_API_TOKEN (same as Vercel).')
    process.exit(1)
  }

  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const getRes = await fetch(API_URL, { cache: 'no-store', headers })
  if (!getRes.ok) {
    console.error('Could not load cloud data:', getRes.status, await getRes.text())
    process.exit(1)
  }

  const cloud = await getRes.json()
  const ops = cloud.ops ?? {}
  const accounts = cloud.accounts ?? []
  const beforePayments = (ops.payments ?? []).length
  const beforePaidTotal = (ops.residentList ?? []).reduce(
    (sum, r) => sum + (Number(r.amountPaid) || 0),
    0,
  )
  const beforePaidInvoices = (ops.paidIds ?? []).length

  const cleaned = cleanAllPaymentData(ops)

  console.log('Before:')
  console.log(`  payments: ${beforePayments}`)
  console.log(`  paid invoice ids: ${beforePaidInvoices}`)
  console.log(`  total amountPaid: ${beforePaidTotal.toLocaleString()} AED`)
  console.log('After:')
  console.log(`  payments: ${cleaned.payments.length}`)
  console.log(`  paid invoice ids: ${cleaned.paidIds.length}`)
  console.log(
    `  total amountPaid: ${cleaned.residentList.reduce((sum, r) => sum + (Number(r.amountPaid) || 0), 0).toLocaleString()} AED`,
  )

  const payload = {
    accounts,
    ops: cleaned,
    fullReplace: true,
  }

  if (DRY_RUN) {
    await writeFile(join(__dirname, 'clean-payments-preview.json'), JSON.stringify(payload, null, 2))
    console.log('Dry run — wrote scripts/clean-payments-preview.json')
    return
  }

  const putRes = await fetch(API_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  })
  const body = await putRes.json().catch(() => ({}))
  if (!putRes.ok) {
    console.error('Upload failed:', putRes.status, body)
    process.exit(1)
  }

  console.log('Cloud payment data cleared:', body.storage ?? 'cloud', body.updated_at ?? '')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
