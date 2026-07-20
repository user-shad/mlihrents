export type Role = 'resident' | 'admin'

export type TicketStatus = 'open' | 'in_progress' | 'resolved'

export type RentSchedule =
  | 'monthly'
  | 'quarterly'
  | 'semi_annual'
  | 'annual'
  | 'full_lease'

export interface Resident {
  id: string
  name: string
  phone: string
  /** 4-digit login password set by admin */
  pin: string
  building: string
  buildingNumber: string
  apartment: string
  floor: number
  parking: string
  leaseEnd: string
  /** Amount due each installment period */
  rentAmount: number
  currency: string
  /** Day of month rent is due (1–28). Admin can change anytime. */
  rentDueDay: number
  /** How often rent is collected */
  rentSchedule: RentSchedule
  /** Full rent obligation for the current lease term */
  contractTotal: number
  /** How much of contractTotal has already been paid */
  amountPaid: number
  email?: string
  moveIn?: string
  occupants?: number
  status?: 'active' | 'arrears' | 'notice'
}

/** Empty resident template used before session / selection is resolved */
export const blankResident: Resident = {
  id: '',
  name: '',
  phone: '',
  pin: '',
  building: '',
  buildingNumber: '',
  apartment: '',
  floor: 0,
  parking: '',
  leaseEnd: '',
  rentAmount: 0,
  currency: 'AED',
  rentDueDay: 1,
  rentSchedule: 'monthly',
  contractTotal: 0,
  amountPaid: 0,
  status: 'active',
}

/** Digits only for phone comparison (0545882666 and +971 54 588 2666 match). */
export function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('971') && digits.length >= 12) {
    return `0${digits.slice(3)}`
  }
  return digits
}

export function isValidPin(pin: string) {
  return /^\d{4}$/.test(pin)
}

export interface Invoice {
  id: string
  period: string
  amount: number
  dueDate: string
  /** ISO date YYYY-MM-DD for overdue / extension logic */
  dueDateIso?: string
  status: 'paid' | 'due' | 'overdue'
  /** Extra days granted after the original due date */
  extensionDays?: number
}

export interface Ticket {
  id: string
  title: string
  category: string
  status: TicketStatus
  created: string
  note: string
}

export interface Announcement {
  id: string
  title: string
  body: string
  date: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'ai' | 'agent' | 'system'
  text: string
  time: string
  contactPhone?: string
  contactLabel?: string
}

export type PaymentMethod = 'card' | 'apple_pay' | 'bank'

export type PaymentStatus = 'pending_review' | 'settled' | 'rejected' | 'partial'

export interface PaymentRecord {
  id: string
  invoiceId: string
  residentId: string
  residentName: string
  unit: string
  /** Invoice / expected amount */
  amount: number
  method: PaymentMethod
  status: PaymentStatus
  paidAt: string
  destination: string
  /** Unique code resident must put in the bank transfer note */
  paymentRef?: string
  /** Amount admin verified on the bank statement */
  confirmedAmount?: number
  reviewedAt?: string
  reviewNote?: string
  /** Screenshot attached for bank transfer payments */
  transferProof?: { name: string; dataUrl: string }
}

/** Payment reference for bank transfers — the invoice number itself. */
export function buildPaymentRef(_unit: string, invoiceId: string) {
  return invoiceId.trim()
}

export type PaymentLookupMatch =
  | 'pending_review'
  | 'settled'
  | 'partial'
  | 'rejected'
  | 'invoice_unpaid'
  | 'invoice_paid'
  | 'not_found'

export interface PaymentLookupResult {
  ref: string
  match: PaymentLookupMatch
  payment?: PaymentRecord
  invoice?: Invoice
  resident?: Resident
  allPaymentsForRef: PaymentRecord[]
}

function normalizeRef(ref: string) {
  return ref.trim().toUpperCase()
}

/** Extract invoice reference from admin text (e.g. INV-TEST-A1). */
export function extractInvoiceReference(input: string): string | null {
  const inv = input.match(/\b(INV-[A-Z0-9-]+)\b/i)
  if (inv) return inv[1]
  const pay = input.match(/\b(PAY-\d+)\b/i)
  if (pay) return pay[1]
  return null
}

/** Extract bank reference number from admin text (e.g. Wio "Reference number" 1422869093). */
export function extractBankReference(input: string): string | null {
  const labeled = input.match(
    /(?:reference|ref(?:erence)?|bank\s*ref|رقم(?:\s*ال)?مرجع)[:\s#-]*(\d{6,15})/i,
  )
  if (labeled) return labeled[1]

  if (/(?:compare|match|verify|check|قارن|تحقق|مطابقة|مرجع)/i.test(input)) {
    const digits = input.match(/\b(\d{6,15})\b/)
    if (digits) return digits[1]
  }

  return null
}

/** @deprecated Use extractInvoiceReference or extractBankReference */
export function extractPaymentReference(input: string): string | null {
  return extractInvoiceReference(input) ?? extractBankReference(input)
}

/** Extract an AED amount from admin inquiry text. */
export function extractInquiryAmount(input: string): number | null {
  const q = input.toLowerCase()
  const patterns = [
    /(?:amount|aed|درهم|مبلغ)\s*[:=]?\s*(\d+(?:\.\d{1,2})?)/i,
    /(\d+(?:\.\d{1,2})?)\s*(?:aed|درهم)/i,
  ]
  for (const pattern of patterns) {
    const m = q.match(pattern)
    if (m) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  return null
}

export function lookupPaymentRef(
  ref: string,
  payments: PaymentRecord[],
  invoiceMap: Record<string, Invoice[]>,
  residentList: Resident[],
  paidIds: string[],
): PaymentLookupResult {
  const key = normalizeRef(ref)
  const allPaymentsForRef = payments
    .filter((p) => normalizeRef(p.paymentRef ?? '') === key || normalizeRef(p.invoiceId) === key)
    .sort((a, b) => b.id.localeCompare(a.id))

  let invoice: Invoice | undefined
  let resident: Resident | undefined
  for (const r of residentList) {
    const inv = (invoiceMap[r.id] ?? []).find((i) => normalizeRef(i.id) === key)
    if (inv) {
      invoice = inv
      resident = r
      break
    }
  }

  const payment = allPaymentsForRef[0]
  if (!resident && payment) {
    resident = residentList.find((r) => r.id === payment.residentId)
  }

  let match: PaymentLookupMatch
  if (payment) {
    match = payment.status
  } else if (invoice) {
    match = paidIds.includes(invoice.id) ? 'invoice_paid' : 'invoice_unpaid'
  } else {
    match = 'not_found'
  }

  return { ref: ref.trim(), match, payment, invoice, resident, allPaymentsForRef }
}

export interface StaffAiContext {
  payments: PaymentRecord[]
  pendingPayments: PaymentRecord[]
  invoiceMap: Record<string, Invoice[]>
  residentList: Resident[]
  paidIds: string[]
}

function formatLookupReply(
  lookup: PaymentLookupResult,
  statedAmount: number | null,
  lang: 'en' | 'ar',
): string {
  const ar = lang === 'ar'
  const { ref, match, payment, invoice, resident, allPaymentsForRef } = lookup
  const lines: string[] = []

  lines.push(ar ? `المرجع: ${ref}` : `Reference: ${ref}`)
  lines.push('')

  if (match === 'not_found') {
    lines.push(
      ar
        ? '❌ لم أجد فاتورة أو دفعة بهذا الرقم. تأكد من رقم الفاتورة (مثل INV-TEST-A1) كما يظهر في وصف التحويل البنكي.'
        : '❌ No invoice or payment found for this reference. Check the invoice number (e.g. INV-TEST-A1) as it appears in the bank transfer description.',
    )
    return lines.join('\n')
  }

  const tenantLine =
    resident &&
    (ar
      ? `الساكن: ${resident.name || '—'} · ${resident.buildingNumber ? `${resident.buildingNumber}-` : ''}${resident.apartment}`
      : `Tenant: ${resident.name || '—'} · ${resident.buildingNumber ? `${resident.buildingNumber}-` : ''}${resident.apartment}`)

  switch (match) {
    case 'pending_review':
      lines.push(ar ? '⏳ الحالة: قيد المراجعة — لم تُؤكَّد بعد' : '⏳ Status: Pending review — not confirmed yet')
      if (tenantLine) lines.push(tenantLine)
      if (payment) {
        lines.push(
          ar
            ? `مبلغ الفاتورة: ${formatMoney(payment.amount)}`
            : `Invoice amount: ${formatMoney(payment.amount)}`,
        )
        lines.push(ar ? `تاريخ الإرسال: ${payment.paidAt}` : `Submitted: ${payment.paidAt}`)
        lines.push(ar ? `رقم الدفعة: ${payment.id}` : `Payment ID: ${payment.id}`)
        if (payment.transferProof) {
          lines.push(
            ar
              ? '✓ يوجد لقطة شاشة — سأقرأها تلقائياً للمقارنة.'
              : '✓ Transfer screenshot attached — scanning automatically for comparison.',
          )
        } else {
          lines.push(
            ar
              ? '⚠️ لا توجد لقطة تحويل — لا يمكن المسح التلقائي.'
              : '⚠️ No transfer screenshot — auto-scan not available.',
          )
        }
      }
      lines.push(
        ar
          ? '\nطابق هذا الرقم على كشف الحساب البنكي، ثم أكّد أو ارفض من قائمة «المدفوعات للتحقق».'
          : '\nMatch this reference on the bank statement, then confirm or reject in the verification queue below.',
      )
      break

    case 'settled':
      lines.push(ar ? '✅ الحالة: مدفوعة ومؤكدة' : '✅ Status: Paid and confirmed')
      if (tenantLine) lines.push(tenantLine)
      if (payment) {
        lines.push(
          ar
            ? `المبلغ المؤكد: ${formatMoney(payment.confirmedAmount ?? payment.amount)}`
            : `Verified amount: ${formatMoney(payment.confirmedAmount ?? payment.amount)}`,
        )
        lines.push(ar ? `تاريخ التأكيد: ${payment.reviewedAt ?? payment.paidAt}` : `Settled: ${payment.reviewedAt ?? payment.paidAt}`)
      } else if (invoice) {
        lines.push(
          ar ? `مبلغ الفاتورة: ${formatMoney(invoice.amount)}` : `Invoice amount: ${formatMoney(invoice.amount)}`,
        )
      }
      break

    case 'partial':
      lines.push(ar ? '⚠️ الحالة: دفعة جزئية مؤكدة' : '⚠️ Status: Partial payment confirmed')
      if (tenantLine) lines.push(tenantLine)
      if (payment) {
        lines.push(
          ar
            ? `المبلغ المتوقع: ${formatMoney(payment.amount)} · المؤكد: ${formatMoney(payment.confirmedAmount ?? payment.amount)}`
            : `Expected: ${formatMoney(payment.amount)} · Verified: ${formatMoney(payment.confirmedAmount ?? payment.amount)}`,
        )
        lines.push(
          ar ? 'الفاتورة قد تظل غير مسددة بالكامل — راجع خطة الإيجار.' : 'Invoice may still be open — check the rent plan.',
        )
      }
      break

    case 'rejected':
      lines.push(ar ? '❌ الحالة: مرفوضة — الفاتورة ما زالت غير مدفوعة' : '❌ Status: Rejected — invoice still unpaid')
      if (tenantLine) lines.push(tenantLine)
      if (payment?.reviewNote) {
        lines.push(ar ? `ملاحظة: ${payment.reviewNote}` : `Note: ${payment.reviewNote}`)
      }
      if (allPaymentsForRef.length > 1) {
        lines.push(
          ar
            ? `(${allPaymentsForRef.length} محاولات دفع مسجلة لهذا المرجع)`
            : `(${allPaymentsForRef.length} payment attempts on file for this reference)`,
        )
      }
      break

    case 'invoice_unpaid':
      lines.push(
        ar
          ? '❌ غير مدفوعة — لم يُرسل إثبات تحويل بعد'
          : '❌ Not paid — no transfer proof submitted yet',
      )
      if (tenantLine) lines.push(tenantLine)
      if (invoice) {
        lines.push(
          ar
            ? `الفاتورة: ${invoice.period} · ${formatMoney(invoice.amount)} · مستحق ${invoice.dueDate}`
            : `Invoice: ${invoice.period} · ${formatMoney(invoice.amount)} · due ${invoice.dueDate}`,
        )
        lines.push(
          ar
            ? 'بانتظار أن يرسل الساكن لقطة التحويل من بوابة الدفع.'
            : 'Waiting for the resident to submit transfer proof from the Pay tab.',
        )
      }
      break

    case 'invoice_paid':
      lines.push(ar ? '✅ الحالة: الفاتورة مدفوعة' : '✅ Status: Invoice marked paid')
      if (tenantLine) lines.push(tenantLine)
      if (invoice) {
        lines.push(
          ar
            ? `الفاتورة: ${invoice.period} · ${formatMoney(invoice.amount)}`
            : `Invoice: ${invoice.period} · ${formatMoney(invoice.amount)}`,
        )
      }
      break
  }

  const expected =
    payment?.amount ?? invoice?.amount ?? (payment?.confirmedAmount != null ? payment.confirmedAmount : null)
  if (statedAmount != null && expected != null) {
    lines.push('')
    if (amountsMatch(statedAmount, expected)) {
      lines.push(
        ar
          ? `✓ المبلغ المذكور (${formatMoney(statedAmount)}) يطابق الفاتورة — يمكنك التأكيد.`
          : `✓ Stated amount (${formatMoney(statedAmount)}) matches the invoice — safe to confirm.`,
      )
    } else if (statedAmount < expected) {
      lines.push(
        ar
          ? `⚠️ المبلغ المذكور (${formatMoney(statedAmount)}) أقل من الفاتورة (${formatMoney(expected)}) — فكّر في «تأكيد جزئي».`
          : `⚠️ Stated amount (${formatMoney(statedAmount)}) is less than the invoice (${formatMoney(expected)}) — consider “Confirm as partial”.`,
      )
    } else {
      lines.push(
        ar
          ? `⚠️ المبلغ المذكور (${formatMoney(statedAmount)}) أعلى من الفاتورة (${formatMoney(expected)}) — راجع قبل التأكيد.`
          : `⚠️ Stated amount (${formatMoney(statedAmount)}) exceeds the invoice (${formatMoney(expected)}) — review before confirming.`,
      )
    }
  }

  return lines.join('\n')
}

/** Staff-side AI for payment verification and reference lookup */
export function staffAiReply(input: string, lang: 'en' | 'ar', ctx: StaffAiContext): string {
  const q = input.toLowerCase().trim()
  const ar = lang === 'ar'

  const invoiceRef = extractInvoiceReference(input)
  const bankRef = extractBankReference(input)
  const statedAmount = extractInquiryAmount(input)

  if (invoiceRef) {
    const lookup = lookupPaymentRef(invoiceRef, ctx.payments, ctx.invoiceMap, ctx.residentList, ctx.paidIds)
    return formatLookupReply(lookup, statedAmount, lang)
  }

  if (bankRef) {
    const withProof = ctx.pendingPayments.filter((p) => p.transferProof)
    if (withProof.length === 0) {
      return ar
        ? `لا توجد لقطات تحويل معلقة للمقارنة مع المرجع ${bankRef}.`
        : `No pending transfer screenshots to compare against reference ${bankRef}.`
    }
    return ar
      ? `سأقرأ حقل «Reference number» في ${withProof.length} لقطة(ات) وأقارنه بالمرجع ${bankRef}.`
      : `I'll read the “Reference number” field from ${withProof.length} screenshot(s) and compare to ${bankRef}.`
  }

  if (/pending|waiting|verify|queue|review|قيد|معلق|تحقق|انتظار/.test(q)) {
    if (ctx.pendingPayments.length === 0) {
      return ar ? '✓ لا توجد تحويلات بانتظار التحقق.' : '✓ No bank transfers waiting for verification.'
    }
    const header = ar
      ? `${ctx.pendingPayments.length} تحويل(ات) بانتظار التحقق:\n`
      : `${ctx.pendingPayments.length} transfer(s) pending verification:\n`
    const rows = ctx.pendingPayments
      .map((p, i) => {
        const refCode = p.paymentRef ?? p.invoiceId
        return ar
          ? `${i + 1}. ${refCode} · ${p.residentName} · ${formatMoney(p.amount)}`
          : `${i + 1}. ${refCode} · ${p.residentName} · ${formatMoney(p.amount)}`
      })
      .join('\n')
    return `${header}\n${rows}\n\n${ar ? 'اسأل عن مرجع محدد للتفاصيل، مثل: تحقق من INV-TEST-A1' : 'Ask about a specific reference for details, e.g. “Check INV-TEST-A1”.'}`
  }

  if (/how many|count|عدد|كم/.test(q) && /pending|waiting|قيد|معلق/.test(q)) {
    const n = ctx.pendingPayments.length
    return ar
      ? `هناك ${n} تحويل(ات) بانتظار التحقق.`
      : `There ${n === 1 ? 'is' : 'are'} ${n} transfer(s) pending verification.`
  }

  if (/reference|ref|invoice number|رقم|مرجع|فاتورة/.test(q) && /how|what|work|كيف|ما/.test(q)) {
    return ar
      ? 'في لقطة التحويل (مثل Wio Bank)، ابحث عن حقل «Reference number» — هذا هو رقم المرجع البنكي.\n\nأدخل الرقم من كشف حسابك للمقارنة:\n«قارن المرجع 1422869093»'
      : 'On the transfer screenshot (e.g. Wio Bank), find the “Reference number” field — that is the bank reference.\n\nEnter the number from your statement to compare:\n“Compare reference 1422869093”'
  }

  if (/arrears|overdue|late|متأخر|متأخرات|مستحق/.test(q)) {
    const overdueResidents = ctx.residentList.filter((r) => r.status === 'arrears')
    if (overdueResidents.length === 0) {
      return ar ? 'لا يوجد سكان بحالة «متأخرات» حالياً.' : 'No residents currently marked in arrears.'
    }
    const rows = overdueResidents
      .map((r) => `• ${r.name || '—'} · ${r.buildingNumber ? `${r.buildingNumber}-` : ''}${r.apartment}`)
      .join('\n')
    return ar ? `وحدات متأخرة:\n\n${rows}` : `Units in arrears:\n\n${rows}`
  }

  if (/help|what can|ماذا|مساعدة/.test(q)) {
    return ar
      ? 'يمكنني:\n• مقارنة رقم المرجع البنكي مع اللقطة (مثل 1422869093)\n• التحقق من حالة فاتورة (INV-…)\n• عرض المدفوعات قيد المراجعة\n\nمثال: «قارن المرجع 1422869093»'
      : 'I can:\n• Compare a bank reference number to the screenshot (e.g. 1422869093)\n• Check invoice status (INV-…)\n• List pending verifications\n\nExample: “Compare reference 1422869093”'
  }

  return ar
    ? 'أدخل رقم المرجع من كشف الحساب للمقارنة مع اللقطة، مثل: «قارن المرجع 1422869093». أو «المدفوعات المعلقة» لعرض القائمة.'
    : 'Enter the reference from your bank statement to compare with the screenshot, e.g. “Compare reference 1422869093”. Or say “pending payments”.'
}

export function staffWelcomeMessage(lang: 'en' | 'ar'): string {
  return lang === 'ar'
    ? 'أقارن رقم المرجع الذي تدخله مع حقل «Reference number» في لقطة التحويل. مثل: «قارن المرجع 1422869093».'
    : 'I compare the reference you enter with the “Reference number” field on the transfer screenshot. E.g. “Compare reference 1422869093”.'
}

/** Payments whose transfer proof should be OCR-scanned for this staff query. */
export function resolveStaffOcrTargets(input: string, ctx: StaffAiContext): PaymentRecord[] {
  const q = input.toLowerCase().trim()
  const invoiceRef = extractInvoiceReference(input)
  const bankRef = extractBankReference(input)

  if (invoiceRef) {
    const lookup = lookupPaymentRef(invoiceRef, ctx.payments, ctx.invoiceMap, ctx.residentList, ctx.paidIds)
    if (lookup.payment?.transferProof) return [lookup.payment]
  }

  if (bankRef) {
    return ctx.pendingPayments.filter((p) => p.transferProof).slice(0, 5)
  }

  if (/pending|waiting|verify|scan|screenshot|proof|compare|match|لقطة|صورة|مسح|قارن|مقارنة/.test(q)) {
    return ctx.pendingPayments.filter((p) => p.transferProof).slice(0, 5)
  }

  return []
}

export function amountsMatch(a: number, b: number, tolerance = 0.009) {
  return Math.abs(a - b) <= tolerance
}

export interface ServiceContact {
  id: string
  role: string
  name: string
  phone: string
  category: string
  keywords: string[]
  hours: string
  notes: string
}

export interface AvailableApartment {
  id: string
  building: string
  buildingNumber: string
  apartment: string
  floor: number
  bedrooms: number
  bathrooms: number
  sizeSqm: number
  rentMonthly: number
  currency: string
  availableFrom: string
  parking: boolean
  highlight: string
  highlightAr: string
  /** Optional listing photo (data URL or remote URL) */
  photoDataUrl?: string
}

/** Empty seed — add units from Admin → Available */
export const availableApartments: AvailableApartment[] = []

/** Building inventory: A0–A12, B1–B8, C1–C7, D1–D8 (36 units). */
export const BUILDING_INVENTORY = [
  { letter: 'A', start: 0, count: 13 },
  { letter: 'B', start: 1, count: 8 },
  { letter: 'C', start: 1, count: 7 },
  { letter: 'D', start: 1, count: 8 },
] as const

export const TOTAL_UNIT_COUNT = BUILDING_INVENTORY.reduce((sum, b) => sum + b.count, 0)

/** Build an empty apartment slot for admin to fill in later. */
export function buildEmptyApartment(buildingLetter: string, unitNumber: number): Resident {
  const letter = buildingLetter.trim().toUpperCase()
  const code = `${letter}${unitNumber}`
  return {
    id: `apt-${code.toLowerCase()}`,
    name: '',
    phone: '',
    pin: '',
    building: `Building ${letter}`,
    buildingNumber: letter,
    apartment: code,
    floor: 0,
    parking: '',
    leaseEnd: '',
    rentAmount: 0,
    currency: 'AED',
    rentDueDay: 1,
    rentSchedule: 'monthly',
    contractTotal: 0,
    amountPaid: 0,
    status: 'active',
  }
}

function generateApartmentUnits(): Resident[] {
  const units: Resident[] = []
  for (const building of BUILDING_INVENTORY) {
    for (let i = 0; i < building.count; i++) {
      const unitNumber = building.start + i
      const code = `${building.letter}${unitNumber}`
      if (code === 'A1') {
        units.push({ ...sampleA1TestTenant })
      } else {
        units.push(buildEmptyApartment(building.letter, unitNumber))
      }
    }
  }
  return units
}

/** Fixed unit inventory across buildings A–D. */
export const sampleA1TestTenant: Resident = {
  id: 'apt-a1',
  name: 'Test Tenant A1',
  phone: '0501234567',
  pin: '1111',
  building: 'Building A',
  buildingNumber: 'A',
  apartment: 'A1',
  floor: 1,
  parking: 'P-A1',
  leaseEnd: '31 Dec 2026',
  rentAmount: 10,
  currency: 'AED',
  rentDueDay: 20,
  rentSchedule: 'monthly',
  contractTotal: 10,
  amountPaid: 0,
  email: 'a1-test@mlihrents.ae',
  moveIn: '1 Jul 2026',
  occupants: 1,
  status: 'active',
}

export const testInvoiceA1: Invoice = {
  id: 'INV-TEST-A1',
  period: 'Test payment · A1',
  amount: 10,
  dueDate: '20 Jul 2026',
  dueDateIso: '2026-07-20',
  status: 'due',
}

export const apartmentUnits: Resident[] = generateApartmentUnits()

export const demoResident = sampleA1TestTenant

/** Seed apartment records for admin operations */
export const residents: Resident[] = [...apartmentUnits]

export function apartmentSortKey(apartment: string) {
  const match = apartment.trim().match(/^([A-D])(\d+)$/i)
  if (!match) return 9999
  const letter = match[1].toUpperCase()
  const num = Number(match[2])
  const letterOrder: Record<string, number> = { A: 0, B: 100, C: 200, D: 300 }
  return (letterOrder[letter] ?? 900) + num
}

export function unitCodeLabel(r: Resident) {
  const apt = r.apartment?.trim()
  if (apt && /^[A-D]\d+$/i.test(apt)) return apt.toUpperCase()
  const bld = r.buildingNumber?.trim()
  if (bld && apt) return `${bld}-${apt}`
  return apt || bld || '—'
}

export function buildingLabel(letter: string, lang: 'en' | 'ar' = 'en') {
  const l = letter.trim().toUpperCase()
  return lang === 'ar' ? `المبنى ${l}` : `Building ${l}`
}

export function apartmentBuildingLetter(apartment: string) {
  const match = apartment.trim().match(/^([A-D])/i)
  return match ? match[1].toUpperCase() : ''
}

export function apartmentDisplayTitle(r: Resident, lang: 'en' | 'ar' = 'en') {
  if (r.name.trim()) return r.name.trim()
  const apt = r.apartment?.trim()
  if (!apt) return lang === 'ar' ? 'شقة شاغرة' : 'Vacant apartment'
  return lang === 'ar' ? `شقة ${apt}` : `Apartment ${apt}`
}

/**
 * Bootstrap staff logins.
 * Admin 1: `0500000000` · PIN `1234`
 * Admin 2: `0501111111` · PIN `5678`
 */
export const staffAccounts = [
  { phone: '0500000000', pin: '1234', name: 'Building Admin' },
  { phone: '0501111111', pin: '5678', name: 'Operations Manager' },
]

export const invoices: Invoice[] = []

export const invoicesByResident: Record<string, Invoice[]> = {
  'apt-a1': [testInvoiceA1],
}

export const initialTickets: Ticket[] = []

export const ticketsByResident: Record<string, Ticket[]> = {}

export const announcements: Announcement[] = []

export const adminStats = {
  units: TOTAL_UNIT_COUNT,
  occupied: 0,
  arrears: 0,
  openTickets: 0,
  chatQueue: 0,
  accountBalance: 0,
}

export const seedPayments: PaymentRecord[] = []

export function paymentMethodLabel(method: PaymentMethod) {
  switch (method) {
    case 'apple_pay':
      return 'Apple Pay'
    case 'card':
      return 'Card'
    case 'bank':
      return 'Bank transfer'
  }
}

/** Template service contacts — edit names/numbers for your building */
export const serviceDirectory: ServiceContact[] = [
  {
    id: 'c-ac',
    role: 'AC technician',
    name: 'AC contractor',
    phone: '+971 50 000 0001',
    category: 'HVAC',
    keywords: [
      'ac',
      'a/c',
      'air con',
      'aircon',
      'hvac',
      'cooling',
      'heating',
      'thermostat',
      'مكيف',
      'تكييف',
      'التكييف',
      'مكيّف',
    ],
    hours: '8 AM – 8 PM',
    notes: 'Building-approved AC contractor',
  },
  {
    id: 'c-plumb',
    role: 'Plumber',
    name: 'Plumbing contractor',
    phone: '+971 50 000 0002',
    category: 'Plumbing',
    keywords: [
      'plumb',
      'leak',
      'faucet',
      'water',
      'drain',
      'toilet',
      'pipe',
      'heater',
      'سباكة',
      'تسريب',
      'مياه',
      'صنبور',
      'مجاري',
    ],
    hours: '7 AM – 9 PM',
    notes: 'For leaks and blocked drains',
  },
  {
    id: 'c-elec',
    role: 'Electrician',
    name: 'Electrical contractor',
    phone: '+971 50 000 0003',
    category: 'Electrical',
    keywords: [
      'electric',
      'power',
      'outlet',
      'light',
      'breaker',
      'wiring',
      'كهرباء',
      'كهربائي',
      'إنارة',
      'فيش',
    ],
    hours: '8 AM – 6 PM',
    notes: 'For power and lighting issues',
  },
  {
    id: 'c-security',
    role: 'Building security',
    name: 'Building security desk',
    phone: '+971 50 000 0004',
    category: 'Security',
    keywords: [
      'security',
      'lockout',
      'noise',
      'emergency',
      'gate',
      'lobby',
      'أمن',
      'حراسة',
      'طوارئ',
      'بوابة',
    ],
    hours: '24 / 7',
    notes: 'Lobby desk — lockouts, access, emergencies',
  },
  {
    id: 'c-manager',
    role: 'Building manager',
    name: 'Building manager',
    phone: '+971 50 000 0005',
    category: 'Management',
    keywords: ['manager', 'lease', 'complaint', 'management', 'مدير', 'عقد', 'شكوى'],
    hours: '9 AM – 6 PM · Sun–Thu',
    notes: 'Lease, complaints, and escalations',
  },
]

export function findServiceContact(input: string): ServiceContact | undefined {
  const q = input.toLowerCase()
  return serviceDirectory.find((c) => c.keywords.some((k) => q.includes(k)))
}

export const arrearsList: { unit: string; name: string; amount: number; days: number }[] = []

export function formatMoney(amount: number, currency = 'AED') {
  return `${currency} ${amount.toLocaleString()}`
}

export function remainingBalance(resident: Resident) {
  return Math.max(0, resident.contractTotal - resident.amountPaid)
}

export function paidPercent(resident: Resident) {
  if (resident.contractTotal <= 0) return 0
  return Math.min(100, Math.round((resident.amountPaid / resident.contractTotal) * 100))
}

export function rentScheduleLabel(schedule: RentSchedule, lang: 'en' | 'ar' = 'en') {
  const en: Record<RentSchedule, string> = {
    monthly: 'Monthly',
    quarterly: 'Every 3 months',
    semi_annual: 'Every 6 months',
    annual: 'Once a year',
    full_lease: 'Paid in full (lease)',
  }
  const ar: Record<RentSchedule, string> = {
    monthly: 'شهري',
    quarterly: 'كل 3 أشهر',
    semi_annual: 'كل 6 أشهر',
    annual: 'مرة في السنة',
    full_lease: 'دفع كامل للعقد',
  }
  return lang === 'ar' ? ar[schedule] : en[schedule]
}

/** Suggested installment count / amount when admin changes schedule */
export function suggestInstallment(contractTotal: number, schedule: RentSchedule) {
  const parts: Record<RentSchedule, number> = {
    monthly: 12,
    quarterly: 4,
    semi_annual: 2,
    annual: 1,
    full_lease: 1,
  }
  const n = parts[schedule]
  return Math.round(contractTotal / n)
}

export function nowLabel() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** Format a due date label from day-of-month for the current invoice period. */
export function formatDueDateFromDay(day: number, monthLabel = 'Jul 2026', lang: 'en' | 'ar' = 'en') {
  const safe = Math.min(28, Math.max(1, Math.round(day)))
  if (lang === 'ar') {
    const monthAr = monthLabel.includes('Jul')
      ? 'يوليو 2026'
      : monthLabel.includes('Jun')
        ? 'يونيو 2026'
        : monthLabel.includes('May')
          ? 'مايو 2026'
          : monthLabel
    return `${safe} ${monthAr}`
  }
  return `${safe} ${monthLabel}`
}

export function dueDayToIso(day: number, monthLabel = 'Jul 2026') {
  const safe = Math.min(28, Math.max(1, Math.round(day)))
  const year = 2026
  const month = monthLabel.includes('Jun')
    ? 6
    : monthLabel.includes('May')
      ? 5
      : monthLabel.includes('Aug')
        ? 8
        : 7
  return `${year}-${String(month).padStart(2, '0')}-${String(safe).padStart(2, '0')}`
}

export function addDaysToIso(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function formatIsoDueDate(iso: string, lang: 'en' | 'ar' = 'en') {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  if (lang === 'ar') {
    return d.toLocaleDateString('ar-AE', { day: 'numeric', month: 'long', year: 'numeric' })
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function isPastDue(iso?: string, today = new Date()) {
  if (!iso) return false
  const due = new Date(`${iso}T23:59:59`)
  return !Number.isNaN(due.getTime()) && due.getTime() < today.getTime()
}

export function applyDueDayToInvoices(list: Invoice[], dueDay: number, lang: 'en' | 'ar' = 'en'): Invoice[] {
  return list.map((inv) => {
    if (inv.status === 'paid') return inv
    const month =
      inv.period.includes('July') || inv.period.includes('Jul')
        ? 'Jul 2026'
        : inv.period.includes('June') || inv.period.includes('Jun')
          ? 'Jun 2026'
          : inv.period.includes('May')
            ? 'May 2026'
            : 'Jul 2026'
    const extensionDays = inv.extensionDays ?? 0
    const effectiveIso = addDaysToIso(dueDayToIso(dueDay, month), extensionDays)
    const overdue = isPastDue(effectiveIso)
    return {
      ...inv,
      dueDateIso: effectiveIso,
      dueDate: formatIsoDueDate(effectiveIso, lang),
      status: overdue ? ('overdue' as const) : ('due' as const),
      extensionDays,
    }
  })
}

export function buildPaymentDueAnnouncements(
  invoices: Invoice[],
  lang: 'en' | 'ar' = 'en',
): Announcement[] {
  return invoices
    .filter((inv) => inv.status === 'due' || inv.status === 'overdue')
    .map((inv) => {
      const overdue = inv.status === 'overdue'
      if (lang === 'ar') {
        return {
          id: `pay-${inv.id}`,
          title: overdue ? 'تجاوز تاريخ استحقاق الإيجار' : 'تذكير بموعد دفع الإيجار',
          body: overdue
            ? `فاتورة ${inv.period} بمبلغ ${inv.amount.toLocaleString()} درهم كانت مستحقة في ${inv.dueDate}. يمكنك طلب تمديد من تبويب الدفع.`
            : `إيجار ${inv.period} بمبلغ ${inv.amount.toLocaleString()} درهم مستحق في ${inv.dueDate}. ادفع من تبويب الدفع.`,
          date: inv.dueDate,
        }
      }
      return {
        id: `pay-${inv.id}`,
        title: overdue ? 'Rent payment overdue' : 'Rent payment due',
        body: overdue
          ? `Your ${inv.period} invoice of AED ${inv.amount.toLocaleString()} was due on ${inv.dueDate}. You can request an extension from the Pay tab.`
          : `Your ${inv.period} rent of AED ${inv.amount.toLocaleString()} is due on ${inv.dueDate}. Pay from the Pay tab.`,
        date: inv.dueDate,
      }
    })
}

/** AI replies keyed by simple intent matching */
export function aiReply(
  input: string,
  lang: 'en' | 'ar' = 'en',
): {
  text: string
  escalate?: boolean
  contact?: ServiceContact
} {
  const q = input.toLowerCase()
  const contact = findServiceContact(q)
  const ar = lang === 'ar'

  if (/rent|pay|invoice|due|إيجار|الايجار|ادفع|فاتورة|مستحق/.test(q)) {
    return {
      text: ar
        ? 'يمكنك مراجعة فواتيرك والدفع عبر التحويل البنكي إلى حساب المبنى — أرفق إثبات التحويل بعد الدفع.'
        : 'You can review invoices and pay by bank transfer to the building account — attach your transfer proof after paying.',
    }
  }

  if (
    contact &&
    /ac|a\/c|air ?con|hvac|cool|heat|plumb|leak|faucet|drain|toilet|electric|power|outlet|light|security|lockout|noise|emergency|مكيف|تكييف|سباكة|تسريب|كهرباء|أمن|حراسة|طوارئ/.test(
      q,
    )
  ) {
    return {
      text: ar
        ? `لمشاكل ${contact.category} في وحدتك، اتصل مباشرة بـ${contact.role} المعتمد:\n\n${contact.name}\n${contact.phone}\nالساعات: ${contact.hours}\n\nيمكنني أيضاً فتح تذكرة صيانة. قل «أنشئ تذكرة» إن رغبت.`
        : `For ${contact.category.toLowerCase()} issues in your unit, call our approved ${contact.role.toLowerCase()} directly:\n\n${contact.name}\n${contact.phone}\nHours: ${contact.hours}\n\nI can also open a maintenance ticket. Say “create ticket” if you want that.`,
      contact,
    }
  }

  if (/number|contact|phone|أرقام|رقم|خدمات|who.*(call|fix)|call.*(tech|ac|plumb|electric)/.test(q)) {
    const lines = serviceDirectory.map((c) => `• ${c.role}: ${c.name} — ${c.phone}`).join('\n')
    return {
      text: ar
        ? `إليك قائمة أرقام الخدمات:\n\n${lines}\n\nصف المشكلة وسأرسل الرقم المناسب مع زر اتصال.`
        : `Here’s the building service number list:\n\n${lines}\n\nTell me the problem and I’ll send the right number with a tap-to-call link.`,
    }
  }

  if (/ticket|repair|broken|maintenance|create ticket|صيانة|عطل|تذكرة|لا يعمل/.test(q)) {
    return {
      text: ar
        ? 'يمكنني إنشاء تذكرة صيانة مع بيانات وحدتك. صف المشكلة أو قل «أنشئ تذكرة»، أو استخدم تبويب التذاكر.'
        : 'I can create a maintenance ticket with your unit details. Describe the issue, say “create ticket”, or use the Tickets tab.',
      contact: serviceDirectory.find((c) => c.id === 'c-ac'),
    }
  }
  if (/visitor|guest|gate|qr|pass|زائر|ضيف/.test(q)) {
    return {
      text: ar
        ? 'تصاريح الزوار من الملف الشخصي. لمشاكل الاستقبال، تواصل مع الأمن عبر أرقام الخدمات.'
        : 'Guest passes are available from your Profile. For lobby access issues, contact security via the service numbers.',
      contact: serviceDirectory.find((c) => c.id === 'c-security'),
    }
  }
  if (/amenit|gym|pool|parking|مسبح|جيم|موقف/.test(q)) {
    return {
      text: ar
        ? 'تفاصيل المرافق والمواقف يحددها إدارة المبنى. اسأل عن موقفك من ملفك أو تواصل مع المدير.'
        : 'Amenity hours and parking details are set by building management. Check your profile for your bay, or ask the manager.',
    }
  }
  if (/human|agent|person|manager|speak|شخص|موظف|مدير|تحدث/.test(q)) {
    return {
      text: ar
        ? 'سأوصلك بموظف دعم المبنى مع تمرير بيانات وحدتك وهذه المحادثة.'
        : 'Connecting you to a building support agent. I’ll pass your unit details and this chat so you don’t have to repeat yourself.',
      escalate: true,
      contact: serviceDirectory.find((c) => c.id === 'c-manager'),
    }
  }
  if (/lease|contract|renew|عقد|تجديد/.test(q)) {
    return {
      text: ar
        ? 'تفاصيل عقدك تظهر في ملفك. لأسئلة التجديد، يمكنني توصيلك بمدير المبنى.'
        : 'Your lease details are on your Profile. For renewal questions, I can connect you to the building manager.',
      contact: serviceDirectory.find((c) => c.id === 'c-manager'),
    }
  }

  return {
    text: ar
      ? 'يمكنني المساعدة في الإيجار والدفع والصيانة وأرقام الخدمات وتصاريح الزوار والعقد. مثال: «المكيف لا يعمل».'
      : 'I can help with rent, payments, repairs, service numbers, visitor passes, and lease details. Example: “My AC is broken”.',
  }
}

export function welcomeMessage(lang: 'en' | 'ar', firstName: string, apartment: string): string {
  const name = firstName || (lang === 'ar' ? 'مرحباً' : 'there')
  const apt = apartment || '—'
  return lang === 'ar'
    ? `مرحباً ${name} — أنا مليح، مساعد مليهرنتس لشقة ${apt}. اسأل عن الإيجار أو الصيانة أو الزوار، أو قل «أريد التحدث لشخص».`
    : `Hi ${name} — I’m MLIH, your MLIHrents assistant for Apt ${apt}. Ask about rent, repairs, visitors, or say “talk to a person”.`
}
