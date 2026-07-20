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

/** Build a short unique transfer reference for bank matching */
export function buildPaymentRef(unit: string, invoiceId: string) {
  const unitPart = unit.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'UNIT'
  const invPart = invoiceId.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'INV'
  return `MLIH-${unitPart}-${invPart}`.slice(0, 32)
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

/** Sample residents (also in /templates/residents-sample.csv) */
export const sampleResidents: Resident[] = [
  {
    id: 'r-sara',
    name: 'Sara Al-Hassan',
    phone: '0545882666',
    pin: '7423',
    building: 'Palm Residence',
    buildingNumber: 'B12',
    apartment: '804',
    floor: 8,
    parking: 'P2-117',
    leaseEnd: '31 Dec 2026',
    rentAmount: 8500,
    currency: 'AED',
    rentDueDay: 5,
    rentSchedule: 'monthly',
    contractTotal: 102000,
    amountPaid: 17000,
    email: 'sara@email.com',
    moveIn: '1 Jan 2025',
    occupants: 2,
    status: 'active',
  },
  {
    id: 'r-omar',
    name: 'Omar Nasser',
    phone: '0558821044',
    pin: '5510',
    building: 'Palm Residence',
    buildingNumber: 'B12',
    apartment: '312',
    floor: 3,
    parking: 'P1-044',
    leaseEnd: '15 Mar 2027',
    rentAmount: 51000,
    currency: 'AED',
    rentDueDay: 1,
    rentSchedule: 'semi_annual',
    contractTotal: 102000,
    amountPaid: 34000,
    email: 'omar@email.com',
    moveIn: '15 Mar 2024',
    occupants: 3,
    status: 'arrears',
  },
]

/** Alias — sample resident Sara */
export const demoResident = sampleResidents[0]

/** Seed residents for the website (sample users) */
export const residents: Resident[] = [...sampleResidents]

/**
 * Bootstrap staff login so you can open Admin and create your own data.
 * Phone `0500000000` · PIN `1234`
 */
export const staffAccounts = [
  { phone: '0500000000', pin: '1234', name: 'Building Admin' },
]

export const invoices: Invoice[] = [
  { id: 'INV-0726', period: 'July 2026', amount: 8500, dueDate: '5 Jul 2026', status: 'due' },
  { id: 'INV-0626', period: 'June 2026', amount: 8500, dueDate: '5 Jun 2026', status: 'paid' },
  { id: 'INV-0526', period: 'May 2026', amount: 8500, dueDate: '5 May 2026', status: 'paid' },
]

export const invoicesByResident: Record<string, Invoice[]> = {
  'r-sara': invoices,
  'r-omar': [
    { id: 'INV-0726-O', period: 'July 2026', amount: 51000, dueDate: '1 Jul 2026', status: 'overdue' },
    { id: 'INV-0126-O', period: 'Jan 2026', amount: 51000, dueDate: '1 Jan 2026', status: 'paid' },
  ],
}

export const initialTickets: Ticket[] = [
  {
    id: 'TK-184',
    title: 'AC not cooling in bedroom',
    category: 'HVAC',
    status: 'in_progress',
    created: '16 Jul',
    note: 'Technician scheduled for tomorrow 10:00–12:00',
  },
]

export const ticketsByResident: Record<string, Ticket[]> = {
  'r-sara': initialTickets,
  'r-omar': [],
}

export const announcements: Announcement[] = []

export const adminStats = {
  units: 0,
  occupied: 0,
  arrears: 0,
  openTickets: 0,
  chatQueue: 0,
  accountBalance: 0,
  accountName: 'MLIHrents Merchant',
  accountBank: 'Your bank · ****0000',
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
        ? 'يمكنك مراجعة فواتيرك والدفع من تبويب الدفع — يدعم Apple Pay والبطاقة والتحويل البنكي.'
        : 'You can review invoices and pay from the Pay tab — Apple Pay, card, and bank transfer are supported.',
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
