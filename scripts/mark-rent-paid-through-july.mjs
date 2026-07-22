/**
 * Mark all occupied units as paid through July 2026 and push to cloud sync.
 * Usage: SYNC_API_TOKEN=... node scripts/mark-rent-paid-through-july.mjs [--dry-run]
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRY_RUN = process.argv.includes('--dry-run')
const API_URL = process.env.PORTAL_SYNC_URL ?? 'https://www.mlihrent.com/api/portal-sync'
const THROUGH_YEAR = 2026
const THROUGH_MONTH = 7

function normalizeRentSchedule(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(12, Math.max(1, Math.round(value)))
  }
  if (typeof value === 'string') {
    const legacy = { monthly: 1, quarterly: 3, semi_annual: 6, annual: 12, full_lease: 12 }[value.trim()]
    if (legacy) return legacy
    const n = Number(value)
    if (Number.isFinite(n)) return normalizeRentSchedule(n)
  }
  return 1
}

function parseLeaseStartDate(leaseStart) {
  const raw = leaseStart?.trim()
  if (!raw) return null
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) {
    const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]))
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function hasRentPlan(resident) {
  return resident.contractTotal > 0 && resident.rentAmount > 0
}

function isUnitOccupied(resident) {
  return !!(resident.name?.trim() || resident.phone?.trim())
}

function installmentCountThroughMonth(resident, throughYear, throughMonth) {
  const start = parseLeaseStartDate(resident.leaseStart)
  if (!start || !hasRentPlan(resident)) return 0
  const intervalMonths = normalizeRentSchedule(resident.rentSchedule)
  const end = new Date(throughYear, throughMonth, 0)
  if (start > end) return 0

  let count = 0
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  const through = new Date(throughYear, throughMonth - 1, 1)
  while (cursor <= through) {
    count += 1
    cursor.setMonth(cursor.getMonth() + intervalMonths)
  }
  return count
}

function amountDueThroughMonth(resident, throughYear, throughMonth) {
  const count = installmentCountThroughMonth(resident, throughYear, throughMonth)
  if (count <= 0) return 0
  return Math.min(resident.contractTotal, count * resident.rentAmount)
}

function calendarDueDateIso(year, month, dueDay) {
  const safeDay = Math.min(28, Math.max(1, Math.round(dueDay)))
  const lastDay = new Date(year, month, 0).getDate()
  const day = Math.min(safeDay, lastDay)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function remainingBalance(resident) {
  return Math.max(0, resident.contractTotal - resident.amountPaid)
}

function openInstallmentIndex(resident) {
  if (resident.rentAmount <= 0) return 0
  return Math.floor(Math.max(0, resident.amountPaid) / resident.rentAmount)
}

function leaseInstallmentDueIso(resident, installmentIndex) {
  const start = parseLeaseStartDate(resident.leaseStart)
  if (!start || installmentIndex < 0) return null
  const intervalMonths = normalizeRentSchedule(resident.rentSchedule)
  const dueDay = resident.rentDueDay || 1
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  cursor.setMonth(cursor.getMonth() + installmentIndex * intervalMonths)
  return calendarDueDateIso(cursor.getFullYear(), cursor.getMonth() + 1, dueDay)
}

function nextLeaseInstallmentDueIso(resident) {
  return leaseInstallmentDueIso(resident, openInstallmentIndex(resident))
}

function rentDueDayFromIso(iso) {
  const day = Number(iso.slice(8, 10))
  return Math.min(28, Math.max(1, Number.isFinite(day) ? day : 1))
}

function periodLabelFromIso(iso, lang = 'en') {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  if (lang === 'ar') return d.toLocaleDateString('ar-AE', { month: 'long', year: 'numeric' })
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

function formatIsoDueDate(iso, lang = 'en') {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  if (lang === 'ar') return d.toLocaleDateString('ar-AE', { day: 'numeric', month: 'long', year: 'numeric' })
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function isPastDue(iso, today = new Date()) {
  if (!iso) return false
  const due = new Date(`${iso}T23:59:59`)
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return due < start
}

function buildInstallmentInvoice(resident, lang = 'en') {
  const remaining = remainingBalance(resident)
  if (remaining <= 0 || resident.rentAmount <= 0) return null
  const dueDateIso = resident.nextDueDateIso || nextLeaseInstallmentDueIso(resident)
  if (!dueDateIso) return null
  const [y, m] = dueDateIso.split('-')
  const unit = (resident.apartment || resident.id).replace(/\s+/g, '')
  const id = `INV-${unit}-${y}${m}`
  return {
    id,
    period: periodLabelFromIso(dueDateIso, lang),
    amount: Math.min(resident.rentAmount, remaining),
    dueDateIso,
    dueDate: formatIsoDueDate(dueDateIso, lang),
    status: isPastDue(dueDateIso) ? 'overdue' : 'due',
  }
}

function applyRentPaidThroughMonth(residentList, invoiceMap, paidIds, throughYear, throughMonth, lang = 'en') {
  const paidSet = new Set(paidIds)

  const nextResidents = residentList.map((resident) => {
    if (!isUnitOccupied(resident) || !hasRentPlan(resident)) return resident
    const targetPaid = amountDueThroughMonth(resident, throughYear, throughMonth)
    if (targetPaid <= 0) return resident
    const amountPaid = resident.amountPaidManual
      ? resident.amountPaid
      : Math.min(resident.contractTotal, Math.max(resident.amountPaid, targetPaid))
    const caughtUp = amountPaid >= targetPaid
    const nextDueDateIso = nextLeaseInstallmentDueIso({ ...resident, amountPaid }) ?? resident.nextDueDateIso
    return {
      ...resident,
      amountPaid,
      nextDueDateIso,
      rentDueDay: nextDueDateIso ? rentDueDayFromIso(nextDueDateIso) : resident.rentDueDay,
      status:
        resident.status === 'notice'
          ? resident.status
          : caughtUp && resident.status === 'arrears'
            ? 'active'
            : resident.status ?? 'active',
    }
  })

  const nextInvoiceMap = {}
  for (const resident of nextResidents) {
    const existing = invoiceMap[resident.id] ?? []
    for (const inv of existing) paidSet.delete(inv.id)

    if (!isUnitOccupied(resident) || !hasRentPlan(resident) || remainingBalance(resident) <= 0) {
      nextInvoiceMap[resident.id] = []
      continue
    }

    const open = buildInstallmentInvoice(resident, lang)
    nextInvoiceMap[resident.id] = open ? [open] : []
  }

  return {
    residentList: nextResidents,
    invoiceMap: nextInvoiceMap,
    paidIds: [...paidSet],
  }
}

async function loadToken() {
  if (process.env.SYNC_API_TOKEN?.trim()) return process.env.SYNC_API_TOKEN.trim()
  try {
    const envPath = join(__dirname, '..', '.env.import')
    const raw = await readFile(envPath, 'utf8')
    const match = raw.match(/^SYNC_API_TOKEN="([^"]+)"/m)
    if (match?.[1]) return match[1]
  } catch {
    /* optional local env file */
  }
  return ''
}

async function main() {
  const token = await loadToken()
  if (!token && !DRY_RUN) {
    console.error('Set SYNC_API_TOKEN environment variable (same as Vercel).')
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

  const beforePaid = (ops.residentList ?? []).reduce((sum, r) => sum + (Number(r.amountPaid) || 0), 0)
  const fixed = applyRentPaidThroughMonth(
    ops.residentList ?? [],
    ops.invoiceMap ?? {},
    ops.paidIds ?? [],
    THROUGH_YEAR,
    THROUGH_MONTH,
  )

  const afterPaid = fixed.residentList.reduce((sum, r) => sum + (Number(r.amountPaid) || 0), 0)
  const updatedUnits = fixed.residentList.filter((r, idx) => {
    const prev = (ops.residentList ?? [])[idx]
    return prev && Number(r.amountPaid) !== Number(prev.amountPaid)
  })
  const invoiceCount = Object.values(fixed.invoiceMap).reduce((n, invs) => n + (invs?.length ?? 0), 0)

  console.log(`Through: Jul ${THROUGH_YEAR}`)
  console.log(`Next due: lease-based (typically Aug ${THROUGH_YEAR})`)
  console.log(`Occupied units with rent plan: ${fixed.residentList.filter((r) => isUnitOccupied(r) && hasRentPlan(r)).length}`)
  console.log(`Units with amountPaid updated: ${updatedUnits.length}`)
  const manualSkipped = fixed.residentList.filter(
    (r) => r.amountPaidManual && isUnitOccupied(r) && hasRentPlan(r),
  ).length
  if (manualSkipped > 0) console.log(`Units skipped (amountPaidManual): ${manualSkipped}`)
  console.log(`Total amountPaid: ${beforePaid.toLocaleString()} -> ${afterPaid.toLocaleString()} AED`)
  console.log(`Open invoices (one per unit): ${invoiceCount}`)

  const payload = {
    accounts,
    ops: {
      ...ops,
      residentList: fixed.residentList,
      invoiceMap: fixed.invoiceMap,
      paidIds: fixed.paidIds,
      payments: (ops.payments ?? []).filter((p) => p.status !== 'pending_review'),
    },
  }

  if (DRY_RUN) {
    await writeFile(join(__dirname, 'paid-through-july-preview.json'), JSON.stringify(payload, null, 2))
    console.log('Dry run — wrote scripts/paid-through-july-preview.json')
    return
  }

  const putRes = await fetch(API_URL, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(payload),
  })
  const body = await putRes.json().catch(() => ({}))
  if (!putRes.ok) {
    console.error('Upload failed:', putRes.status, body)
    process.exit(1)
  }
  console.log('Upload OK:', body.storage ?? 'cloud', body.updated_at ?? '')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
