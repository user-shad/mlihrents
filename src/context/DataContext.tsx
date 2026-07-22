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
import type { StaffCapability } from '../lib/staffPermissions'
import { staffCan } from '../lib/staffPermissions'
import {
  adminStats,
  aiReply,
  type ResidentAiContext,
  staffAiReply,
  staffWelcomeMessage,
  resolveStaffOcrTargets,
  extractBankReference,
  applyDueDayToInvoices,
  AvailableApartment,
  blankResident,
  ChatMessage,
  formatIsoDueDate,
  Invoice,
  isPastDue,
  isValidIsoDate,
  nowLabel,
  PaymentRecord,
  periodLabelFromIso,
  rentDueDayFromIso,
  residentAfterInstallmentPaid,
  resolveNextDueDateIso,
  amountsMatch,
  buildPaymentRef,
  normalizeBankReference,
  findDuplicateBankReference,
  isValidBankReference,
  buildInstallmentInvoice,
  buildPaymentStatusWhatsAppMessageBilingual,
  canCollectRent,
  formatMoney,
  isUnitOccupied,
  mergeAvailableListings,
  normalizeUnitCode,
  apartmentBuildingLetter,
  remainingBalance,
  unitCodeLabel,
  RentSchedule,
  Resident,
  type PaymentNotifyKind,
  apartmentUnits,
  buildEmptyApartment,
  migrateResident,
  normalizeRentSchedule,
  normalizePhone,
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
  bankRefsMatch,
} from '../lib/transferProofOcr'
import {
  flushCloudSaveNow,
  markLocalMutation,
  onCloudOps,
  queueCloudOps,
  type PortalOps,
  writeLocalOps,
} from '../lib/cloudSync'
import { attachProofsToOps, readLocalProofs } from '../lib/localProofStore'
import { applyRemovedInvoices } from '../../lib/syncMerge'
import { siteLegal } from '../legal/siteLegal'
import { sendWhatsAppAuto } from '../lib/whatsappAuto'

const LEGACY_A1_TEST_ID = 'apt-a1'
const LEGACY_A1_TEST_INVOICE = 'INV-TEST-A1'

function invoiceIdKey(id: string) {
  return id.trim().toUpperCase()
}

function isRemovedInvoice(id: string, removedIds: string[]) {
  const key = invoiceIdKey(id)
  return removedIds.some((row) => invoiceIdKey(row) === key)
}

function residentIdKey(id: string) {
  return id.trim().toLowerCase()
}

function addRevokedResidentLogin(ids: string[], residentId: string): string[] {
  const key = residentIdKey(residentId)
  return ids.some((row) => residentIdKey(row) === key) ? ids : [...ids, key]
}

function removeRevokedResidentLogin(ids: string[], residentId: string): string[] {
  const key = residentIdKey(residentId)
  return ids.filter((row) => residentIdKey(row) !== key)
}

function mergeRemovedInvoiceIdList(existing: string[], invoiceIds: string[]): string[] {
  const next = new Set(existing.map(invoiceIdKey))
  for (const id of invoiceIds) next.add(invoiceIdKey(id))
  return [...next]
}

function isLegacyTestTenantA1(resident: Resident): boolean {
  if (resident.id !== LEGACY_A1_TEST_ID) return false
  const phone = resident.phone.replace(/\D/g, '')
  return (
    resident.name === 'Test Tenant A1' ||
    phone === '0501234567'
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
  const seedIds = new Set(apartmentUnits.map((u) => u.id))
  const seeded = apartmentUnits.map((seed) => {
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
  const extras = list.filter((r) => !seedIds.has(r.id))
  return [...seeded, ...extras]
}

function ensureSeedInvoices(map: Record<string, Invoice[]>): Record<string, Invoice[]> {
  return { ...map }
}

/** Drop open invoices when the apartment has no valid rent plan or nothing left to pay. */
function pruneStaleOpenInvoices(
  residentList: Resident[],
  invoiceMap: Record<string, Invoice[]>,
  paidIds: string[],
): Record<string, Invoice[]> {
  const byId = new Map(residentList.map((r) => [r.id, r]))
  const next: Record<string, Invoice[]> = {}
  for (const [residentId, invoices] of Object.entries(invoiceMap)) {
    const resident = byId.get(residentId)
    if (resident && canCollectRent(resident)) {
      next[residentId] = invoices
      continue
    }
    const kept = invoices.filter((inv) => inv.status === 'paid' || paidIds.includes(inv.id))
    if (kept.length > 0) next[residentId] = kept
  }
  return next
}

function normalizePersistedOps(parsed: PortalOps): PortalOps {
  const cleaned = stripLegacyTestData(parsed)
  const residentList = ensureSeedApartments(
    (cleaned.residentList ?? []).map((r) => migrateResident(r)),
  )
  const paidIds = cleaned.paidIds ?? []
  const removedInvoiceIds = cleaned.removedInvoiceIds ?? []
  const revokedResidentLogins = cleaned.revokedResidentLogins ?? []
  return {
    ...cleaned,
    residentList,
    paidIds,
    removedInvoiceIds,
    revokedResidentLogins,
    invoiceMap: applyRemovedInvoices(
      pruneStaleOpenInvoices(
        residentList,
        ensureSeedInvoices(cleaned.invoiceMap ?? {}),
        paidIds,
      ),
      removedInvoiceIds,
    ),
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
  nextDueDateDraft: string
  setNextDueDateDraft: (v: string) => void
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
  bankReferenceDraft: string
  setBankReferenceDraft: (v: string) => void
  setBankProofFromFile: (file: File | null) => void
  clearBankProof: () => void
  paying: boolean
  pendingPayments: PaymentRecord[]
  invoiceHasPendingPayment: (invoiceId: string) => boolean
  confirmBankPayment: (paymentId: string, verifiedAmount: number, asPartial?: boolean) => void
  rejectBankPayment: (paymentId: string, note?: string) => void
  /** Remove a payment record (and undo paid balance if it was settled) */
  deletePayment: (paymentId: string) => void
  /** Staff records that an invoice was paid (cash / confirmed transfer) */
  adminRecordPayment: (invoiceId: string) => void
  /** Remove an invoice and undo linked settled payments */
  removeInvoice: (invoiceId: string) => void
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
  invoiceMap: Record<string, Invoice[]>
  ticketMap: Record<string, Ticket[]>
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
    building: string
    buildingNumber: string
    apartment: string
    floor: number
    unitType: string
    nationality: string
    idNumber: string
    occupants: number
    leaseStart: string
    leaseEnd: string
    status: 'active' | 'arrears' | 'notice'
  }) => void
  clearApartmentInfo: () => void
  saveApartmentRecord: (
    input: {
      buildingNumber: string
      building: string
      apartment: string
      floor: number
      contractTotal: number
      amountPaid: number
      rentAmount: number
      rentSchedule: RentSchedule
      rentDueDay: number
      name: string
      phone: string
      pin: string
      parking: string
      leaseStart: string
      leaseEnd: string
      unitType: string
      nationality: string
      idNumber: string
      occupants: number
      status: 'active' | 'arrears' | 'notice'
    },
    residentId?: string,
  ) => void
  removeApartment: (residentId: string) => void
  resetHumanMode: () => void
  syncWelcomeMessage: () => void
  availableListings: AvailableApartment[]
  addAvailableListing: (input: Omit<AvailableApartment, 'id'>) => void
  updateAvailableListing: (id: string, input: Partial<AvailableApartment>) => void
  removeAvailableListing: (id: string) => void
  suppressVacantListing: (listing: AvailableApartment) => void
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
  const [nextDueDateDraft, setNextDueDateDraft] = useState('')
  const [scheduleDraft, setScheduleDraft] = useState<RentSchedule>(blankResident.rentSchedule)
  const [contractDraft, setContractDraft] = useState(String(blankResident.contractTotal))
  const [paidDraft, setPaidDraft] = useState(String(blankResident.amountPaid))
  const [installmentDraft, setInstallmentDraft] = useState(String(blankResident.rentAmount))
  const [ticketTitle, setTicketTitle] = useState('')
  const [ticketCategory, setTicketCategory] = useState('Plumbing')
  const [ticketNote, setTicketNote] = useState('')
  const [paidIds, setPaidIds] = useState<string[]>(() => bootOps.paidIds)
  const [removedInvoiceIds, setRemovedInvoiceIds] = useState<string[]>(
    () => bootOps.removedInvoiceIds ?? [],
  )
  const [revokedResidentLogins, setRevokedResidentLogins] = useState<string[]>(
    () => bootOps.revokedResidentLogins ?? [],
  )
  /** Extra days granted past the original due date, keyed by invoice id */
  const [invoiceExtensions, setInvoiceExtensions] = useState<Record<string, number>>(
    () => bootOps.invoiceExtensions,
  )
  const [checkoutInvoiceId, setCheckoutInvoiceId] = useState<string | null>(null)
  const [bankProof, setBankProof] = useState<{ name: string; dataUrl: string } | null>(null)
  const [bankReferenceDraft, setBankReferenceDraft] = useState('')
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
      const next = attachProofsToOps(normalizePersistedOps(remote), readLocalProofs())
      setResidentList(next.residentList)
      setListings(next.listings)
      setPayments(next.payments)
      setInvoiceMap(next.invoiceMap)
      setTicketMap(next.ticketMap)
      setInvoiceExtensions(next.invoiceExtensions)
      setPaidIds(next.paidIds)
      setRemovedInvoiceIds(next.removedInvoiceIds ?? [])
      setRevokedResidentLogins(next.revokedResidentLogins ?? [])
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
      removedInvoiceIds,
      revokedResidentLogins,
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
    removedInvoiceIds,
    revokedResidentLogins,
    bankSettings,
    serviceDirectory,
  ])

  function showToast(msg: string) {
    setToast(msg)
  }

  function pushOpsToCloud(overrides: Partial<PortalOps>) {
    markLocalMutation()
    const ops: PortalOps = {
      residentList,
      listings,
      payments,
      invoiceMap,
      ticketMap,
      invoiceExtensions,
      paidIds,
      removedInvoiceIds,
      revokedResidentLogins,
      bankSettings,
      serviceDirectory,
      ...overrides,
    }
    writeLocalOps(ops)
    return flushCloudSaveNow(ops)
  }

  function autoNotifyPaymentWhatsApp(payment: PaymentRecord, kind: PaymentNotifyKind) {
    const resident = residentList.find((r) => r.id === payment.residentId)
    const phone = resident?.phone?.trim() ?? ''
    if (!phone) return
    const message = buildPaymentStatusWhatsAppMessageBilingual(
      payment,
      kind,
      `${siteLegal.publicUrl}/resident`,
      siteLegal.brandName,
    )
    void sendWhatsAppAuto(phone, message).then((ok) => {
      if (ok) showToast(tr('whatsappAutoSent'))
    })
  }

  function denyStaff(capability: StaffCapability) {
    if (staffCan(session, capability)) return false
    showToast(tr('staffPermissionDenied'))
    return true
  }

  const liveResident = useMemo(() => {
    if (session?.residentId) {
      const found = residentList.find((r) => r.id === session.residentId)
      if (found) return found
    }
    return blankResident
  }, [session?.residentId, residentList])

  const selectedResident = residentList.find((r) => r.id === selectedResidentId) ?? blankResident

  const availableListings = useMemo(
    () => mergeAvailableListings(listings, residentList),
    [listings, residentList],
  )

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
    const base = (invoiceMap[liveResident.id] ?? [])
      .filter((inv) => !isRemovedInvoice(inv.id, removedInvoiceIds))
      .map((inv) => ({
        ...(paidIds.includes(inv.id) ? { ...inv, status: 'paid' as const } : inv),
        extensionDays: invoiceExtensions[inv.id] ?? inv.extensionDays ?? 0,
      }))
    return applyDueDayToInvoices(base, liveResident, lang)
  }, [invoiceMap, liveResident, paidIds, invoiceExtensions, removedInvoiceIds, lang])

  const dueInvoice = canCollectRent(liveResident)
    ? visibleInvoices.find((i) => i.status === 'due' || i.status === 'overdue')
    : undefined
  const checkoutInvoice = visibleInvoices.find((i) => i.id === checkoutInvoiceId) ?? null

  // Auto-create installment invoice so residents always have a Pay button when rent remains
  useEffect(() => {
    if (!liveResident.id) return
    if (remainingBalance(liveResident) <= 0 || liveResident.rentAmount <= 0) return
    const existing = invoiceMap[liveResident.id] ?? []
    const hasOpen = existing.some(
      (inv) =>
        !isRemovedInvoice(inv.id, removedInvoiceIds) &&
        inv.status !== 'paid' &&
        !paidIds.includes(inv.id),
    )
    if (hasOpen) return
    const next = buildInstallmentInvoice(liveResident, lang)
    if (!next) return
    if (existing.some((inv) => inv.id === next.id)) return
    if (isRemovedInvoice(next.id, removedInvoiceIds)) return
    setInvoiceMap((prev) => ({
      ...prev,
      [liveResident.id]: [next, ...(prev[liveResident.id] ?? [])],
    }))
  }, [liveResident, invoiceMap, paidIds, removedInvoiceIds, lang])

  // Same for the apartment selected in admin payments
  useEffect(() => {
    if (!selectedResident.id) return
    if (remainingBalance(selectedResident) <= 0 || selectedResident.rentAmount <= 0) return
    const existing = invoiceMap[selectedResident.id] ?? []
    const hasOpen = existing.some(
      (inv) =>
        !isRemovedInvoice(inv.id, removedInvoiceIds) &&
        inv.status !== 'paid' &&
        !paidIds.includes(inv.id),
    )
    if (hasOpen) return
    const next = buildInstallmentInvoice(selectedResident, lang)
    if (!next) return
    if (existing.some((inv) => inv.id === next.id)) return
    if (isRemovedInvoice(next.id, removedInvoiceIds)) return
    setInvoiceMap((prev) => ({
      ...prev,
      [selectedResident.id]: [next, ...(prev[selectedResident.id] ?? [])],
    }))
  }, [selectedResident, invoiceMap, paidIds, removedInvoiceIds, lang])

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
    const base = (invoiceMap[selectedResidentId] ?? [])
      .filter((inv) => !isRemovedInvoice(inv.id, removedInvoiceIds))
      .map((inv) => ({
      ...(paidIds.includes(inv.id) ? { ...inv, status: 'paid' as const } : inv),
      extensionDays: invoiceExtensions[inv.id] ?? inv.extensionDays ?? 0,
    }))
    return applyDueDayToInvoices(base, selectedResident, lang)
  }, [selectedResidentId, selectedResident, invoiceMap, paidIds, invoiceExtensions, removedInvoiceIds, lang])

  const adminResidentTickets = ticketMap[selectedResidentId] ?? []

  const adminResidentPayments = payments.filter(
    (p) => p.residentId === selectedResidentId && p.status !== 'deleted',
  )

  useEffect(() => {
    setNextDueDateDraft(resolveNextDueDateIso(selectedResident))
    setScheduleDraft(selectedResident.rentSchedule)
    setContractDraft(String(selectedResident.contractTotal))
    setPaidDraft(String(selectedResident.amountPaid))
    setInstallmentDraft(String(selectedResident.rentAmount))
  }, [
    selectedResident.id,
    selectedResident.rentDueDay,
    selectedResident.nextDueDateIso,
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

  function withSyncedOpenInvoices(
    map: Record<string, Invoice[]>,
    resident: Resident,
    paidIdList: string[],
  ) {
    const dueIso = resolveNextDueDateIso(resident)
    return {
      ...map,
      [resident.id]: (map[resident.id] ?? []).map((inv) => {
        if (inv.status === 'paid' || paidIdList.includes(inv.id)) return inv
        return {
          ...inv,
          dueDateIso: dueIso,
          dueDate: formatIsoDueDate(dueIso, lang),
          period: periodLabelFromIso(dueIso, lang),
          status: isPastDue(dueIso) ? ('overdue' as const) : ('due' as const),
        }
      }),
    }
  }

  function withInstallmentInvoiceIfNeeded(
    map: Record<string, Invoice[]>,
    resident: Resident,
    paidIdList: string[],
  ) {
    if (remainingBalance(resident) <= 0 || resident.rentAmount <= 0) return map
    const existing = map[resident.id] ?? []
    const hasOpen = existing.some(
      (inv) => inv.status !== 'paid' && !paidIdList.includes(inv.id),
    )
    if (hasOpen) return map
    const next = buildInstallmentInvoice(resident, lang)
    if (!next || existing.some((inv) => inv.id === next.id)) return map
    return { ...map, [resident.id]: [next, ...existing] }
  }

  function applyAdminPaidIncrease(
    resident: Resident,
    previousAmountPaid: number,
    nextAmountPaid: number,
    currentInvoiceMap: Record<string, Invoice[]>,
    currentPaidIds: string[],
    currentPayments: PaymentRecord[],
  ) {
    const delta = Math.max(0, nextAmountPaid - previousAmountPaid)
    if (delta <= 0) {
      return {
        resident: { ...resident, amountPaid: nextAmountPaid },
        invoiceMap: currentInvoiceMap,
        paidIds: currentPaidIds,
        payments: currentPayments,
      }
    }

    let remaining = delta
    let nextInvoiceMap = { ...currentInvoiceMap }
    let nextPaidIds = [...currentPaidIds]
    let nextPayments = [...currentPayments]
    const invoices = [...(nextInvoiceMap[resident.id] ?? [])]
    const unit = unitCodeLabel(resident)
    const paidAt = `${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · ${nowLabel()}`
    const reviewNote = lang === 'ar' ? 'سجّلته الإدارة' : 'Recorded by admin'

    const unpaid = invoices
      .map((inv, idx) => ({ inv, idx }))
      .filter(({ inv }) => inv.status !== 'paid' && !nextPaidIds.includes(inv.id))
      .sort((a, b) => (a.inv.dueDateIso ?? '').localeCompare(b.inv.dueDateIso ?? ''))

    for (const { inv, idx } of unpaid) {
      if (remaining < inv.amount) break
      remaining -= inv.amount
      invoices[idx] = { ...inv, status: 'paid' as const }
      if (!nextPaidIds.includes(inv.id)) nextPaidIds.push(inv.id)
      nextPayments = [
        {
          id: `PAY-${Date.now().toString().slice(-6)}-${inv.id.slice(-4)}`,
          invoiceId: inv.id,
          residentId: resident.id,
          residentName: resident.name || unit,
          unit,
          amount: inv.amount,
          method: 'bank' as const,
          status: 'settled' as const,
          paidAt,
          destination: bankSettings.accountName || 'Building account',
          paymentRef: buildPaymentRef(unit, inv.id),
          confirmedAmount: inv.amount,
          reviewedAt: paidAt,
          reviewNote,
        },
        ...nextPayments,
      ]
    }

    if (remaining > 0) {
      nextPayments = [
        {
          id: `PAY-${Date.now().toString().slice(-6)}`,
          invoiceId: '',
          residentId: resident.id,
          residentName: resident.name || unit,
          unit,
          amount: remaining,
          method: 'bank' as const,
          status: 'settled' as const,
          paidAt,
          destination: bankSettings.accountName || 'Building account',
          confirmedAmount: remaining,
          reviewedAt: paidAt,
          reviewNote,
        },
        ...nextPayments,
      ]
    }

    nextInvoiceMap = { ...nextInvoiceMap, [resident.id]: invoices }
    const nextResident = residentAfterInstallmentPaid({
      ...resident,
      amountPaid: nextAmountPaid,
    })

    return {
      resident: nextResident,
      invoiceMap: nextInvoiceMap,
      paidIds: nextPaidIds,
      payments: nextPayments,
    }
  }

  function saveRentPlan() {
    const nextDueDateIso = isValidIsoDate(nextDueDateDraft)
      ? nextDueDateDraft
      : resolveNextDueDateIso(selectedResident)
    const day = rentDueDayFromIso(nextDueDateIso)
    const contractTotal = Math.max(0, Number(contractDraft) || 0)
    const amountPaid = Math.max(0, Math.min(contractTotal, Number(paidDraft) || 0))
    const rentAmount = Math.max(
      0,
      Number(installmentDraft) || suggestInstallment(contractTotal, scheduleDraft),
    )
    const previousAmountPaid = selectedResident.amountPaid
    const updated: Resident = {
      ...selectedResident,
      rentDueDay: day,
      nextDueDateIso,
      rentSchedule: scheduleDraft,
      contractTotal,
      amountPaid,
      amountPaidManual: true,
      rentAmount,
    }
    let nextResidentList = residentList.map((r) =>
      r.id === selectedResidentId ? updated : r,
    )
    let nextInvoiceMap = { ...invoiceMap }
    let nextPaidIds = [...paidIds]
    let nextPayments = [...payments]
    let nextResident = updated

    if (amountPaid > previousAmountPaid) {
      const applied = applyAdminPaidIncrease(
        updated,
        previousAmountPaid,
        amountPaid,
        nextInvoiceMap,
        nextPaidIds,
        nextPayments,
      )
      nextResident = applied.resident
      nextInvoiceMap = applied.invoiceMap
      nextPaidIds = applied.paidIds
      nextPayments = applied.payments
      nextResidentList = residentList.map((r) =>
        r.id === selectedResidentId ? nextResident : r,
      )
    }

    if (!canCollectRent(nextResident)) {
      const existing = nextInvoiceMap[selectedResidentId] ?? []
      const kept = existing.filter(
        (inv) => inv.status === 'paid' || nextPaidIds.includes(inv.id),
      )
      if (kept.length > 0) nextInvoiceMap = { ...nextInvoiceMap, [selectedResidentId]: kept }
      else {
        const { [selectedResidentId]: _, ...rest } = nextInvoiceMap
        nextInvoiceMap = rest
      }
    } else {
      nextInvoiceMap = withSyncedOpenInvoices(nextInvoiceMap, nextResident, nextPaidIds)
      nextInvoiceMap = withInstallmentInvoiceIfNeeded(
        nextInvoiceMap,
        nextResident,
        nextPaidIds,
      )
    }

    setResidentList(nextResidentList)
    setInvoiceMap(nextInvoiceMap)
    setPaidIds(nextPaidIds)
    setPayments(nextPayments)
    setNextDueDateDraft(nextResident.nextDueDateIso ?? resolveNextDueDateIso(nextResident))
    setPaidDraft(String(nextResident.amountPaid))
    void pushOpsToCloud({
      residentList: nextResidentList,
      invoiceMap: nextInvoiceMap,
      paidIds: nextPaidIds,
      payments: nextPayments,
    }).then((synced) => {
      if (!synced) showToast(tr('paymentSyncFailed'))
    })
    showToast(tr('rentPlanSaved'))
  }

  function saveResidentLoginPin(phone: string, pin: string) {
    if (session?.role !== 'admin') return
    const resident = residentList.find((r) => r.id === selectedResidentId)
    if (!resident) return
    const err = setResidentPin(selectedResidentId, phone, pin, resident.name)
    if (err) {
      showToast(tr(err))
      return
    }
    const nextRevoked = removeRevokedResidentLogin(revokedResidentLogins, selectedResidentId)
    const nextResidentList = residentList.map((r) =>
      r.id === selectedResidentId ? { ...r, phone, pin } : r,
    )
    setRevokedResidentLogins(nextRevoked)
    setResidentList(nextResidentList)
    void pushOpsToCloud({
      residentList: nextResidentList,
      revokedResidentLogins: nextRevoked,
    }).then((synced) => {
      if (!synced) showToast(tr('paymentSyncFailed'))
    })
    showToast(tr('loginPinSaved'))
  }

  function clearResidentLogin() {
    if (session?.role !== 'admin') return
    if (!selectedResidentId) return
    clearResidentCredentials(selectedResidentId)
    const nextRevoked = addRevokedResidentLogin(revokedResidentLogins, selectedResidentId)
    const nextResidentList = residentList.map((r) =>
      r.id === selectedResidentId ? { ...r, phone: '', pin: '' } : r,
    )
    setRevokedResidentLogins(nextRevoked)
    setResidentList(nextResidentList)
    void pushOpsToCloud({
      residentList: nextResidentList,
      revokedResidentLogins: nextRevoked,
    }).then((synced) => {
      if (!synced) showToast(tr('paymentSyncFailed'))
    })
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
      phone: normalizePhone(input.phone) || input.phone.trim(),
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
      rentSchedule: 1,
      contractTotal: 0,
      amountPaid: 0,
      status: 'active',
    }
    setResidentList((prev) => [...prev, next])
    setInvoiceMap((prev) => ({ ...prev, [id]: [] }))
    setTicketMap((prev) => ({ ...prev, [id]: [] }))
    setSelectedResidentId(id)
    const nextRevoked = removeRevokedResidentLogin(revokedResidentLogins, id)
    const nextResidentList = [...residentList, next]
    setRevokedResidentLogins(nextRevoked)
    void pushOpsToCloud({
      residentList: nextResidentList,
      invoiceMap: { ...invoiceMap, [id]: [] },
      ticketMap: { ...ticketMap, [id]: [] },
      revokedResidentLogins: nextRevoked,
    }).then((synced) => {
      if (!synced) showToast(tr('paymentSyncFailed'))
    })
    showToast(tr('registerSaved'))
  }

  function updateResidentInfo(input: {
    name: string
    phone: string
    building: string
    buildingNumber: string
    apartment: string
    floor: number
    unitType: string
    nationality: string
    idNumber: string
    occupants: number
    leaseStart: string
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
              building: input.building.trim() || r.building,
              buildingNumber: input.buildingNumber.trim() || r.buildingNumber,
              apartment: input.apartment.trim() || r.apartment,
              floor: Number.isFinite(input.floor) ? input.floor : r.floor,
              unitType: input.unitType.trim() || undefined,
              nationality: input.nationality.trim() || undefined,
              idNumber: input.idNumber.trim() || undefined,
              occupants: Number.isFinite(input.occupants) ? input.occupants : r.occupants,
              leaseStart: input.leaseStart.trim() || r.leaseStart,
              leaseEnd: input.leaseEnd.trim() || r.leaseEnd,
              status: input.status,
            }
          : r,
      ),
    )
    showToast(tr('apartmentUpdated'))
  }

  function clearApartmentInfo() {
    if (denyStaff('clear_apartment')) return
    const resident = residentList.find((r) => r.id === selectedResidentId)
    if (!resident) return
    const invoiceIds = (invoiceMap[selectedResidentId] ?? []).map((inv) => inv.id)
    clearResidentCredentials(selectedResidentId)
    const nextRevoked = addRevokedResidentLogin(revokedResidentLogins, selectedResidentId)
    const nextRemovedInvoiceIds = mergeRemovedInvoiceIdList(removedInvoiceIds, invoiceIds)
    const nextResidentList = residentList.map((r) =>
      r.id === selectedResidentId
        ? {
            ...r,
            name: '',
            phone: '',
            pin: '',
            parking: '',
            occupants: undefined,
            leaseStart: undefined,
            leaseEnd: '',
            rentAmount: 0,
            rentDueDay: 1,
            rentSchedule: blankResident.rentSchedule,
            contractTotal: 0,
            amountPaid: 0,
            status: 'active' as const,
          }
        : r,
    )
    const nextInvoiceMap = { ...invoiceMap }
    delete nextInvoiceMap[selectedResidentId]
    const nextExtensions = { ...invoiceExtensions }
    for (const id of invoiceIds) delete nextExtensions[id]
    const nextPaidIds = paidIds.filter((id) => !invoiceIds.includes(id))
    const nextPayments = payments.filter((p) => p.residentId !== selectedResidentId)

    setRevokedResidentLogins(nextRevoked)
    setResidentList(nextResidentList)
    setInvoiceMap(nextInvoiceMap)
    setInvoiceExtensions(nextExtensions)
    setPaidIds(nextPaidIds)
    setPayments(nextPayments)
    setRemovedInvoiceIds(nextRemovedInvoiceIds)
    void pushOpsToCloud({
      residentList: nextResidentList,
      invoiceMap: nextInvoiceMap,
      invoiceExtensions: nextExtensions,
      paidIds: nextPaidIds,
      payments: nextPayments,
      removedInvoiceIds: nextRemovedInvoiceIds,
      revokedResidentLogins: nextRevoked,
    }).then((synced) => {
      if (!synced) showToast(tr('paymentSyncFailed'))
    })
    showToast(tr('apartmentCleared'))
  }

  function saveApartmentRecord(
    input: {
      buildingNumber: string
      building: string
      apartment: string
      floor: number
      contractTotal: number
      amountPaid: number
      rentAmount: number
      rentSchedule: RentSchedule
      rentDueDay: number
      name: string
      phone: string
      pin: string
      parking: string
      leaseStart: string
      leaseEnd: string
      unitType: string
      nationality: string
      idNumber: string
      occupants: number
      status: 'active' | 'arrears' | 'notice'
    },
    residentId?: string,
  ) {
    if (denyStaff('manage_apartments')) return
    markLocalMutation()

    const apartmentCode = input.apartment.trim()
    if (!apartmentCode) {
      showToast(tr('listingApartmentRequired'))
      return
    }

    const contractTotal = Math.max(0, Number(input.contractTotal) || 0)
    const amountPaid = Math.max(0, Math.min(contractTotal, Number(input.amountPaid) || 0))
    const rentAmount = Math.max(0, Number(input.rentAmount) || 0)
    const rentDueDay = Math.min(28, Math.max(1, Number(input.rentDueDay) || 1))
    const letter = input.buildingNumber.trim().toUpperCase() || apartmentBuildingLetter(apartmentCode) || 'A'
    const parsed = apartmentCode.match(/^([A-Da-d])\s*-?\s*(\d+)$/i)
    const unitNum = parsed ? Number(parsed[2]) : 0
    const normalizedApartment = parsed ? `${letter}${unitNum}` : apartmentCode
    const normalizedCode = normalizeUnitCode(normalizedApartment)

    const duplicate = residentList.find(
      (r) => normalizeUnitCode(r.apartment) === normalizedCode && r.id !== residentId,
    )
    if (duplicate) {
      showToast(tr('apartmentCodeExists'))
      return
    }

    const baseFields = {
      building: input.building.trim() || `Building ${letter}`,
      buildingNumber: letter,
      apartment: normalizedApartment,
      floor: Number.isFinite(input.floor) ? input.floor : 0,
      contractTotal,
      amountPaid,
      rentAmount,
      rentSchedule: normalizeRentSchedule(input.rentSchedule),
      rentDueDay,
      name: input.name.trim(),
      phone: normalizePhone(input.phone.trim()) || input.phone.trim(),
      parking: input.parking.trim(),
      leaseStart: input.leaseStart.trim() || undefined,
      leaseEnd: input.leaseEnd.trim(),
      unitType: input.unitType.trim() || undefined,
      nationality: input.nationality.trim() || undefined,
      idNumber: input.idNumber.trim() || undefined,
      occupants: Number.isFinite(input.occupants) ? input.occupants : undefined,
      status: input.status,
    }

    if (!residentId) {
      let id = parsed ? `apt-${letter.toLowerCase()}${unitNum}` : `apt-extra-${Date.now()}`
      const seed = residentList.find((r) => r.id === id)
      if (seed && isUnitOccupied(seed)) {
        showToast(tr('apartmentCodeExists'))
        return
      }
      if (!seed && residentList.some((r) => r.id === id)) {
        id = `apt-extra-${Date.now()}`
      }

      const pin = input.pin.trim()
      if (input.phone.trim() && pin) {
        const err = registerResidentAccount({
          name: baseFields.name || baseFields.apartment,
          phone: input.phone.trim(),
          pin,
          residentId: id,
        })
        if (err) {
          showToast(tr(err))
          return
        }
      }

      const next: Resident = {
        ...(seed ?? buildEmptyApartment(letter, unitNum)),
        ...baseFields,
        id: seed?.id ?? id,
        pin: pin || seed?.pin || '',
        currency: 'AED',
      }

      if (seed) {
        setResidentList((prev) => prev.map((r) => (r.id === next.id ? next : r)))
      } else {
        setResidentList((prev) => [...prev, next])
        setInvoiceMap((prev) => ({ ...prev, [next.id]: prev[next.id] ?? [] }))
        setTicketMap((prev) => ({ ...prev, [next.id]: prev[next.id] ?? [] }))
      }
      setSelectedResidentId(next.id)
      let nextResidentList = seed
        ? residentList.map((r) => (r.id === next.id ? next : r))
        : [...residentList, next]
      let nextInvoiceMap = { ...invoiceMap, [next.id]: invoiceMap[next.id] ?? [] }
      if (canCollectRent(next)) {
        const existingInv = nextInvoiceMap[next.id] ?? []
        const hasOpen = existingInv.some(
          (inv) => inv.status !== 'paid' && !paidIds.includes(inv.id),
        )
        if (!hasOpen) {
          const inv = buildInstallmentInvoice(next, lang)
          if (inv && !existingInv.some((row) => row.id === inv.id)) {
            nextInvoiceMap = { ...nextInvoiceMap, [next.id]: [inv, ...existingInv] }
          }
        }
      }
      setInvoiceMap(nextInvoiceMap)
      const nextRevoked = input.phone.trim() && pin
        ? removeRevokedResidentLogin(revokedResidentLogins, next.id)
        : revokedResidentLogins
      setRevokedResidentLogins(nextRevoked)
      void pushOpsToCloud({
        residentList: nextResidentList,
        invoiceMap: nextInvoiceMap,
        ticketMap: { ...ticketMap, [next.id]: ticketMap[next.id] ?? [] },
        revokedResidentLogins: nextRevoked,
      }).then((synced) => {
        if (!synced) showToast(tr('paymentSyncFailed'))
      })
      showToast(tr('apartmentAdded'))
      return
    }

    const existing = residentList.find((r) => r.id === residentId)
    if (!existing) return

    const phone = baseFields.phone
    const pin = input.pin.trim()
    const accountPin = pin || existing.pin
    if (phone && accountPin) {
      const err = setResidentPin(residentId, phone, accountPin, baseFields.name || existing.name)
      if (err) {
        showToast(tr(err))
        return
      }
    }

    const previousAmountPaid = existing.amountPaid
    let updated: Resident = {
      ...existing,
      ...baseFields,
      pin: accountPin || existing.pin,
      amountPaidManual: true,
    }
    let nextResidentList = residentList.map((r) => (r.id === residentId ? updated : r))
    let nextInvoiceMap = { ...invoiceMap }
    let nextPaidIds = [...paidIds]
    let nextPayments = [...payments]
    let nextResident = updated

    if (amountPaid > previousAmountPaid) {
      const applied = applyAdminPaidIncrease(
        updated,
        previousAmountPaid,
        amountPaid,
        nextInvoiceMap,
        nextPaidIds,
        nextPayments,
      )
      nextResident = applied.resident
      nextInvoiceMap = applied.invoiceMap
      nextPaidIds = applied.paidIds
      nextPayments = applied.payments
      nextResidentList = residentList.map((r) => (r.id === residentId ? nextResident : r))
    }

    if (!canCollectRent(nextResident)) {
      const invoiceIds = (nextInvoiceMap[residentId] ?? []).map((inv) => inv.id)
      const existingInvoices = nextInvoiceMap[residentId] ?? []
      const kept = existingInvoices.filter(
        (inv) => inv.status === 'paid' || nextPaidIds.includes(inv.id),
      )
      if (kept.length > 0) nextInvoiceMap = { ...nextInvoiceMap, [residentId]: kept }
      else {
        const { [residentId]: _, ...rest } = nextInvoiceMap
        nextInvoiceMap = rest
      }
      if (invoiceIds.length > 0) {
        const nextExtensions = { ...invoiceExtensions }
        for (const id of invoiceIds) delete nextExtensions[id]
        setInvoiceExtensions(nextExtensions)
        nextPaidIds = nextPaidIds.filter((id) => !invoiceIds.includes(id))
      }
    } else {
      nextInvoiceMap = withInstallmentInvoiceIfNeeded(nextInvoiceMap, nextResident, nextPaidIds)
    }

    setResidentList(nextResidentList)
    setInvoiceMap(nextInvoiceMap)
    setPaidIds(nextPaidIds)
    setPayments(nextPayments)
    setSelectedResidentId(residentId)
    const nextRevoked =
      phone && accountPin
        ? removeRevokedResidentLogin(revokedResidentLogins, residentId)
        : revokedResidentLogins
    setRevokedResidentLogins(nextRevoked)
    void pushOpsToCloud({
      residentList: nextResidentList,
      invoiceMap: nextInvoiceMap,
      paidIds: nextPaidIds,
      payments: nextPayments,
      revokedResidentLogins: nextRevoked,
    }).then((synced) => {
      if (!synced) showToast(tr('paymentSyncFailed'))
    })
    showToast(tr('apartmentUpdated'))
  }

  function removeApartment(residentId: string) {
    if (denyStaff('manage_apartments')) return
    const resident = residentList.find((r) => r.id === residentId)
    if (!resident) return

    const invoiceIds = (invoiceMap[residentId] ?? []).map((inv) => inv.id)
    clearResidentCredentials(residentId)
    const nextRevoked = addRevokedResidentLogin(revokedResidentLogins, residentId)
    const nextRemovedInvoiceIds = mergeRemovedInvoiceIdList(removedInvoiceIds, invoiceIds)
    const nextPayments = payments.filter((p) => p.residentId !== residentId)
    const nextInvoiceMap = { ...invoiceMap }
    delete nextInvoiceMap[residentId]
    const nextTicketMap = { ...ticketMap }
    delete nextTicketMap[residentId]
    const nextExtensions = { ...invoiceExtensions }
    for (const id of invoiceIds) delete nextExtensions[id]
    const nextPaidIds = paidIds.filter((id) => !invoiceIds.includes(id))

    const seed = apartmentUnits.find((u) => u.id === residentId)
    const nextResidentList = seed
      ? residentList.map((r) => (r.id === residentId ? seed : r))
      : residentList.filter((r) => r.id !== residentId)

    setRevokedResidentLogins(nextRevoked)
    setPayments(nextPayments)
    setInvoiceMap(nextInvoiceMap)
    setTicketMap(nextTicketMap)
    setInvoiceExtensions(nextExtensions)
    setPaidIds(nextPaidIds)
    setRemovedInvoiceIds(nextRemovedInvoiceIds)
    setResidentList(nextResidentList)

    if (selectedResidentId === residentId) {
      const remaining = nextResidentList.filter((r) => r.id !== residentId)
      setSelectedResidentId(remaining[0]?.id ?? '')
    }

    void pushOpsToCloud({
      residentList: nextResidentList,
      payments: nextPayments,
      invoiceMap: nextInvoiceMap,
      ticketMap: nextTicketMap,
      invoiceExtensions: nextExtensions,
      paidIds: nextPaidIds,
      removedInvoiceIds: nextRemovedInvoiceIds,
      revokedResidentLogins: nextRevoked,
    }).then((synced) => {
      if (!synced) showToast(tr('paymentSyncFailed'))
    })
    showToast(tr('apartmentRemoved'))
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
    setBankReferenceDraft('')
  }

  function closeCheckout() {
    setCheckoutInvoiceId(null)
    setPaying(false)
    setBankProof(null)
    setBankReferenceDraft('')
  }

  function clearBankProof() {
    setBankProof(null)
  }

  function compressImageDataUrl(dataUrl: string, maxEdge = 1280, quality = 0.72): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(dataUrl)
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        try {
          resolve(canvas.toDataURL('image/jpeg', quality))
        } catch {
          resolve(dataUrl)
        }
      }
      img.onerror = () => resolve(dataUrl)
      img.src = dataUrl
    })
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
      void compressImageDataUrl(dataUrl).then((compressed) => {
        setBankProof({ name: file.name.replace(/\.\w+$/, '') + '.jpg', dataUrl: compressed })
      })
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
    if (denyStaff('bank_settings')) return
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
    if (!isValidBankReference(bankReferenceDraft)) {
      showToast(tr('bankReferenceInvalid'))
      return
    }
    const bankReference = normalizeBankReference(bankReferenceDraft)
    const duplicate = findDuplicateBankReference(bankReference, payments)
    if (duplicate) {
      showToast(tr('bankReferenceDuplicate'))
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
    void (async () => {
      let ocrAmount: number | null = null
      let amountMismatchFlag = false
      let bankRefMismatchFlag = false
      try {
        const ocr = await recognizeTransferProof(bankProof.dataUrl, checkoutInvoice.amount)
        ocrAmount = ocr.extractedAmount
        if (ocrAmount != null && !amountsMatch(ocrAmount, checkoutInvoice.amount)) {
          amountMismatchFlag = true
        }
        const refMatch = bankRefsMatch(bankReference, ocr.extractedBankRef)
        if (refMatch === false) bankRefMismatchFlag = true
      } catch {
        /* OCR optional — admin reviews manually */
      }

      const unit = `${liveResident.buildingNumber}-${liveResident.apartment}`
      const paymentRef = buildPaymentRef(unit, checkoutInvoice.id)
      const reviewFlags: string[] = []
      if (amountMismatchFlag) reviewFlags.push('Amount mismatch on screenshot')
      if (bankRefMismatchFlag) reviewFlags.push('Bank reference mismatch on screenshot')

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
        bankReference,
        ocrAmount,
        amountMismatchFlag,
        bankRefMismatchFlag,
        reviewNote: reviewFlags.length > 0 ? reviewFlags.join(' · ') : undefined,
        transferProof: bankProof,
      }
      markLocalMutation()
      const nextPayments = [record, ...payments]
      const ops: PortalOps = {
        residentList,
        listings,
        payments: nextPayments,
        invoiceMap,
        ticketMap,
        invoiceExtensions,
        paidIds,
        bankSettings,
        serviceDirectory,
      }
      writeLocalOps(ops)
      setPayments(nextPayments)
      const synced = await flushCloudSaveNow(ops)
      setPaying(false)
      if (!synced) {
        showToast(tr('paymentSyncFailed'))
        return
      }
      setCheckoutInvoiceId(null)
      setBankProof(null)
      setBankReferenceDraft('')
      showToast(
        amountMismatchFlag || bankRefMismatchFlag
          ? tr('paymentSubmittedWithFlags')
          : lang === 'ar'
            ? `تم إرسال الإثبات للمراجعة. رقم المرجع ${bankReference}`
            : `Proof submitted for review. Bank reference ${bankReference}`,
      )
    })()
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
    const nextPayments = payments.map((p) =>
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
    )
    const nextPaidIds =
      exact && !paidIds.includes(payment.invoiceId)
        ? [...paidIds, payment.invoiceId]
        : paidIds
    let nextInvoiceMap = invoiceMap
    if (exact) {
      nextInvoiceMap = {
        ...invoiceMap,
        [payment.residentId]: (invoiceMap[payment.residentId] ?? []).map((inv) =>
          inv.id === payment.invoiceId ? { ...inv, status: 'paid' as const } : inv,
        ),
      }
    }
    const nextResidentList = residentList.map((r) => {
      if (r.id !== payment.residentId) return r
      const withPaid = {
        ...r,
        amountPaid: Math.min(r.contractTotal, r.amountPaid + verified),
      }
      return exact ? residentAfterInstallmentPaid(withPaid) : withPaid
    })
    if (exact) {
      const resident = residentList.find((r) => r.id === payment.residentId)
      if (resident) {
        const advanced = residentAfterInstallmentPaid({
          ...resident,
          amountPaid: Math.min(resident.contractTotal, resident.amountPaid + verified),
        })
        if (payment.residentId === selectedResidentId) {
          setNextDueDateDraft(advanced.nextDueDateIso ?? resolveNextDueDateIso(advanced))
        }
        if (remainingBalance(advanced) > 0 && advanced.rentAmount > 0) {
          const existing = nextInvoiceMap[advanced.id] ?? []
          const hasOpen = existing.some(
            (inv) => inv.status !== 'paid' && !nextPaidIds.includes(inv.id),
          )
          if (!hasOpen) {
            const nextInv = buildInstallmentInvoice(advanced, lang)
            if (nextInv && !existing.some((inv) => inv.id === nextInv.id)) {
              nextInvoiceMap = {
                ...nextInvoiceMap,
                [advanced.id]: [nextInv, ...existing],
              }
            }
          }
        }
      }
    }
    setPayments(nextPayments)
    if (exact) {
      setPaidIds(nextPaidIds)
      setInvoiceMap(nextInvoiceMap)
    }
    setResidentList(nextResidentList)
    markLocalMutation()
    const ops: PortalOps = {
      residentList: nextResidentList,
      listings,
      payments: nextPayments,
      invoiceMap: nextInvoiceMap,
      ticketMap,
      invoiceExtensions,
      paidIds: nextPaidIds,
      bankSettings,
      serviceDirectory,
    }
    writeLocalOps(ops)
    void flushCloudSaveNow(ops).then((synced) => {
      if (!synced) showToast(tr('paymentSyncFailed'))
    })
    showToast(
      exact
        ? lang === 'ar'
          ? 'تم تأكيد الدفع — المبلغ مطابق'
          : 'Payment confirmed — amount matches'
        : lang === 'ar'
          ? 'تم تسجيل دفعة جزئية — الفاتورة ما زالت مستحقة'
          : 'Partial payment recorded — invoice remains due',
    )
    autoNotifyPaymentWhatsApp(
      {
        ...payment,
        status: nextStatus,
        confirmedAmount: verified,
        reviewedAt,
      },
      exact ? 'approved' : 'partial',
    )
  }

  function rejectBankPayment(paymentId: string, note?: string) {
    const payment = payments.find((p) => p.id === paymentId)
    if (!payment || payment.status !== 'pending_review') return
    const reviewedAt = `${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · ${nowLabel()}`
    const nextPayments = payments.map((p) =>
      p.id === paymentId
        ? {
            ...p,
            status: 'rejected' as const,
            reviewedAt,
            reviewNote: note?.trim() || 'Rejected — amount or proof could not be verified',
          }
        : p,
    )
    setPayments(nextPayments)
    markLocalMutation()
    const ops: PortalOps = {
      residentList,
      listings,
      payments: nextPayments,
      invoiceMap,
      ticketMap,
      invoiceExtensions,
      paidIds,
      removedInvoiceIds,
      revokedResidentLogins,
      bankSettings,
      serviceDirectory,
    }
    writeLocalOps(ops)
    void flushCloudSaveNow(ops).then((synced) => {
      if (!synced) showToast(tr('paymentSyncFailed'))
    })
    showToast(lang === 'ar' ? 'تم رفض التحويل — الفاتورة ما زالت مستحقة' : 'Transfer rejected — invoice remains due')
    autoNotifyPaymentWhatsApp(
      {
        ...payment,
        status: 'rejected',
        reviewedAt,
        reviewNote: note?.trim() || 'Rejected — amount or proof could not be verified',
      },
      'rejected',
    )
  }

  function deletePayment(paymentId: string) {
    if (denyStaff('delete_payment')) return
    const payment = payments.find((p) => p.id === paymentId)
    if (!payment || payment.status === 'deleted') return

    const credited =
      payment.status === 'settled' || payment.status === 'partial'
        ? payment.confirmedAmount ?? payment.amount
        : 0

    // Soft-delete so other devices (resident) drop it on sync instead of resurrecting
    setPayments((prev) =>
      prev.map((p) =>
        p.id === paymentId
          ? {
              ...p,
              status: 'deleted' as const,
              reviewNote: lang === 'ar' ? 'حُذف بواسطة الإدارة' : 'Deleted by admin',
              reviewedAt: `${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · ${nowLabel()}`,
              transferProof: p.transferProof
                ? { name: p.transferProof.name, dataUrl: '' }
                : undefined,
            }
          : p,
      ),
    )

    if (credited > 0) {
      setResidentList((prev) =>
        prev.map((r) =>
          r.id === payment.residentId
            ? { ...r, amountPaid: Math.max(0, r.amountPaid - credited) }
            : r,
        ),
      )
    }

    if (payment.status === 'settled') {
      setPaidIds((prev) => prev.filter((id) => id !== payment.invoiceId))
      setInvoiceMap((prev) => ({
        ...prev,
        [payment.residentId]: (prev[payment.residentId] ?? []).map((inv) =>
          inv.id === payment.invoiceId ? { ...inv, status: 'due' as const } : inv,
        ),
      }))
    }

    showToast(lang === 'ar' ? 'تم حذف الدفعة' : 'Payment deleted')
  }

  function removeInvoice(invoiceId: string) {
    if (session?.role !== 'admin') return
    const resident = selectedResident
    const invoices = invoiceMap[resident.id] ?? []
    const invoice = invoices.find((inv) => inv.id === invoiceId)
    if (!invoice) return
    if (invoiceHasPendingPayment(invoiceId)) {
      showToast(
        lang === 'ar'
          ? 'لا يمكن الحذف — يوجد تحويل قيد المراجعة لهذه الفاتورة'
          : 'Cannot remove — a payment for this invoice is pending review',
      )
      return
    }

    const reviewedAt = `${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · ${nowLabel()}`
    const deletedNote = lang === 'ar' ? 'حُذف بواسطة الإدارة' : 'Deleted by admin'
    const linked = payments.filter((p) => p.invoiceId === invoiceId && p.status !== 'deleted')
    const credited = linked
      .filter((p) => p.status === 'settled' || p.status === 'partial')
      .reduce((sum, p) => sum + (p.confirmedAmount ?? p.amount), 0)
    const isPaid = invoice.status === 'paid' || paidIds.includes(invoiceId)
    const reverseAmount =
      credited > 0 ? credited : isPaid ? invoice.amount : 0

    const nextPayments = payments.map((p) =>
      p.invoiceId === invoiceId && p.status !== 'deleted'
        ? {
            ...p,
            status: 'deleted' as const,
            reviewNote: deletedNote,
            reviewedAt,
            transferProof: p.transferProof
              ? { name: p.transferProof.name, dataUrl: '' }
              : undefined,
          }
        : p,
    )
    const nextResident =
      reverseAmount > 0
        ? residentAfterInstallmentPaid({
            ...resident,
            amountPaid: Math.max(0, resident.amountPaid - reverseAmount),
            amountPaidManual: true,
          })
        : resident
    const nextResidentList = residentList.map((r) =>
      r.id === resident.id ? nextResident : r,
    )
    const nextPaidIds = paidIds.filter((id) => id !== invoiceId)
    const remaining = invoices.filter((inv) => inv.id !== invoiceId)
    let nextInvoiceMap: Record<string, Invoice[]> = { ...invoiceMap }
    if (remaining.length > 0) nextInvoiceMap = { ...nextInvoiceMap, [resident.id]: remaining }
    else {
      const { [resident.id]: _, ...rest } = nextInvoiceMap
      nextInvoiceMap = rest
    }
    const nextExtensions = { ...invoiceExtensions }
    delete nextExtensions[invoiceId]
    const nextRemovedInvoiceIds = removedInvoiceIds.some(
      (id) => invoiceIdKey(id) === invoiceIdKey(invoiceId),
    )
      ? removedInvoiceIds
      : [...removedInvoiceIds, invoiceId]

    if (checkoutInvoiceId === invoiceId) setCheckoutInvoiceId(null)
    setPayments(nextPayments)
    setPaidIds(nextPaidIds)
    setInvoiceMap(nextInvoiceMap)
    setInvoiceExtensions(nextExtensions)
    setRemovedInvoiceIds(nextRemovedInvoiceIds)
    setResidentList(nextResidentList)
    if (reverseAmount > 0) {
      const nextPaid = Math.max(0, nextResident.amountPaid)
      setPaidDraft(String(nextPaid))
      setNextDueDateDraft(nextResident.nextDueDateIso ?? resolveNextDueDateIso(nextResident))
    }
    void pushOpsToCloud({
      residentList: nextResidentList,
      payments: nextPayments,
      invoiceMap: nextInvoiceMap,
      paidIds: nextPaidIds,
      invoiceExtensions: nextExtensions,
      removedInvoiceIds: nextRemovedInvoiceIds,
    }).then((synced) => {
      if (!synced) showToast(tr('paymentSyncFailed'))
    })
    showToast(lang === 'ar' ? 'تم حذف الفاتورة' : 'Invoice removed')
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
    const nextPayments = [record, ...payments]
    const nextPaidIds = paidIds.includes(invoiceId) ? paidIds : [...paidIds, invoiceId]
    let nextInvoiceMap = {
      ...invoiceMap,
      [resident.id]: (invoiceMap[resident.id] ?? []).map((inv) =>
        inv.id === invoiceId ? { ...inv, status: 'paid' as const } : inv,
      ),
    }
    const nextResidentList = residentList.map((r) => {
      if (r.id !== resident.id) return r
      const withPaid = {
        ...r,
        amountPaid: Math.min(r.contractTotal, r.amountPaid + invoice.amount),
      }
      return residentAfterInstallmentPaid(withPaid)
    })
    const advanced = residentAfterInstallmentPaid({
      ...resident,
      amountPaid: Math.min(resident.contractTotal, resident.amountPaid + invoice.amount),
    })
    if (remainingBalance(advanced) > 0 && advanced.rentAmount > 0) {
      const existing = nextInvoiceMap[advanced.id] ?? []
      const hasOpen = existing.some(
        (inv) => inv.status !== 'paid' && !nextPaidIds.includes(inv.id),
      )
      if (!hasOpen) {
        const nextInv = buildInstallmentInvoice(advanced, lang)
        if (nextInv && !existing.some((row) => row.id === nextInv.id)) {
          nextInvoiceMap = { ...nextInvoiceMap, [advanced.id]: [nextInv, ...existing] }
        }
      }
    }
    setPayments(nextPayments)
    setPaidIds(nextPaidIds)
    setInvoiceMap(nextInvoiceMap)
    setResidentList(nextResidentList)
    setNextDueDateDraft(advanced.nextDueDateIso ?? resolveNextDueDateIso(advanced))
    setPaidDraft((prev) => {
      const next = Math.min(
        Number(contractDraft) || resident.contractTotal,
        (Number(prev) || 0) + invoice.amount,
      )
      return String(next)
    })
    void pushOpsToCloud({
      residentList: nextResidentList,
      payments: nextPayments,
      invoiceMap: nextInvoiceMap,
      paidIds: nextPaidIds,
    }).then((synced) => {
      if (!synced) showToast(tr('paymentSyncFailed'))
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
            scans.push(
              formatScreenshotAnalysis(
                ocr,
                payment,
                lang,
                givenBankRef ?? payment.bankReference ?? null,
              ),
            )
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

    const replyResident = session?.role === 'admin' ? selectedResident : liveResident
    const replyInvoices = session?.role === 'admin' ? adminResidentInvoices : visibleInvoices
    const replyTickets = session?.role === 'admin' ? adminResidentTickets : tickets
    const aiCtx: ResidentAiContext = {
      resident: replyResident,
      invoices: replyInvoices,
      tickets: replyTickets,
      payments: payments.filter(
        (p) => p.residentId === replyResident.id && p.status !== 'deleted',
      ),
    }
    const reply = aiReply(trimmed, lang, serviceDirectory, aiCtx)
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
    if (denyStaff('manage_listings')) return
    const id = `avail-${Date.now()}`
    setListings((prev) => [...prev, { ...input, id }])
    showToast(tr('listingSaved'))
  }

  function updateAvailableListing(id: string, input: Partial<AvailableApartment>) {
    if (denyStaff('manage_listings')) return
    setListings((prev) => prev.map((item) => (item.id === id ? { ...item, ...input } : item)))
    showToast(tr('listingSaved'))
  }

  function removeAvailableListing(id: string) {
    if (denyStaff('manage_listings')) return
    setListings((prev) => prev.filter((item) => item.id !== id))
    showToast(tr('listingRemoved'))
  }

  function suppressVacantListing(listing: AvailableApartment) {
    if (denyStaff('manage_listings')) return
    const code = normalizeUnitCode(listing.apartment)
    setListings((prev) => {
      if (prev.some((item) => normalizeUnitCode(item.apartment) === code && item.hidden)) {
        return prev
      }
      const { id: _id, ...rest } = listing
      return [...prev, { ...rest, id: `avail-${Date.now()}`, hidden: true }]
    })
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
        nextDueDateDraft,
        setNextDueDateDraft,
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
        bankReferenceDraft,
        setBankReferenceDraft,
        setBankProofFromFile,
        clearBankProof,
        paying,
        pendingPayments,
        invoiceHasPendingPayment,
        confirmBankPayment,
        rejectBankPayment,
        deletePayment,
        adminRecordPayment,
        removeInvoice,
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
        invoiceMap,
        ticketMap,
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
        availableListings,
        addAvailableListing,
        updateAvailableListing,
        removeAvailableListing,
        suppressVacantListing,
        saveApartmentRecord,
        removeApartment,
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
