import {
  createContext,
  FormEvent,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  adminStats,
  aiReply,
  staffAiReply,
  staffWelcomeMessage,
  resolveStaffOcrTargets,
  extractBankReference,
  applyDueDayToInvoices,
  AvailableApartment,
  blankResident,
  ChatMessage,
  Invoice,
  nowLabel,
  PaymentRecord,
  amountsMatch,
  buildPaymentRef,
  buildInstallmentInvoice,
  formatMoney,
  remainingBalance,
  unitCodeLabel,
  RentSchedule,
  Resident,
  apartmentUnits,
  buildEmptyApartment,
  suggestInstallment,
  Ticket,
  welcomeMessage,
  type ServiceContact,
  defaultServiceDirectory,
} from '../data'
import { useAuth } from './AuthContext'
import { useLang } from './LangContext'
import {
  BankAccountSettings,
  isBankConfigured,
  normalizeBankSettings,
  readBankSettings,
  writeBankSettings,
} from '../config/paymentSettings'
import {
  formatScreenshotAnalysis,
  recognizeTransferProof,
} from '../lib/transferProofOcr'
import {
  onCloudOps,
  queueCloudOps,
  type PortalOps,
  writeLocalOps,
} from '../lib/cloudSync'

const LEGACY_A1_TEST_ID = 'apt-a1'
const LEGACY_A1_TEST_INVOICE = 'INV-TEST-A1'

function isLegacyTestTenantA1(resident: Resident): boolean {
  if (resident.id !== LEGACY_A1_TEST_ID) return false
  const phone = resident.phone.replace(/\D/g, '')
  return (
    resident.name === 'Test Tenant A1' ||
    phone === '0501234567' ||
    resident.email === 'a1-test@mlihrents.ae'
  )
}

/** Remove demo A1 tenant data saved in older builds. */
function stripLegacyTestData(parsed: PortalOps): PortalOps {
  const residentList = parsed.residentList ?? []
  const hasTestResident = residentList.some(isLegacyTestTenantA1)
  const hasTestInvoice = (parsed.invoiceMap?.[LEGACY_A1_TEST_ID] ?? []).some(
    (inv) => inv.id === LEGACY_A1_TEST_INVOICE,
  )
  const hasTestPayments = (parsed.payments ?? []).some(
    (p) =>
      p.residentId === LEGACY_A1_TEST_ID &&
      (p.invoiceId === LEGACY_A1_TEST_INVOICE || p.residentName === 'Test Tenant A1'),
  )

  if (!hasTestResident && !hasTestInvoice && !hasTestPayments) return parsed

  const nextResidents = residentList.map((resident) =>
    isLegacyTestTenantA1(resident) ? buildEmptyApartment('A', 1) : resident,
  )

  const invoiceMap = { ...(parsed.invoiceMap ?? {}) }
  if (invoiceMap[LEGACY_A1_TEST_ID]) {
    invoiceMap[LEGACY_A1_TEST_ID] = invoiceMap[LEGACY_A1_TEST_ID].filter(
      (inv) => inv.id !== LEGACY_A1_TEST_INVOICE,
    )
    if (invoiceMap[LEGACY_A1_TEST_ID].length === 0) delete invoiceMap[LEGACY_A1_TEST_ID]
  }

  const payments = (parsed.payments ?? []).filter(
    (p) =>
      !(
        p.residentId === LEGACY_A1_TEST_ID &&
        (p.invoiceId === LEGACY_A1_TEST_INVOICE || p.residentName === 'Test Tenant A1')
      ),
  )

  const paidIds = (parsed.paidIds ?? []).filter((id) => id !== LEGACY_A1_TEST_INVOICE)

  return { ...parsed, residentList: nextResidents, invoiceMap, payments, paidIds }
}

function ensureSeedApartments(list: Resident[]): Resident[] {
  const byId = new Map(list.map((r) => [r.id, r]))
  return apartmentUnits.map((seed) => {
    const saved = byId.get(seed.id)
    if (!saved) return seed
    return {
      ...seed,
      ...saved,
      building: saved.building?.trim() ? saved.building : seed.building,
      buildingNumber: saved.buildingNumber?.trim() ? saved.buildingNumber : seed.buildingNumber,
      apartment: seed.apartment,
      id: seed.id,
    }
  })
}

function ensureSeedInvoices(map: Record<string, Invoice[]>): Record<string, Invoice[]> {
  return { ...map }
}

function normalizePersistedOps(parsed: PortalOps): PortalOps {
  const cleaned = stripLegacyTestData(parsed)
  return {
    ...cleaned,
    residentList: ensureSeedApartments(cleaned.residentList ?? []),
    invoiceMap: ensureSeedInvoices(cleaned.invoiceMap ?? {}),
    serviceDirectory:
      Array.isArray(cleaned.serviceDirectory) && cleaned.serviceDirectory.length > 0
        ? cleaned.serviceDirectory
        : defaultServiceDirectory,
  }
}

interface DataContextValue {
  residentList: Resident[]
  tickets: Ticket[]
  payments: PaymentRecord[]
  paidIds: string[]
  messages: ChatMessage[]
  humanMode: boolean
  selectedResidentId: string
  setSelectedResidentId: (id: string) => void
  dueDayDraft: string
  setDueDayDraft: (v: string) => void
  scheduleDraft: RentSchedule
  setScheduleDraft: (v: RentSchedule) => void
  contractDraft: string
  setContractDraft: (v: string) => void
  paidDraft: string
  setPaidDraft: (v: string) => void
  installmentDraft: string
  setInstallmentDraft: (v: string) => void
  ticketTitle: string
  setTicketTitle: (v: string) => void
  ticketCategory: string
  setTicketCategory: (v: string) => void
  ticketNote: string
  setTicketNote: (v: string) => void
  checkoutInvoiceId: string | null
  bankProof: { name: string; dataUrl: string } | null
  setBankProofFromFile: (file: File | null) => void
  clearBankProof: () => void
  paying: boolean
  pendingPayments: PaymentRecord[]
  invoiceHasPendingPayment: (invoiceId: string) => boolean
  confirmBankPayment: (paymentId: string, verifiedAmount: number, asPartial?: boolean) => void
  rejectBankPayment: (paymentId: string, note?: string) => void
  /** Staff records that an invoice was paid (cash / confirmed transfer) */
  adminRecordPayment: (invoiceId: string) => void
  toast: string | null
  chatInput: string
  setChatInput: (v: string) => void
  chatEndRef: React.RefObject<HTMLDivElement | null>
  showToast: (msg: string) => void
  visibleInvoices: ReturnType<typeof applyDueDayToInvoices>
  dueInvoice: ReturnType<typeof applyDueDayToInvoices>[number] | undefined
  checkoutInvoice: ReturnType<typeof applyDueDayToInvoices>[number] | null
  adminBalance: number
  selectedResident: Resident
  liveResident: Resident
  adminResidentInvoices: ReturnType<typeof applyDueDayToInvoices>
  adminResidentTickets: Ticket[]
  adminResidentPayments: PaymentRecord[]
  openCheckout: (id: string) => void
  closeCheckout: () => void
  /** Extend an overdue invoice due date by the given number of days (default 7). */
  extendInvoiceDueDate: (invoiceId: string, days?: number) => void
  completePayment: (e: FormEvent) => void
  createTicket: (e: FormEvent) => void
  escalateToHuman: () => void
  sendChat: (text: string) => void
  staffMessages: ChatMessage[]
  staffChatInput: string
  setStaffChatInput: (v: string) => void
  staffChatEndRef: React.RefObject<HTMLDivElement | null>
  sendStaffChat: (text: string) => void
  staffAnalyzing: boolean
  saveRentPlan: () => void
  saveResidentLoginPin: (phone: string, pin: string) => void
  clearResidentLogin: () => void
  registerNewResident: (input: {
    name: string
    phone: string
    pin: string
    buildingNumber: string
    apartment: string
  }) => void
  updateResidentInfo: (input: {
    name: string
    phone: string
    email: string
    building: string
    buildingNumber: string
    apartment: string
    floor: number
    parking: string
    occupants: number
    moveIn: string
    leaseEnd: string
    status: 'active' | 'arrears' | 'notice'
  }) => void
  clearApartmentInfo: () => void
  resetHumanMode: () => void
  syncWelcomeMessage: () => void
  availableListings: AvailableApartment[]
  addAvailableListing: (input: Omit<AvailableApartment, 'id'>) => void
  updateAvailableListing: (id: string, input: Partial<AvailableApartment>) => void
  removeAvailableListing: (id: string) => void
  bankSettings: BankAccountSettings
  bankConfigured: boolean
  saveBankSettings: (settings: BankAccountSettings) => void
  serviceDirectory: ServiceContact[]
  addServiceContact: (
    input: Omit<ServiceContact, 'id' | 'keywords' | 'hours' | 'notes'> & { keywords?: string[] },
  ) => void
  updateServiceContact: (
    id: string,
    input: Partial<Omit<ServiceContact, 'id'>>,
  ) => void
  removeServiceContact: (id: string) => void
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({
  children,
  initialOps,
}: {
  children: ReactNode
  initialOps: PortalOps
}) {
  const { lang, tr } = useLang()
  const { session, setResidentPin, clearResidentCredentials, registerResidentAccount } = useAuth()
  const bootOps = useMemo(() => normalizePersistedOps(initialOps), [initialOps])

  const [selectedResidentId, setSelectedResidentId] = useState(() => bootOps.residentList[0]?.id ?? '')
  const [residentList, setResidentList] = useState<Resident[]>(() => bootOps.residentList)
  const [listings, setListings] = useState<AvailableApartment[]>(() => bootOps.listings)
  const [bankSettings, setBankSettings] = useState<BankAccountSettings>(() =>
    isBankConfigured(bootOps.bankSettings) ? bootOps.bankSettings : readBankSettings(),
  )
  const [serviceDirectory, setServiceDirectory] = useState<ServiceContact[]>(
    () => bootOps.serviceDirectory ?? defaultServiceDirectory,
  )
  const [invoiceMap, setInvoiceMap] = useState<Record<string, Invoice[]>>(() => bootOps.invoiceMap)
  const [ticketMap, setTicketMap] = useState<Record<string, Ticket[]>>(() => bootOps.ticketMap)
  const [dueDayDraft, setDueDayDraft] = useState(String(blankResident.rentDueDay))
  const [scheduleDraft, setScheduleDraft] = useState<RentSchedule>(blankResident.rentSchedule)
  const [contractDraft, setContractDraft] = useState(String(blankResident.contractTotal))
  const [paidDraft, setPaidDraft] = useState(String(blankResident.amountPaid))
  const [installmentDraft, setInstallmentDraft] = useState(String(blankResident.rentAmount))
  const [ticketTitle, setTicketTitle] = useState('')
  const [ticketCategory, setTicketCategory] = useState('Plumbing')
  const [ticketNote, setTicketNote] = useState('')
  const [paidIds, setPaidIds] = useState<string[]>(() => bootOps.paidIds)
  /** Extra days granted past the original due date, keyed by invoice id */
  const [invoiceExtensions, setInvoiceExtensions] = useState<Record<string, number>>(
    () => bootOps.invoiceExtensions,
  )
  const [checkoutInvoiceId, setCheckoutInvoiceId] = useState<string | null>(null)
  const [bankProof, setBankProof] = useState<{ name: string; dataUrl: string } | null>(null)
  const [paying, setPaying] = useState(false)
  const [payments, setPayments] = useState<PaymentRecord[]>(() => bootOps.payments)
  const [toast, setToast] = useState<string | null>(null)
  const [humanMode, setHumanMode] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm0',
      role: 'ai',
      text: welcomeMessage('en', blankResident.name.split(' ')[0] || 'there', blankResident.apartment),
      time: nowLabel(),
    },
  ])
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [staffChatInput, setStaffChatInput] = useState('')
  const [staffMessages, setStaffMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'staff-w0',
      role: 'ai',
      text: staffWelcomeMessage('en'),
      time: nowLabel(),
    },
  ])
  const staffChatEndRef = useRef<HTMLDivElement>(null)
  const [staffAnalyzing, setStaffAnalyzing] = useState(false)

  useEffect(() => {
    return onCloudOps((remote) => {
      const next = normalizePersistedOps(remote)
      setResidentList(next.residentList)
      setListings(next.listings)
      setPayments(next.payments)
      setInvoiceMap(next.invoiceMap)
      setTicketMap(next.ticketMap)
      setInvoiceExtensions(next.invoiceExtensions)
      setPaidIds(next.paidIds)
      if (isBankConfigured(next.bankSettings)) {
        setBankSettings(next.bankSettings)
      }
      if (next.serviceDirectory?.length) {
        setServiceDirectory(next.serviceDirectory)
      }
    })
  }, [])

  useEffect(() => {
    const ops: PortalOps = {
      residentList,
      listings,
      payments,
      invoiceMap,
      ticketMap,
      invoiceExtensions,
      paidIds,
      bankSettings,
      serviceDirectory,
    }
    writeLocalOps(ops)
    queueCloudOps(ops)
  }, [
    residentList,
    listings,
    payments,
    invoiceMap,
    ticketMap,
    invoiceExtensions,
    paidIds,
    bankSettings,
    serviceDirectory,
  ])

  function showToast(msg: string) {
    setToast(msg)
  }

  const liveResident = useMemo(() => {
    if (session?.residentId) {
      const found = residentList.find((r) => r.id === session.residentId)
      if (found) return found
    }
    return blankResident
  }, [session?.residentId, residentList])

  const selectedResident = residentList.find((r) => r.id === selectedResidentId) ?? blankResident

  const tickets = ticketMap[liveResident.id] ?? []

  function syncWelcomeMessage() {
    const firstName = liveResident.name.split(' ')[0] || liveResident.name || 'there'
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].id === 'm0') {
        return [
          {
            ...prev[0],
            text: welcomeMessage(lang, firstName, liveResident.apartment),
          },
        ]
      }
      return prev
    })
  }

  useEffect(() => {
    syncWelcomeMessage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, session?.residentId, liveResident.id, liveResident.name, liveResident.apartment])

  const visibleInvoices = useMemo(() => {
    const base = (invoiceMap[liveResident.id] ?? []).map((inv) => ({
      ...(paidIds.includes(inv.id) ? { ...inv, status: 'paid' as const } : inv),
      extensionDays: invoiceExtensions[inv.id] ?? inv.extensionDays ?? 0,
    }))
    return applyDueDayToInvoices(base, liveResident.rentDueDay, lang)
  }, [invoiceMap, liveResident.id, liveResident.rentDueDay, paidIds, invoiceExtensions, lang])

  const dueInvoice = visibleInvoices.find((i) => i.status === 'due' || i.status === 'overdue')
  const checkoutInvoice = visibleInvoices.find((i) => i.id === checkoutInvoiceId) ?? null

  // Auto-create installment invoice so residents always have a Pay button when rent remains
  useEffect(() => {
    if (!liveResident.id) return
    if (remainingBalance(liveResident) <= 0 || liveResident.rentAmount <= 0) return
    const existing = invoiceMap[liveResident.id] ?? []
    const hasOpen = existing.some(
      (inv) => inv.status !== 'paid' && !paidIds.includes(inv.id),
    )
    if (hasOpen) return
    const next = buildInstallmentInvoice(liveResident, lang)
    if (!next) return
    if (existing.some((inv) => inv.id === next.id)) return
    setInvoiceMap((prev) => ({
      ...prev,
      [liveResident.id]: [next, ...(prev[liveResident.id] ?? [])],
    }))
  }, [liveResident, invoiceMap, paidIds, lang])

  // Same for the apartment selected in admin payments
  useEffect(() => {
    if (!selectedResident.id) return
    if (remainingBalance(selectedResident) <= 0 || selectedResident.rentAmount <= 0) return
    const existing = invoiceMap[selectedResident.id] ?? []
    const hasOpen = existing.some(
      (inv) => inv.status !== 'paid' && !paidIds.includes(inv.id),
    )
    if (hasOpen) return
    const next = buildInstallmentInvoice(selectedResident, lang)
    if (!next) return
    if (existing.some((inv) => inv.id === next.id)) return
    setInvoiceMap((prev) => ({
      ...prev,
      [selectedResident.id]: [next, ...(prev[selectedResident.id] ?? [])],
    }))
  }, [selectedResident, invoiceMap, paidIds, lang])

  const adminBalance = useMemo(() => {
    const incoming = payments
      .filter((p) => p.status === 'settled' || p.status === 'partial')
      .reduce((sum, p) => sum + (p.confirmedAmount ?? p.amount), 0)
    return adminStats.accountBalance + incoming
  }, [payments])

  const pendingPayments = useMemo(
    () => payments.filter((p) => p.status === 'pending_review'),
    [payments],
  )

  function invoiceHasPendingPayment(invoiceId: string) {
    return payments.some((p) => p.invoiceId === invoiceId && p.status === 'pending_review')
  }

  const adminResidentInvoices = useMemo(() => {
    const base = (invoiceMap[selectedResidentId] ?? []).map((inv) => ({
      ...(paidIds.includes(inv.id) ? { ...inv, status: 'paid' as const } : inv),
      extensionDays: invoiceExtensions[inv.id] ?? inv.extensionDays ?? 0,
    }))
    return applyDueDayToInvoices(base, selectedResident.rentDueDay, lang)
  }, [selectedResidentId, selectedResident.rentDueDay, invoiceMap, paidIds, invoiceExtensions, lang])

  const adminResidentTickets = ticketMap[selectedResidentId] ?? []

  const adminResidentPayments = payments.filter((p) => p.residentId === selectedResidentId)

  useEffect(() => {
    setDueDayDraft(String(selectedResident.rentDueDay))
    setScheduleDraft(selectedResident.rentSchedule)
    setContractDraft(String(selectedResident.contractTotal))
    setPaidDraft(String(selectedResident.amountPaid))
    setInstallmentDraft(String(selectedResident.rentAmount))
  }, [
    selectedResident.id,
    selectedResident.rentDueDay,
    selectedResident.rentSchedule,
    selectedResident.contractTotal,
    selectedResident.amountPaid,
    selectedResident.rentAmount,
  ])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, humanMode])

  useEffect(() => {
    staffChatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [staffMessages])

  useEffect(() => {
    setStaffMessages((prev) => {
      if (prev.length !== 1 || prev[0]?.id !== 'staff-w0') return prev
      return [{ ...prev[0], text: staffWelcomeMessage(lang) }]
    })
  }, [lang])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 2800)
    return () => clearTimeout(timer)
  }, [toast])

  function saveRentPlan() {
    const day = Math.min(28, Math.max(1, Number(dueDayDraft) || 1))
    const contractTotal = Math.max(0, Number(contractDraft) || 0)
    const amountPaid = Math.max(0, Math.min(contractTotal, Number(paidDraft) || 0))
    const rentAmount = Math.max(
      0,
      Number(installmentDraft) || suggestInstallment(contractTotal, scheduleDraft),
    )
    const updated: Resident = {
      ...selectedResident,
      rentDueDay: day,
      rentSchedule: scheduleDraft,
      contractTotal,
      amountPaid,
      rentAmount,
    }
    setResidentList((prev) =>
      prev.map((r) => (r.id === selectedResidentId ? updated : r)),
    )
    ensureInstallmentInvoiceFor(updated)
    showToast(tr('rentPlanSaved'))
  }

  /** Create a current-period invoice when rent remains but no unpaid invoice exists. */
  function ensureInstallmentInvoiceFor(resident: Resident) {
    if (remainingBalance(resident) <= 0 || resident.rentAmount <= 0) return
    const existing = invoiceMap[resident.id] ?? []
    const hasOpen = existing.some(
      (inv) => inv.status !== 'paid' && !paidIds.includes(inv.id),
    )
    if (hasOpen) return
    const next = buildInstallmentInvoice(resident, lang)
    if (!next) return
    if (existing.some((inv) => inv.id === next.id)) return
    setInvoiceMap((prev) => ({
      ...prev,
      [resident.id]: [next, ...(prev[resident.id] ?? [])],
    }))
  }

  function saveResidentLoginPin(phone: string, pin: string) {
    if (session?.role !== 'admin' || session.staffTier !== 'admin') {
      showToast(tr('residentPinAdminOnly'))
      return
    }
    const resident = residentList.find((r) => r.id === selectedResidentId)
    if (!resident) return
    const err = setResidentPin(selectedResidentId, phone, pin, resident.name)
    if (err) {
      showToast(tr(err))
      return
    }
    setResidentList((prev) =>
      prev.map((r) => (r.id === selectedResidentId ? { ...r, phone, pin } : r)),
    )
    showToast(tr('loginPinSaved'))
  }

  function clearResidentLogin() {
    if (session?.role !== 'admin' || session.staffTier !== 'admin') {
      showToast(tr('residentPinAdminOnly'))
      return
    }
    if (!selectedResidentId) return
    clearResidentCredentials(selectedResidentId)
    setResidentList((prev) =>
      prev.map((r) => (r.id === selectedResidentId ? { ...r, phone: '', pin: '' } : r)),
    )
    showToast(tr('loginCleared'))
  }

  function registerNewResident(input: {
    name: string
    phone: string
    pin: string
    buildingNumber: string
    apartment: string
  }) {
    const id = `r-${Date.now()}`
    const err = registerResidentAccount({
      name: input.name,
      phone: input.phone,
      pin: input.pin,
      residentId: id,
    })
    if (err) {
      showToast(tr(err))
      return
    }
    const next: Resident = {
      id,
      name: input.name,
      phone: input.phone,
      pin: input.pin,
      building: '',
      buildingNumber: input.buildingNumber || '',
      apartment: input.apartment || '',
      floor: 1,
      parking: '—',
      leaseEnd: '',
      rentAmount: 0,
      currency: 'AED',
      rentDueDay: 5,
      rentSchedule: 'monthly',
      contractTotal: 0,
      amountPaid: 0,
      status: 'active',
    }
    setResidentList((prev) => [...prev, next])
    setInvoiceMap((prev) => ({ ...prev, [id]: [] }))
    setTicketMap((prev) => ({ ...prev, [id]: [] }))
    setSelectedResidentId(id)
    showToast(tr('registerSaved'))
  }

  function updateResidentInfo(input: {
    name: string
    phone: string
    email: string
    building: string
    buildingNumber: string
    apartment: string
    floor: number
    parking: string
    occupants: number
    moveIn: string
    leaseEnd: string
    status: 'active' | 'arrears' | 'notice'
  }) {
    const resident = residentList.find((r) => r.id === selectedResidentId)
    if (!resident) return
    const name = input.name.trim() || resident.name
    const phone = input.phone.trim() || resident.phone
    const err = setResidentPin(selectedResidentId, phone, resident.pin, name)
    if (err) {
      showToast(tr(err))
      return
    }
    setResidentList((prev) =>
      prev.map((r) =>
        r.id === selectedResidentId
          ? {
              ...r,
              name,
              phone,
              email: input.email.trim() || undefined,
              building: input.building.trim() || r.building,
              buildingNumber: input.buildingNumber.trim() || r.buildingNumber,
              apartment: input.apartment.trim() || r.apartment,
              floor: Number.isFinite(input.floor) ? input.floor : r.floor,
              parking: input.parking.trim() || r.parking,
              occupants: Number.isFinite(input.occupants) ? input.occupants : r.occupants,
              moveIn: input.moveIn.trim() || r.moveIn,
              leaseEnd: input.leaseEnd.trim() || r.leaseEnd,
              status: input.status,
            }
          : r,
      ),
    )
    showToast(tr('apartmentUpdated'))
  }

  function clearApartmentInfo() {
    const resident = residentList.find((r) => r.id === selectedResidentId)
    if (!resident) return
    const invoiceIds = (invoiceMap[selectedResidentId] ?? []).map((inv) => inv.id)
    clearResidentCredentials(selectedResidentId)
    setResidentList((prev) =>
      prev.map((r) =>
        r.id === selectedResidentId
          ? {
              ...r,
              name: '',
              phone: '',
              pin: '',
              email: undefined,
              parking: '',
              occupants: undefined,
              moveIn: undefined,
              leaseEnd: '',
              rentAmount: 0,
              rentDueDay: 1,
              rentSchedule: 'monthly',
              contractTotal: 0,
              amountPaid: 0,
              status: 'active',
            }
          : r,
      ),
    )
    setInvoiceMap((prev) => {
      const next = { ...prev }
      delete next[selectedResidentId]
      return next
    })
    if (invoiceIds.length > 0) {
      setInvoiceExtensions((prev) => {
        const next = { ...prev }
        for (const id of invoiceIds) delete next[id]
        return next
      })
      setPaidIds((prev) => prev.filter((id) => !invoiceIds.includes(id)))
    }
    showToast(tr('apartmentCleared'))
  }

  function openCheckout(id: string) {
    if (invoiceHasPendingPayment(id)) {
      showToast(
        lang === 'ar'
          ? 'هذا التحويل قيد المراجعة من الإدارة'
          : 'This payment is already pending admin review',
      )
      return
    }
    setCheckoutInvoiceId(id)
    setBankProof(null)
  }

  function closeCheckout() {
    setCheckoutInvoiceId(null)
    setPaying(false)
    setBankProof(null)
  }

  function clearBankProof() {
    setBankProof(null)
  }

  function setBankProofFromFile(file: File | null) {
    if (!file) {
      setBankProof(null)
      return
    }
    if (!file.type.startsWith('image/')) {
      showToast(lang === 'ar' ? 'يرجى إرفاق صورة فقط' : 'Please attach an image file')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      showToast(lang === 'ar' ? 'حجم الصورة كبير جداً (حد أقصى 8 ميغابايت)' : 'Image is too large (max 8 MB)')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : ''
      if (!dataUrl) return
      setBankProof({ name: file.name, dataUrl })
    }
    reader.readAsDataURL(file)
  }

  function extendInvoiceDueDate(invoiceId: string, days = 3) {
    setInvoiceExtensions((prev) => ({
      ...prev,
      [invoiceId]: (prev[invoiceId] ?? 0) + days,
    }))
    showToast(
      lang === 'ar'
        ? `تم تمديد موعد الاستحقاق ${days} أيام`
        : `Due date extended by ${days} days`,
    )
  }

  function saveBankSettings(settings: BankAccountSettings) {
    const next = normalizeBankSettings(settings)
    if (!isBankConfigured(next)) {
      showToast(tr('bankSettingsIncomplete'))
      return
    }
    if (!writeBankSettings(next)) {
      showToast(tr('bankSettingsSaveFailed'))
      return
    }
    setBankSettings(next)
    showToast(tr('bankSettingsSaved'))
  }

  function keywordsFromContact(role: string, name: string, category: string) {
    const raw = `${role} ${name} ${category}`.toLowerCase()
    const parts = raw
      .split(/[^a-z0-9\u0600-\u06ff]+/i)
      .map((p) => p.trim())
      .filter((p) => p.length >= 2)
    return [...new Set(parts)]
  }

  function addServiceContact(
    input: Omit<ServiceContact, 'id' | 'keywords' | 'hours' | 'notes'> & { keywords?: string[] },
  ) {
    const role = input.role.trim()
    const name = input.name.trim()
    const phone = input.phone.trim()
    if (!role || !phone) {
      showToast(tr('serviceContactIncomplete'))
      return
    }
    const category = input.category.trim() || role
    const whatsapp = (input.whatsapp ?? '').trim() || phone
    setServiceDirectory((prev) => [
      ...prev,
      {
        id: `svc-${Date.now()}`,
        role,
        name: name || role,
        phone,
        category,
        notes: '',
        hours: '',
        whatsapp,
        keywords: input.keywords?.length
          ? input.keywords
          : keywordsFromContact(role, name || role, category),
      },
    ])
    showToast(tr('serviceContactSaved'))
  }

  function updateServiceContact(id: string, input: Partial<Omit<ServiceContact, 'id'>>) {
    setServiceDirectory((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c
        const next = {
          ...c,
          ...input,
          role: input.role?.trim() ?? c.role,
          name: input.name?.trim() ?? c.name,
          phone: input.phone?.trim() ?? c.phone,
          category: input.category?.trim() ?? c.category,
          whatsapp: (input.whatsapp ?? c.whatsapp ?? '').trim() || (input.phone?.trim() ?? c.phone),
          hours: input.hours ?? c.hours,
          notes: '',
        }
        return {
          ...next,
          keywords:
            input.keywords ?? keywordsFromContact(next.role, next.name, next.category),
        }
      }),
    )
    showToast(tr('serviceContactSaved'))
  }

  function removeServiceContact(id: string) {
    setServiceDirectory((prev) => prev.filter((c) => c.id !== id))
    showToast(tr('serviceContactRemoved'))
  }

  function completePayment(e: FormEvent) {
    e.preventDefault()
    if (!checkoutInvoice || !liveResident.id) return
    if (!isBankConfigured(bankSettings)) {
      showToast(tr('bankNotConfiguredResident'))
      return
    }
    if (invoiceHasPendingPayment(checkoutInvoice.id)) {
      showToast(
        lang === 'ar'
          ? 'هذا التحويل قيد المراجعة من الإدارة'
          : 'This payment is already pending admin review',
      )
      return
    }
    if (!bankProof) {
      showToast(
        lang === 'ar'
          ? 'أرفق لقطة شاشة للتحويل البنكي للمتابعة'
          : 'Attach a transfer screenshot to continue',
      )
      return
    }
    setPaying(true)
    window.setTimeout(() => {
      const unit = `${liveResident.buildingNumber}-${liveResident.apartment}`
      const paymentRef = buildPaymentRef(unit, checkoutInvoice.id)
      const record: PaymentRecord = {
        id: `PAY-${Date.now().toString().slice(-6)}`,
        invoiceId: checkoutInvoice.id,
        residentId: liveResident.id,
        residentName: liveResident.name,
        unit,
        amount: checkoutInvoice.amount,
        method: 'bank',
        status: 'pending_review',
        paidAt: `${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · ${nowLabel()}`,
        destination: bankSettings.accountName,
        paymentRef,
        transferProof: bankProof,
      }
      setPayments((prev) => [record, ...prev])

      setPaying(false)
      setCheckoutInvoiceId(null)
      setBankProof(null)
      showToast(
        lang === 'ar'
          ? `تم إرسال الإثبات للمراجعة. استخدم المرجع ${paymentRef} في التحويل`
          : `Proof submitted for review. Use reference ${paymentRef} on the transfer`,
      )
    }, 900)
  }

  function confirmBankPayment(paymentId: string, verifiedAmount: number, asPartial = false) {
    const payment = payments.find((p) => p.id === paymentId)
    if (!payment || payment.status !== 'pending_review') return
    const verified = Math.max(0, Number(verifiedAmount) || 0)
    if (verified <= 0) {
      showToast(lang === 'ar' ? 'أدخل المبلغ المستلم من كشف الحساب' : 'Enter the amount received on the bank statement')
      return
    }
    const exact = amountsMatch(verified, payment.amount)
    if (!exact && !asPartial) {
      showToast(
        lang === 'ar'
          ? `المبلغ يجب أن يطابق الفاتورة (${payment.amount.toLocaleString()} درهم) أو أكّد كدفعة جزئية`
          : `Amount must match the invoice (AED ${payment.amount.toLocaleString()}) or confirm as partial`,
      )
      return
    }
    const nextStatus = exact ? ('settled' as const) : ('partial' as const)
    const reviewedAt = `${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · ${nowLabel()}`
    setPayments((prev) =>
      prev.map((p) =>
        p.id === paymentId
          ? {
              ...p,
              status: nextStatus,
              confirmedAmount: verified,
              reviewedAt,
              reviewNote: exact
                ? 'Approved after screenshot review'
                : `Partial: expected ${payment.amount}, received ${verified}`,
            }
          : p,
      ),
    )
    if (exact) {
      setPaidIds((prev) => (prev.includes(payment.invoiceId) ? prev : [...prev, payment.invoiceId]))
      setInvoiceMap((prev) => ({
        ...prev,
        [payment.residentId]: (prev[payment.residentId] ?? []).map((inv) =>
          inv.id === payment.invoiceId ? { ...inv, status: 'paid' as const } : inv,
        ),
      }))
    }
    setResidentList((prev) =>
      prev.map((r) =>
        r.id === payment.residentId
          ? { ...r, amountPaid: Math.min(r.contractTotal, r.amountPaid + verified) }
          : r,
      ),
    )
    showToast(
      exact
        ? lang === 'ar'
          ? 'تم تأكيد الدفع — المبلغ مطابق'
          : 'Payment confirmed — amount matches'
        : lang === 'ar'
          ? 'تم تسجيل دفعة جزئية — الفاتورة ما زالت مستحقة'
          : 'Partial payment recorded — invoice remains due',
    )
  }

  function rejectBankPayment(paymentId: string, note?: string) {
    const payment = payments.find((p) => p.id === paymentId)
    if (!payment || payment.status !== 'pending_review') return
    const reviewedAt = `${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · ${nowLabel()}`
    setPayments((prev) =>
      prev.map((p) =>
        p.id === paymentId
          ? {
              ...p,
              status: 'rejected' as const,
              reviewedAt,
              reviewNote: note?.trim() || 'Rejected — amount or proof could not be verified',
            }
          : p,
      ),
    )
    showToast(lang === 'ar' ? 'تم رفض التحويل — الفاتورة ما زالت مستحقة' : 'Transfer rejected — invoice remains due')
  }

  function adminRecordPayment(invoiceId: string) {
    const invoice = adminResidentInvoices.find((inv) => inv.id === invoiceId)
    if (!invoice || invoice.status === 'paid') return
    if (invoiceHasPendingPayment(invoiceId)) {
      showToast(
        lang === 'ar'
          ? 'هذا التحويل قيد المراجعة — أكّده من قائمة الانتظار'
          : 'This payment is pending review — confirm it from the pending list',
      )
      return
    }
    const resident = selectedResident
    const unit = unitCodeLabel(resident)
    const paidAt = `${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · ${nowLabel()}`
    const record: PaymentRecord = {
      id: `PAY-${Date.now().toString().slice(-6)}`,
      invoiceId,
      residentId: resident.id,
      residentName: resident.name || unit,
      unit,
      amount: invoice.amount,
      method: 'bank',
      status: 'settled',
      paidAt,
      destination: bankSettings.accountName || 'Building account',
      paymentRef: buildPaymentRef(unit, invoiceId),
      confirmedAmount: invoice.amount,
      reviewedAt: paidAt,
      reviewNote: lang === 'ar' ? 'سجّلته الإدارة' : 'Recorded by admin',
    }
    setPayments((prev) => [record, ...prev])
    setPaidIds((prev) => (prev.includes(invoiceId) ? prev : [...prev, invoiceId]))
    setInvoiceMap((prev) => ({
      ...prev,
      [resident.id]: (prev[resident.id] ?? []).map((inv) =>
        inv.id === invoiceId ? { ...inv, status: 'paid' as const } : inv,
      ),
    }))
    setResidentList((prev) =>
      prev.map((r) =>
        r.id === resident.id
          ? { ...r, amountPaid: Math.min(r.contractTotal, r.amountPaid + invoice.amount) }
          : r,
      ),
    )
    setPaidDraft((prev) => {
      const next = Math.min(
        Number(contractDraft) || resident.contractTotal,
        (Number(prev) || 0) + invoice.amount,
      )
      return String(next)
    })
    showToast(
      lang === 'ar'
        ? `تم تسجيل الدفع · ${formatMoney(invoice.amount)}`
        : `Payment recorded · ${formatMoney(invoice.amount)}`,
    )
  }

  function createTicket(e: FormEvent) {
    e.preventDefault()
    if (!ticketTitle.trim() || !liveResident.id) return
    const residentTickets = ticketMap[liveResident.id] ?? []
    const next: Ticket = {
      id: `TK-${190 + residentTickets.length}`,
      title: ticketTitle.trim(),
      category: ticketCategory,
      status: 'open',
      created: lang === 'ar' ? 'اليوم' : 'Today',
      note:
        ticketNote.trim() ||
        (lang === 'ar' ? 'أُرسل عبر بوابة الساكن' : 'Submitted via resident portal'),
    }
    setTicketMap((prev) => ({
      ...prev,
      [liveResident.id]: [next, ...(prev[liveResident.id] ?? [])],
    }))
    setTicketTitle('')
    setTicketNote('')
    showToast(tr('ticketCreated'))
  }

  function escalateToHuman() {
    const firstName = liveResident.name.split(' ')[0] || liveResident.name || 'there'
    const openTicket = tickets.find((t) => t.status === 'open' || t.status === 'in_progress')
    const ticketNote =
      openTicket != null
        ? lang === 'ar'
          ? ` وتذكرة «${openTicket.title}» المفتوحة.`
          : ` and your open ticket “${openTicket.title}”.`
        : lang === 'ar'
          ? '.'
          : '.'
    setHumanMode(true)
    setMessages((prev) => [
      ...prev,
      {
        id: `s-${Date.now()}`,
        role: 'system',
        text:
          lang === 'ar'
            ? 'تم التحويل إلى مايا · دعم المبنى · تمت مشاركة السياق (الوحدة، الفواتير، التذاكر)'
            : 'Handed off to Maya · Building Support · context shared (unit, invoices, open tickets)',
        time: nowLabel(),
      },
      {
        id: `a-${Date.now()}`,
        role: 'agent',
        text:
          lang === 'ar'
            ? `مرحباً ${firstName}، معك مايا. أرى شقة ${liveResident.apartment} في ${liveResident.building || 'مبناك'}${ticketNote} كيف أقدر أساعدك؟`
            : `Hi ${firstName}, Maya here. I can see Apt ${liveResident.apartment} in ${liveResident.building || 'your building'}${ticketNote} How can I help?`,
        time: nowLabel(),
      },
    ])
  }

  function sendStaffChat(text: string) {
    const trimmed = text.trim()
    if (!trimmed || staffAnalyzing) return
    const userMsg: ChatMessage = {
      id: `staff-u-${Date.now()}`,
      role: 'user',
      text: trimmed,
      time: nowLabel(),
    }
    setStaffMessages((prev) => [...prev, userMsg])
    setStaffChatInput('')

    const ctx = {
      payments,
      pendingPayments,
      invoiceMap,
      residentList,
      paidIds,
    }
    const ocrTargets = resolveStaffOcrTargets(trimmed, ctx)
    const thinkingId = `staff-ai-${Date.now()}`

    if (ocrTargets.length > 0) {
      setStaffAnalyzing(true)
      setStaffMessages((prev) => [
        ...prev,
        {
          id: thinkingId,
          role: 'ai',
          text: tr('staffScanningScreenshot'),
          time: nowLabel(),
        },
      ])
    }

    void (async () => {
      try {
        let replyText = staffAiReply(trimmed, lang, ctx)

        if (ocrTargets.length > 0) {
          const givenBankRef = extractBankReference(trimmed)
          const scans: string[] = []
          for (const payment of ocrTargets) {
            if (!payment.transferProof) continue
            const ocr = await recognizeTransferProof(payment.transferProof.dataUrl, payment.amount)
            scans.push(formatScreenshotAnalysis(ocr, payment, lang, givenBankRef))
          }
          if (scans.length > 0) {
            replyText += `\n\n${scans.join('\n\n')}`
          }
        }

        setStaffMessages((prev) => {
          const withoutThinking =
            ocrTargets.length > 0 ? prev.filter((m) => m.id !== thinkingId) : prev
          return [
            ...withoutThinking,
            {
              id: `staff-ai-${Date.now()}`,
              role: 'ai',
              text: replyText,
              time: nowLabel(),
            },
          ]
        })
      } catch {
        setStaffMessages((prev) => {
          const withoutThinking =
            ocrTargets.length > 0 ? prev.filter((m) => m.id !== thinkingId) : prev
          return [
            ...withoutThinking,
            {
              id: `staff-ai-${Date.now()}`,
              role: 'ai',
              text: tr('staffScanFailed'),
              time: nowLabel(),
            },
          ]
        })
      } finally {
        setStaffAnalyzing(false)
      }
    })()
  }

  function sendChat(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
      time: nowLabel(),
    }
    setMessages((prev) => [...prev, userMsg])
    setChatInput('')

    if (humanMode) {
      window.setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'agent',
            text:
              lang === 'ar'
                ? 'تم تسجيل رسالتك. سيرد فريق إدارة المبنى خلال ساعات العمل.'
                : 'Your message has been recorded. Building management will respond during office hours.',
            time: nowLabel(),
          },
        ])
      }, 700)
      return
    }

    const reply = aiReply(trimmed, lang, serviceDirectory)
    window.setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: 'ai',
          text: reply.text,
          time: nowLabel(),
          contactPhone: reply.contact?.phone,
          contactLabel: reply.contact ? `${reply.contact.role} · ${reply.contact.name}` : undefined,
        },
      ])
      if (reply.escalate) escalateToHuman()
    }, 550)
  }

  function resetHumanMode() {
    setHumanMode(false)
  }

  function addAvailableListing(input: Omit<AvailableApartment, 'id'>) {
    const id = `avail-${Date.now()}`
    setListings((prev) => [...prev, { ...input, id }])
    showToast(tr('listingSaved'))
  }

  function updateAvailableListing(id: string, input: Partial<AvailableApartment>) {
    setListings((prev) => prev.map((item) => (item.id === id ? { ...item, ...input } : item)))
    showToast(tr('listingSaved'))
  }

  function removeAvailableListing(id: string) {
    setListings((prev) => prev.filter((item) => item.id !== id))
    showToast(tr('listingRemoved'))
  }

  return (
    <DataContext.Provider
      value={{
        residentList,
        tickets,
        payments,
        paidIds,
        messages,
        humanMode,
        selectedResidentId,
        setSelectedResidentId,
        dueDayDraft,
        setDueDayDraft,
        scheduleDraft,
        setScheduleDraft,
        contractDraft,
        setContractDraft,
        paidDraft,
        setPaidDraft,
        installmentDraft,
        setInstallmentDraft,
        ticketTitle,
        setTicketTitle,
        ticketCategory,
        setTicketCategory,
        ticketNote,
        setTicketNote,
        checkoutInvoiceId,
        bankProof,
        setBankProofFromFile,
        clearBankProof,
        paying,
        pendingPayments,
        invoiceHasPendingPayment,
        confirmBankPayment,
        rejectBankPayment,
        adminRecordPayment,
        toast,
        chatInput,
        setChatInput,
        chatEndRef,
        showToast,
        visibleInvoices,
        dueInvoice,
        checkoutInvoice,
        adminBalance,
        selectedResident,
        liveResident,
        adminResidentInvoices,
        adminResidentTickets,
        adminResidentPayments,
        openCheckout,
        closeCheckout,
        extendInvoiceDueDate,
        completePayment,
        createTicket,
        escalateToHuman,
        sendChat,
        staffMessages,
        staffChatInput,
        setStaffChatInput,
        staffChatEndRef,
        sendStaffChat,
        staffAnalyzing,
        saveRentPlan,
        saveResidentLoginPin,
        clearResidentLogin,
        registerNewResident,
        updateResidentInfo,
        clearApartmentInfo,
        resetHumanMode,
        syncWelcomeMessage,
        availableListings: listings,
        addAvailableListing,
        updateAvailableListing,
        removeAvailableListing,
        bankSettings,
        bankConfigured: isBankConfigured(bankSettings),
        saveBankSettings,
        serviceDirectory,
        addServiceContact,
        updateServiceContact,
        removeServiceContact,
      }}
    >
      {children}
    </DataContext.Provider>
  )
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
