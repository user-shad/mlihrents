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
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('971') && digits.length >= 12) {
    digits = `0${digits.slice(3)}`
  }
  if (digits.length === 9 && digits.startsWith('5')) {
    digits = `0${digits}`
  }
  return digits
}

/** Retired bootstrap staff phones — removed on sync so new defaults apply. */
export const LEGACY_STAFF_PHONES = ['0500000000', '0501111111']

/** Open WhatsApp chat for a UAE/local phone number. Optional pre-filled message. */
export function whatsappChatUrl(phone: string, text?: string) {
  let digits = phone.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('0')) digits = `971${digits.slice(1)}`
  const base = `https://wa.me/${digits}`
  const message = text?.trim()
  if (!message) return base
  return `${base}?text=${encodeURIComponent(message)}`
}

/** Pre-filled WhatsApp rent reminder for admin to send manually. */
export function buildRentReminderWhatsAppMessage(
  resident: Resident,
  invoices: Invoice[],
  lang: 'en' | 'ar',
  portalUrl: string,
  brandName = 'MLIH Rents',
) {
  const name = resident.name.trim() || (lang === 'ar' ? 'الساكن' : 'Resident')
  const unit = unitCodeLabel(resident)
  const unpaid = invoices.filter((inv) => inv.status === 'due' || inv.status === 'overdue')
  const next = unpaid.find((inv) => inv.status === 'overdue') ?? unpaid.find((inv) => inv.status === 'due')
  const balance = remainingBalance(resident)

  if (lang === 'ar') {
    let detail = ''
    if (next) {
      detail =
        next.status === 'overdue'
          ? `فاتورة ${next.period} بمبلغ ${next.amount.toLocaleString()} درهم كانت مستحقة في ${next.dueDate}.`
          : `إيجار ${next.period} بمبلغ ${next.amount.toLocaleString()} درهم مستحق في ${next.dueDate}.`
    } else if (balance > 0) {
      detail = `المبلغ المتبقي على العقد: ${balance.toLocaleString()} درهم.`
    } else {
      detail = 'يرجى مراجعة حالة الدفع في البوابة.'
    }
    return `مرحباً ${name}،\n\nتذكير من ${brandName} بخصوص الوحدة ${unit}.\n${detail}\n\nادفع عبر بوابة السكان:\n${portalUrl}\n\nشكراً لكم.`
  }

  let detail = ''
  if (next) {
    detail =
      next.status === 'overdue'
        ? `Your ${next.period} invoice of AED ${next.amount.toLocaleString()} was due on ${next.dueDate}.`
        : `Your ${next.period} rent of AED ${next.amount.toLocaleString()} is due on ${next.dueDate}.`
  } else if (balance > 0) {
    detail = `Remaining balance on your lease: AED ${balance.toLocaleString()}.`
  } else {
    detail = 'Please review your payment status on the portal.'
  }
  return `Hello ${name},\n\nThis is a rent reminder from ${brandName} for unit ${unit}.\n${detail}\n\nPay via the resident portal:\n${portalUrl}\n\nThank you.`
}

export type PaymentNotifyKind = 'approved' | 'partial' | 'rejected'

/** Pre-filled WhatsApp message after admin approves or rejects a payment. */
export function buildPaymentStatusWhatsAppMessage(
  payment: PaymentRecord,
  kind: PaymentNotifyKind,
  lang: 'en' | 'ar',
  portalUrl: string,
  brandName = 'MLIH Rents',
) {
  const name = payment.residentName.trim() || (lang === 'ar' ? 'الساكن' : 'Resident')
  const unit = payment.unit
  const amount = payment.confirmedAmount ?? payment.amount
  const expected = payment.amount

  if (lang === 'ar') {
    let detail = ''
    if (kind === 'approved') {
      detail = `تمت الموافقة على دفعتك بمبلغ ${amount.toLocaleString()} درهم للوحدة ${unit}. تم تحديث الفاتورة كمدفوعة.`
    } else if (kind === 'partial') {
      detail = `استلمنا ${amount.toLocaleString()} درهم من أصل ${expected.toLocaleString()} درهم للوحدة ${unit}. الفاتورة ما زالت مستحقة للرصيد المتبقي.`
    } else {
      detail = `تعذّر التحقق من تحويلك بمبلغ ${expected.toLocaleString()} درهم للوحدة ${unit}. يرجى إرسال إثبات جديد أو التواصل مع الإدارة.`
    }
    return `مرحباً ${name}،\n\n${detail}\n\nراجع حالة الدفع في بوابة السكان:\n${portalUrl}\n\n${brandName}`
  }

  let detail = ''
  if (kind === 'approved') {
    detail = `Your payment of AED ${amount.toLocaleString()} for unit ${unit} has been approved. Your invoice is now marked paid.`
  } else if (kind === 'partial') {
    detail = `We received AED ${amount.toLocaleString()} toward your invoice of AED ${expected.toLocaleString()} for unit ${unit}. The invoice remains due for the balance.`
  } else {
    detail = `We could not verify your transfer of AED ${expected.toLocaleString()} for unit ${unit}. Please submit a new proof or contact management.`
  }
  return `Hello ${name},\n\n${detail}\n\nReview your payment status on the resident portal:\n${portalUrl}\n\n${brandName}`
}

export function buildPaymentStatusEmailMessage(
  payment: PaymentRecord,
  kind: PaymentNotifyKind,
  lang: 'en' | 'ar',
  portalUrl: string,
  brandName = 'MLIH Rents',
) {
  const body = buildPaymentStatusWhatsAppMessage(payment, kind, lang, portalUrl, brandName)
  const unit = payment.unit
  const subject =
    lang === 'ar'
      ? kind === 'approved'
        ? `تمت الموافقة على الدفع — ${unit}`
        : kind === 'partial'
          ? `دفعة جزئية — ${unit}`
          : `تحديث الدفع — ${unit}`
      : kind === 'approved'
        ? `Payment approved — ${unit}`
        : kind === 'partial'
          ? `Partial payment recorded — ${unit}`
          : `Payment update — ${unit}`
  return { subject: `${brandName}: ${subject}`, body }
}

export function mailtoUrl(email: string, subject: string, body: string) {
  const trimmed = email.trim()
  if (!trimmed) return ''
  return `mailto:${trimmed}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
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

export type PaymentStatus = 'pending_review' | 'settled' | 'rejected' | 'partial' | 'deleted'

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
  /** Bank "Reference number" from the transfer (digits, e.g. Wio). */
  bankReference?: string
  /** OCR-read amount from screenshot at submission. */
  ocrAmount?: number | null
  /** Set when OCR amount differs from the invoice. */
  amountMismatchFlag?: boolean
  /** Set when entered bank ref does not match OCR on the screenshot. */
  bankRefMismatchFlag?: boolean
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

export function normalizeBankReferenceDigits(ref: string) {
  return ref.replace(/\D/g, '')
}

export function isValidBankReference(ref: string) {
  const digits = normalizeBankReferenceDigits(ref)
  return digits.length >= 6 && digits.length <= 15
}

/** Block re-using a bank reference already tied to another payment. */
export function findDuplicateBankReference(
  ref: string,
  payments: PaymentRecord[],
  excludePaymentId?: string,
): PaymentRecord | null {
  const digits = normalizeBankReferenceDigits(ref)
  if (!digits) return null
  return (
    payments.find((p) => {
      if (excludePaymentId && p.id === excludePaymentId) return false
      if (p.status === 'rejected' || p.status === 'deleted') return false
      const existing = p.bankReference ? normalizeBankReferenceDigits(p.bankReference) : ''
      return existing.length > 0 && existing === digits
    }) ?? null
  )
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

/** Extract invoice reference from admin text (e.g. INV-2026-001). */
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
    .filter(
      (p) =>
        p.status !== 'deleted' &&
        (normalizeRef(p.paymentRef ?? '') === key || normalizeRef(p.invoiceId) === key),
    )
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
    match = payment.status as PaymentLookupMatch
  } else if (invoice) {
    match = paidIds.includes(invoice.id) ? 'invoice_paid' : 'invoice_unpaid'
  } else {
    match = 'not_found'
  }

  return { ref: ref.trim(), match, payment, invoice, resident, allPaymentsForRef }
}

export interface ResidentAiContext {
  resident: Resident
  invoices: Invoice[]
  tickets: Ticket[]
  payments: PaymentRecord[]
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
        ? '❌ لم أجد فاتورة أو دفعة بهذا الرقم. تأكد من رقم الفاتورة كما يظهر في وصف التحويل البنكي.'
        : '❌ No invoice or payment found for this reference. Check the invoice number as it appears in the bank transfer description.',
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
    return `${header}\n${rows}\n\n${ar ? 'اسأل عن مرجع محدد للتفاصيل.' : 'Ask about a specific reference for details.'}`
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
  /** @deprecated kept for older synced data */
  notes?: string
  /** WhatsApp number; if empty, phone is used for wa.me links */
  whatsapp?: string
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
      units.push(buildEmptyApartment(building.letter, building.start + i))
    }
  }
  return units
}

export const apartmentUnits: Resident[] = generateApartmentUnits()

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

export type StaffTier = 'admin' | 'staff'

export interface StaffAccount {
  phone: string
  pin: string
  name: string
  tier: StaffTier
}

/**
 * Bootstrap staff logins (passwords persist after first change in localStorage).
 * Building Admin: `0553262626` · PIN `1989` — can change tenant passwords
 * Operations Manager: `0505001021` · PIN `3004` — can set tenant login passwords
 */
export const staffAccounts: StaffAccount[] = [
  { phone: '0553262626', pin: '1989', name: 'Building Admin', tier: 'admin' },
  { phone: '0505001021', pin: '3004', name: 'Operations Manager', tier: 'staff' },
]

export const invoices: Invoice[] = []

export const invoicesByResident: Record<string, Invoice[]> = {}

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

/** Template service contacts — admin can edit in Info → service directory */
export const defaultServiceDirectory: ServiceContact[] = [
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
    whatsapp: '+971 50 000 0001',
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
    whatsapp: '+971 50 000 0002',
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
    whatsapp: '+971 50 000 0003',
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
    whatsapp: '+971 50 000 0004',
  },
  {
    id: 'c-manager',
    role: 'Building manager',
    name: 'Building manager',
    phone: '+971 50 000 0005',
    category: 'Management',
    keywords: ['manager', 'lease', 'complaint', 'management', 'مدير', 'عقد', 'شكوى'],
    hours: '9 AM – 6 PM · Sun–Thu',
    whatsapp: '+971 50 000 0005',
  },
]

export const serviceDirectory = defaultServiceDirectory

export function findServiceContact(
  input: string,
  directory: ServiceContact[] = defaultServiceDirectory,
): ServiceContact | undefined {
  const q = input.toLowerCase()
  return directory.find((c) => c.keywords.some((k) => q.includes(k)))
}

export const arrearsList: { unit: string; name: string; amount: number; days: number }[] = []

export function formatMoney(amount: number, currency = 'AED') {
  return `${currency} ${amount.toLocaleString()}`
}

export function remainingBalance(resident: Resident) {
  return Math.max(0, resident.contractTotal - resident.amountPaid)
}

/** Admin has set a contract and installment amount. */
export function hasRentPlan(resident: Resident) {
  return resident.contractTotal > 0 && resident.rentAmount > 0
}

/** Resident should see pay prompts and open invoices. */
export function canCollectRent(resident: Resident) {
  return hasRentPlan(resident) && remainingBalance(resident) > 0
}

export function paidPercent(resident: Resident) {
  if (resident.contractTotal <= 0) return 0
  return Math.min(100, Math.round((resident.amountPaid / resident.contractTotal) * 100))
}

/** Current calendar period label for installment invoices */
export function currentPeriodLabel(lang: 'en' | 'ar' = 'en') {
  const d = new Date()
  if (lang === 'ar') {
    return d.toLocaleDateString('ar-AE', { month: 'long', year: 'numeric' })
  }
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

/**
 * Build a due invoice for the current installment when the rent plan has
 * remaining balance but no invoice exists yet.
 */
export function buildInstallmentInvoice(
  resident: Resident,
  lang: 'en' | 'ar' = 'en',
): Invoice | null {
  const remaining = remainingBalance(resident)
  if (remaining <= 0 || resident.rentAmount <= 0) return null

  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const dueDay = Math.min(28, Math.max(1, resident.rentDueDay || 1))
  const dueDateIso = `${y}-${String(m).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`
  const unit = (resident.apartment || resident.id).replace(/\s+/g, '')
  const id = `INV-${unit}-${y}${String(m).padStart(2, '0')}`
  const amount = Math.min(resident.rentAmount, remaining)

  return {
    id,
    period: currentPeriodLabel(lang),
    amount,
    dueDateIso,
    dueDate: formatIsoDueDate(dueDateIso, lang),
    status: isPastDue(dueDateIso) ? 'overdue' : 'due',
  }
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
    const extensionDays = inv.extensionDays ?? 0
    let baseIso = inv.dueDateIso
    if (!baseIso) {
      const month =
        inv.period.includes('July') || inv.period.includes('Jul')
          ? 'Jul 2026'
          : inv.period.includes('June') || inv.period.includes('Jun')
            ? 'Jun 2026'
            : inv.period.includes('May')
              ? 'May 2026'
              : 'Jul 2026'
      baseIso = dueDayToIso(dueDay, month)
    } else {
      const [y, m] = baseIso.split('-')
      const safeDay = Math.min(28, Math.max(1, dueDay))
      baseIso = `${y}-${m}-${String(safeDay).padStart(2, '0')}`
    }
    const effectiveIso = addDaysToIso(baseIso, extensionDays)
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

/** Automated assistant replies — keyword intents plus apartment context (no external AI API). */
export function aiReply(
  input: string,
  lang: 'en' | 'ar' = 'en',
  directory: ServiceContact[] = defaultServiceDirectory,
  ctx?: ResidentAiContext,
): {
  text: string
  escalate?: boolean
  contact?: ServiceContact
} {
  const q = input.toLowerCase()
  const contact = findServiceContact(q, directory)
  const ar = lang === 'ar'
  const unit = ctx ? unitCodeLabel(ctx.resident) : ''
  const currency = ctx?.resident.currency ?? 'AED'

  if (/human|agent|person|manager|speak|talk to|شخص|موظف|مدير|تحدث|أريد التحدث/.test(q)) {
    return {
      text: ar
        ? 'سأوصلك بموظف دعم المبنى مع تمرير بيانات وحدتك وهذه المحادثة.'
        : 'Connecting you to a building support agent. I’ll pass your unit details and this chat so you don’t have to repeat yourself.',
      escalate: true,
      contact: directory.find((c) => /manag/i.test(c.category + c.role)) ?? directory[0],
    }
  }

  if (
    ctx &&
    /balance|owe|outstanding|remaining|how much|amount due|كم|متبقي|مستحق|رصيد|باقي/.test(q)
  ) {
    const balance = remainingBalance(ctx.resident)
    const due =
      ctx.invoices.find((inv) => inv.status === 'overdue') ??
      ctx.invoices.find((inv) => inv.status === 'due')
    if (balance <= 0 && !due) {
      return {
        text: ar
          ? `لا يوجد رصيد مستحق على عقد الوحدة ${unit} حالياً.`
          : `There is no outstanding balance on your lease for unit ${unit} right now.`,
      }
    }
    let detail = ar
      ? `المبلغ المتبقي على العقد: ${currency} ${balance.toLocaleString()}.`
      : `Remaining lease balance: ${currency} ${balance.toLocaleString()}.`
    if (due) {
      detail += ar
        ? `\nالفاتورة الحالية: ${due.period} — ${currency} ${due.amount.toLocaleString()} (${due.status === 'overdue' ? 'متأخرة' : 'مستحقة'} ${due.dueDate}).`
        : `\nCurrent invoice: ${due.period} — ${currency} ${due.amount.toLocaleString()} (${due.status}, due ${due.dueDate}).`
    }
    detail += ar
      ? '\n\nادفع من تبويب الدفع وارفق إثبات التحويل.'
      : '\n\nPay from the Pay tab and attach your transfer proof.'
    return { text: detail }
  }

  if (
    ctx &&
    /payment|proof|transfer|screenshot|review|status|paid|pending|reject|تحويل|دفع|إثبات|حالة|مراجعة|رفض/.test(
      q,
    )
  ) {
    const pending = ctx.payments.filter((p) => p.status === 'pending_review')
    const rejected = [...ctx.payments].reverse().find((p) => p.status === 'rejected')
    if (pending.length > 0) {
      const latest = pending[pending.length - 1]
      return {
        text: ar
          ? `لديك ${pending.length} تحويل قيد المراجعة.\n\nالأحدث: ${currency} ${latest.amount.toLocaleString()} · ${latest.paidAt}\n\nسيتم تحديث الفاتورة بعد موافقة الإدارة.`
          : `You have ${pending.length} transfer(s) under review.\n\nLatest: ${currency} ${latest.amount.toLocaleString()} · ${latest.paidAt}\n\nYour invoice updates once management approves.`,
      }
    }
    if (rejected && /reject|refus|رفض|مرفوض|fail|wrong/.test(q)) {
      return {
        text: ar
          ? `آخر تحويل مرفوض: ${currency} ${rejected.amount.toLocaleString()} · ${rejected.paidAt}.\n\n${rejected.reviewNote ?? 'يرجى إرسال إثبات جديد من تبويب الدفع.'}`
          : `Latest rejected transfer: ${currency} ${rejected.amount.toLocaleString()} · ${rejected.paidAt}.\n\n${rejected.reviewNote ?? 'Please submit a new proof from the Pay tab.'}`,
      }
    }
    const settled = ctx.payments.filter((p) => p.status === 'settled' || p.status === 'partial')
    if (settled.length > 0) {
      const latest = settled[settled.length - 1]
      return {
        text: ar
          ? `آخر دفعة معتمدة: ${currency} ${(latest.confirmedAmount ?? latest.amount).toLocaleString()} · ${latest.paidAt} (${latest.status === 'partial' ? 'جزئية' : 'مكتملة'}).`
          : `Latest approved payment: ${currency} ${(latest.confirmedAmount ?? latest.amount).toLocaleString()} · ${latest.paidAt} (${latest.status}).`,
      }
    }
    return {
      text: ar
        ? 'لا توجد مدفوعات مسجلة بعد. ادفع من تبويب الدفع وارفق إثبات التحويل.'
        : 'No payments on file yet. Pay from the Pay tab and attach your transfer proof.',
    }
  }

  if (/rent|pay|invoice|due|إيجار|الايجار|ادفع|فاتورة|how do i pay/.test(q)) {
    if (ctx) {
      const due =
        ctx.invoices.find((inv) => inv.status === 'overdue') ??
        ctx.invoices.find((inv) => inv.status === 'due')
      if (due) {
        return {
          text: ar
            ? `الوحدة ${unit}: فاتورة ${due.period} بمبلغ ${currency} ${due.amount.toLocaleString()} (${due.status === 'overdue' ? 'متأخرة' : 'مستحقة'} ${due.dueDate}).\n\n1) حوّل إلى حساب المبنى\n2) ضع رقم الفاتورة في ملاحظة التحويل\n3) ارفع لقطة الشاشة من تبويب الدفع`
            : `Unit ${unit}: ${due.period} invoice is ${currency} ${due.amount.toLocaleString()} (${due.status}, due ${due.dueDate}).\n\n1) Transfer to the building bank account\n2) Put the invoice number in the transfer note\n3) Upload your screenshot from the Pay tab`,
        }
      }
      if (remainingBalance(ctx.resident) <= 0) {
        return {
          text: ar
            ? `لا توجد فاتورة مفتوحة للوحدة ${unit}. رصيد العقد مسدّد حالياً.`
            : `No open invoice for unit ${unit}. Your lease balance is clear.`,
        }
      }
    }
    return {
      text: ar
        ? 'يمكنك مراجعة فواتيرك والدفع عبر التحويل البنكي إلى حساب المبنى — أرفق إثبات التحويل بعد الدفع.'
        : 'You can review invoices and pay by bank transfer to the building account — attach your transfer proof after paying.',
    }
  }

  if (
    ctx &&
    /my ticket|ticket status|open ticket|any ticket|update on|تذكرتي|حالة التذكرة|تذاكر مفتوحة/.test(q)
  ) {
    const open = ctx.tickets.filter((t) => t.status !== 'resolved')
    if (open.length === 0) {
      return {
        text: ar
          ? 'لا توجد تذاكر صيانة مفتوحة. يمكنك فتح تذكرة من تبويب التذاكر أو وصف المشكلة هنا.'
          : 'You have no open maintenance tickets. Open one from the Tickets tab or describe the issue here.',
      }
    }
    const lines = open.map((t) => `• ${t.title} — ${t.status} (${t.created})`).join('\n')
    return {
      text: ar
        ? `لديك ${open.length} تذكرة مفتوحة:\n\n${lines}`
        : `You have ${open.length} open ticket(s):\n\n${lines}`,
    }
  }

  if (
    contact &&
    /ac|a\/c|air ?con|hvac|cool|heat|plumb|leak|faucet|drain|toilet|electric|power|outlet|light|security|lockout|noise|emergency|مكيف|تكييف|سباكة|تسريب|كهرباء|أمن|حراسة|طوارئ|broken|fix|repair|لا يعمل/.test(
      q,
    )
  ) {
    return {
      text: ar
        ? `لمشاكل ${contact.category} في وحدتك ${unit}، اتصل مباشرة بـ${contact.role} المعتمد:\n\n${contact.name}\n${contact.phone}\n\nيمكنك أيضاً فتح تذكرة صيانة من تبويب التذاكر.`
        : `For ${contact.category.toLowerCase()} issues in unit ${unit}, call our approved ${contact.role.toLowerCase()} directly:\n\n${contact.name}\n${contact.phone}\n\nYou can also open a maintenance ticket from the Tickets tab.`,
      contact,
    }
  }

  if (/number|contact|phone|أرقام|رقم|خدمات|who.*(call|fix)|call.*(tech|ac|plumb|electric)|show service/.test(q)) {
    const lines = directory.map((c) => `• ${c.role}: ${c.name} — ${c.phone}`).join('\n')
    return {
      text: ar
        ? `إليك قائمة أرقام الخدمات:\n\n${lines}\n\nصف المشكلة وسأرسل الرقم المناسب مع زر اتصال.`
        : `Here’s the building service number list:\n\n${lines}\n\nTell me the problem and I’ll send the right number with a tap-to-call link.`,
    }
  }

  if (/ticket|repair|broken|maintenance|create ticket|صيانة|عطل|تذكرة/.test(q)) {
    return {
      text: ar
        ? `يمكنك فتح تذكرة صيانة لوحدة ${unit || 'الخاصة بك'} من تبويب التذاكر — سيتم إرفاق بيانات شقتك تلقائياً.`
        : `Open a maintenance ticket for unit ${unit || 'your apartment'} from the Tickets tab — your unit details are attached automatically.`,
      contact: directory.find((c) => /ac|hvac|cool/i.test(c.category + c.role)) ?? directory[0],
    }
  }

  if (/visitor|guest|gate|qr|pass|زائر|ضيف/.test(q)) {
    return {
      text: ar
        ? 'تصاريح الزوار من الملف الشخصي. لمشاكل الاستقبال، تواصل مع الأمن عبر أرقام الخدمات.'
        : 'Guest passes are available from your Profile. For lobby access issues, contact security via the service numbers.',
      contact: directory.find((c) => /secur/i.test(c.category + c.role)),
    }
  }

  if (ctx?.resident.parking && /parking|موقف|bay|garage|car spot/.test(q)) {
    return {
      text: ar
        ? `موقفك المسجل للوحدة ${unit}: ${ctx.resident.parking}.`
        : `Your assigned parking for unit ${unit}: ${ctx.resident.parking}.`,
    }
  }

  if (/amenit|gym|pool|parking|مسبح|جيم|مرافق/.test(q)) {
    return {
      text: ar
        ? 'تفاصيل المرافق والمواقف يحددها إدارة المبنى. راجع ملفك الشخصي أو تواصل مع المدير.'
        : 'Amenity hours and parking details are set by building management. Check your Profile or contact the manager.',
    }
  }

  if (/lease|contract|renew|lease end|عقد|تجديد|نهاية العقد/.test(q)) {
    const end = ctx?.resident.leaseEnd?.trim()
    const extra = end
      ? ar
        ? `\n\nنهاية عقدك المسجل: ${end}.`
        : `\n\nYour lease end date on file: ${end}.`
      : ''
    return {
      text: ar
        ? `تفاصيل عقدك تظهر في ملفك.${extra}\n\nلأسئلة التجديد، يمكنني توصيلك بمدير المبنى.`
        : `Your lease details are on your Profile.${extra}\n\nFor renewal questions, I can connect you to the building manager.`,
      contact: directory.find((c) => /manag/i.test(c.category + c.role)) ?? directory[0],
    }
  }

  const examples = ar
    ? ['«كم المتبقي؟»', '«حالة الدفع»', '«المكيف لا يعمل»', '«أريد التحدث لشخص»']
    : ['“What do I owe?”', '“Payment status”', '“My AC is broken”', '“Talk to a person”']
  const hint = ctx
    ? ar
      ? `الوحدة ${unit}. جرّب: ${examples.join(' · ')}`
      : `Unit ${unit}. Try: ${examples.join(' · ')}`
    : ar
      ? `جرّب: ${examples.join(' · ')}`
      : `Try: ${examples.join(' · ')}`

  return {
    text: ar
      ? `لم أفهم سؤالك تماماً. أنا مساعد آلي — أستطيع المساعدة في الإيجار والدفع والصيانة وأرقام الخدمات.\n\n${hint}`
      : `I didn’t quite catch that. I’m an automated assistant — I can help with rent, payments, repairs, and service numbers.\n\n${hint}`,
  }
}

export function welcomeMessage(lang: 'en' | 'ar', firstName: string, apartment: string): string {
  const name = firstName || (lang === 'ar' ? 'مرحباً' : 'there')
  const apt = apartment || '—'
  return lang === 'ar'
    ? `مرحباً ${name} — أنا مليح، مساعد مليهرنتس الآلي لشقة ${apt}. اسأل عن الإيجار أو الدفع أو الصيانة، أو قل «أريد التحدث لشخص».`
    : `Hi ${name} — I'm MLIH, your automated MLIHrent assistant for Apt ${apt}. Ask about rent, payments, or repairs — or say “talk to a person”.`
}
