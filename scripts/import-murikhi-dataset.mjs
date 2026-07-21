/**
 * Import Lulwa Mlih audited dataset (March 2026) into portal cloud sync.
 * Usage: SYNC_API_TOKEN=... node scripts/import-murikhi-dataset.mjs [--dry-run]
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PDFParse } from 'pdf-parse'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRY_RUN = process.argv.includes('--dry-run')
const API_URL = process.env.PORTAL_SYNC_URL ?? 'https://www.mlihrent.com/api/portal-sync'
const PDF_PATH =
  process.env.MURIKHI_PDF ??
  'c:/Users/project/Downloads/اثبات الدخل الشهري المعتمد من محمد المريخي بعد التدقيق .pdf'

const STAFF_ACCOUNTS = [
  { phone: '0553262626', pin: '1989', role: 'admin', name: 'Building Admin', staffTier: 'admin' },
  { phone: '0505001021', pin: '3004', role: 'admin', name: 'Operations Manager', staffTier: 'staff' },
]

const DEFAULT_BANK = {
  accountName: 'LULWA MLIH REAL ESTATE - SOLE PROPRIETORSHIP L.L.C.',
  bankName: 'Wio Bank',
  iban: 'AE420860000009057845637',
  accountNumber: '9057845637',
  swift: 'WIOBAEADXXX',
  bankAddress: 'Etihad Airways Centre 5th Floor, Abu Dhabi, UAE',
}

const LISTINGS = [
  {
    id: 'listing-a4',
    building: 'Building A',
    buildingNumber: 'A',
    apartment: 'A4',
    floor: 0,
    bedrooms: 1,
    bathrooms: 1,
    sizeSqm: 55,
    rentMonthly: 5417,
    currency: 'AED',
    availableFrom: 'Immediately',
    parking: false,
    highlight: 'Spacious 1BR · Ground floor · High demand unit',
    highlightAr: 'غرفة وصالة واسعة · الطابق الأرضي · وحدة مطلوبة',
  },
  {
    id: 'listing-b6',
    building: 'Building B',
    buildingNumber: 'B',
    apartment: 'B6',
    floor: 1,
    bedrooms: 0,
    bathrooms: 1,
    sizeSqm: 34,
    rentMonthly: 2833,
    currency: 'AED',
    availableFrom: 'Immediately',
    parking: false,
    highlight: 'Clean unit · Affordable rate · First floor',
    highlightAr: 'وحدة نظيفة · سعر مناسب · الطابق الأول',
  },
]

function normalizePhone(phone) {
  let digits = String(phone ?? '').replace(/\D/g, '')
  if (digits.startsWith('971') && digits.length >= 12) digits = `0${digits.slice(3)}`
  if (digits.length === 9 && digits.startsWith('5')) digits = `0${digits}`
  return digits
}

function pinFromPhone(phone, code) {
  const d = normalizePhone(phone)
  if (d.length >= 4) return d.slice(-4)
  const n = code.replace(/\D/g, '')
  return `${n}${n}`.slice(-4).padStart(4, '0')
}

function parseAmount(raw) {
  if (!raw) return 0
  const normalized = String(raw)
    .replace(/٫/g, '.')
    .replace(/،/g, '')
    .replace(/[^\d.]/g, '')
  return Math.round(parseFloat(normalized) || 0)
}

function formatLeaseDate(d) {
  const [day, month, year] = d.split('/')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${parseInt(day, 10)} ${months[parseInt(month, 10) - 1]} ${year}`
}

function formatPaidAt(dateStr) {
  const [day, month, year] = dateStr.split('/')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${parseInt(day, 10)} ${months[parseInt(month, 10) - 1]} ${year} · 12:00`
}

function rentFields(annual, py, monthly) {
  if (py >= 12) return { rentAmount: monthly, rentSchedule: 'monthly' }
  if (py === 2) return { rentAmount: Math.round(annual / 2), rentSchedule: 'semi_annual' }
  if (py === 4) return { rentAmount: Math.round(annual / 4), rentSchedule: 'quarterly' }
  if (py === 3) return { rentAmount: Math.round(annual / 3), rentSchedule: 'quarterly' }
  return { rentAmount: monthly, rentSchedule: 'monthly' }
}

function buildingLetter(code) {
  return code.charAt(0).toUpperCase()
}

function residentId(code) {
  return `apt-${code.toLowerCase()}`
}

function parseCollectionLog(text) {
  const rows = []
  const start = text.indexOf('RENT COLLECTION LOG — ALL TRANSACTIONS')
  if (start < 0) return rows

  const section = text.slice(start)
  let seq = 0
  for (const line of section.split('\n')) {
    if (!line.includes('VILLA') || !line.includes('AED')) continue
    const parts = line.split('\t').map((p) => p.trim()).filter(Boolean)
    const unitIdx = parts.findIndex((p) => /^[A-D]\d+$/i.test(p))
    if (unitIdx < 0) continue

    const unit = parts[unitIdx].toUpperCase()
    const dateStr = parts.find((p) => /^\d{2}\/\d{2}\/\d{4}$/.test(p))
    const status = parts[parts.length - 1]
    if (status === 'Pending') continue

    const aedParts = parts.filter((p) => /AED/.test(p))
    if (aedParts.length < 2) continue
    const received = parseAmount(aedParts[1])
    if (received <= 0) continue

    const tenantPart = parts.slice(unitIdx + 1).find((p) => !/^[A-Za-z]{3}-\d{2}$/.test(p) && !/AED/.test(p) && !/^VILLA/.test(p) && !/^\d{2}\/\d{2}\/\d{4}$/.test(p))
    const refPart = parts.find((p) => p.includes('-Rent') || p.includes('-RENT') || p.includes('-rent') || p.includes('Rent')) ?? `Import ${unit}`

    seq += 1
    rows.push({
      id: `pay-import-${seq}`,
      unit,
      residentId: residentId(unit),
      residentName: tenantPart?.split(/\s{2,}/)[0]?.trim() ?? unit,
      amount: received,
      confirmedAmount: received,
      status: status === 'Partial' ? 'partial' : 'settled',
      paidAt: dateStr ? formatPaidAt(dateStr) : '1 Mar 2026 · 12:00',
      paymentRef: refPart.slice(0, 80),
      method: line.includes('Cheque') ? 'bank' : 'bank',
    })
  }
  return rows
}

async function extractPdfText() {
  const buffer = await readFile(PDF_PATH)
  const parser = new PDFParse({ data: buffer })
  const result = await parser.getText()
  await parser.destroy()
  return result.text
}

function buildResidents(units, paidByUnit) {
  return units.map((u) => {
    const letter = buildingLetter(u.code)
    const { rentAmount, rentSchedule } = rentFields(u.annual, u.py, u.monthly)
    const paid = Math.min(u.annual, paidByUnit.get(u.code) ?? 0)
    const status = u.outstanding > 0 ? 'arrears' : 'active'
    return {
      id: residentId(u.code),
      name: u.name,
      phone: u.phone,
      pin: pinFromPhone(u.phone, u.code),
      building: `Building ${letter}`,
      buildingNumber: letter,
      apartment: u.code,
      floor: u.floor,
      parking: '',
      leaseEnd: formatLeaseDate(u.end),
      rentAmount,
      currency: 'AED',
      rentDueDay: 1,
      rentSchedule,
      contractTotal: u.annual,
      amountPaid: paid,
      status,
    }
  })
}

function buildAccounts(residents) {
  const residentAccounts = residents
    .filter((r) => normalizePhone(r.phone))
    .map((r) => ({
      phone: normalizePhone(r.phone),
      pin: r.pin,
      role: 'resident',
      name: r.name,
      residentId: r.id,
    }))
  return [...residentAccounts, ...STAFF_ACCOUNTS]
}

function buildPayments(parsedRows, residentsByUnit) {
  return parsedRows.map((row) => {
    const resident = residentsByUnit.get(row.unit)
    return {
      id: row.id,
      invoiceId: `INV-${row.unit}-${row.id}`,
      residentId: row.residentId,
      residentName: resident?.name ?? row.residentName,
      unit: row.unit,
      amount: row.amount,
      confirmedAmount: row.confirmedAmount,
      method: row.method,
      status: row.status,
      paidAt: row.paidAt,
      destination: 'Wio Bank',
      paymentRef: row.paymentRef,
      reviewedAt: row.paidAt,
      reviewNote: 'Imported from Murikhi audit PDF Mar 2026',
    }
  })
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

  const units = JSON.parse(await readFile(join(__dirname, 'murikhi-units.json'), 'utf8'))
  console.log('Extracting PDF payment log…')
  const pdfText = await extractPdfText()
  const parsedRows = parseCollectionLog(pdfText)
  console.log(`Parsed ${parsedRows.length} paid/partial transactions`)

  const paidByUnit = new Map()
  for (const row of parsedRows) {
    paidByUnit.set(row.unit, (paidByUnit.get(row.unit) ?? 0) + row.amount)
  }

  const residentList = buildResidents(units, paidByUnit)
  const residentsByUnit = new Map(residentList.map((r) => [r.apartment, r]))
  const payments = buildPayments(parsedRows, residentsByUnit)
  const accounts = buildAccounts(residentList)

  const ops = {
    residentList,
    listings: LISTINGS,
    payments,
    invoiceMap: {},
    ticketMap: {},
    invoiceExtensions: {},
    paidIds: [],
    bankSettings: DEFAULT_BANK,
    serviceDirectory: [],
  }

  const payload = { accounts, ops }
  console.log(`Residents: ${residentList.length}, Accounts: ${accounts.length}, Payments: ${payments.length}`)
  console.log(`Total collected (imported): ${payments.reduce((s, p) => s + p.confirmedAmount, 0).toLocaleString()} AED`)
  console.log(`Expected monthly rent roll: ${residentList.reduce((s, r) => {
    if (r.rentSchedule === 'monthly') return s + r.rentAmount
    if (r.rentSchedule === 'quarterly') return s + r.rentAmount / 3
    if (r.rentSchedule === 'semi_annual') return s + r.rentAmount / 6
    return s + r.rentAmount / 12
  }, 0).toLocaleString()} AED (approx)`)

  if (DRY_RUN) {
    await writeFile(join(__dirname, 'murikhi-import-preview.json'), JSON.stringify(payload, null, 2))
    console.log('Dry run — wrote scripts/murikhi-import-preview.json')
    return
  }

  const res = await fetch(API_URL, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error('Upload failed:', res.status, body)
    process.exit(1)
  }
  console.log('Upload OK:', body.storage ?? 'cloud', body.updated_at ?? '')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
