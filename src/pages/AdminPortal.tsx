import { useEffect, useRef, useState, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  apartmentBuildingLetter,
  apartmentDisplayTitle,
  apartmentSortKey,
  arrearsList,
  AvailableApartment,
  BUILDING_INVENTORY,
  apartmentUnits,
  collectedInMonth,
  expectedMonthlyIncome,
  buildingLabel,
  buildRentReminderWhatsAppMessage,
  buildPaymentStatusWhatsAppMessage,
  findInvoiceInMap,
  findPaymentById,
  findResidentByUnitCode,
  formatMoney,
  isVacantAutoListing,
  normalizeRentSchedule,
  paymentMethodLabel,
  RENT_SCHEDULE_OPTIONS,
  type PaymentNotifyKind,
  type PaymentRecord,
  remainingBalance,
  rentScheduleLabel,
  RentSchedule,
  suggestInstallment,
  unitCodeLabel,
  whatsappChatUrl,
} from '../data'
import { statusLabel } from '../i18n'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { useData } from '../context/DataContext'
import { siteLegal } from '../legal/siteLegal'
import { Badge, BrandMark, LanguageSwitch, NavIcon, RentBalanceCard } from '../components/ui'
import AdminInvoiceLink from '../components/AdminInvoiceLink'
import AdminPaymentLink from '../components/AdminPaymentLink'
import AdminUnitLink from '../components/AdminUnitLink'
import {
  adminPortalHref,
  adminUnitHref,
  parseAdminPortalTab,
  type AdminPortalTab,
} from '../lib/adminUnitLink'
import { bankSummary, BANK_EDIT_PASSWORD, isBankConfigured } from '../config/paymentSettings'
import { fetchSyncHealth, getSyncMode, getSyncStatus } from '../lib/cloudSync'
import { exportAllApartmentsExcel, exportApartmentExcel } from '../lib/exportApartmentExcel'
import { StaffPaymentAssistant } from '../components/StaffPaymentAssistant'
import { PaymentProofThumb } from '../components/PaymentProofThumb'
import { isBuildingAdmin, staffCan } from '../lib/staffPermissions'
import { fetchPaymentProof } from '../lib/paymentProofApi'
import { analyzePaymentReference } from '../lib/transferProofOcr'

type Tab = AdminPortalTab

const emptyListingForm = {
  building: '',
  buildingNumber: '',
  apartment: '',
  floor: '1',
  bedrooms: '2',
  bathrooms: '2',
  sizeSqm: '100',
  rentMonthly: '8000',
  availableFrom: 'Now',
  parking: true,
  highlight: '',
  highlightAr: '',
  photoDataUrl: '',
}

const emptyApartmentForm = {
  buildingNumber: 'A',
  building: 'Building A',
  apartment: '',
  floor: '1',
  contractTotal: '0',
  amountPaid: '0',
  rentAmount: '0',
  rentSchedule: 1 as RentSchedule,
  rentDueDay: '1',
  name: '',
  phone: '',
  pin: '',
  leaseStart: '',
  leaseEnd: '',
  unitType: '',
  nationality: '',
  idNumber: '',
  occupants: '1',
  status: 'active' as 'active' | 'arrears' | 'notice',
}

function residentToApartmentForm(resident: {
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
  leaseStart?: string
  leaseEnd: string
  unitType?: string
  nationality?: string
  idNumber?: string
  occupants?: number
  status?: 'active' | 'arrears' | 'notice'
}) {
  return {
    buildingNumber: resident.buildingNumber || apartmentBuildingLetter(resident.apartment) || 'A',
    building: resident.building,
    apartment: resident.apartment,
    floor: String(resident.floor ?? 1),
    contractTotal: String(resident.contractTotal),
    amountPaid: String(resident.amountPaid),
    rentAmount: String(resident.rentAmount),
    rentSchedule: resident.rentSchedule,
    rentDueDay: String(resident.rentDueDay),
    name: resident.name,
    phone: resident.phone,
    pin: resident.pin,
    leaseStart: resident.leaseStart ?? '',
    leaseEnd: resident.leaseEnd,
    unitType: resident.unitType ?? '',
    nationality: resident.nationality ?? '',
    idNumber: resident.idNumber ?? '',
    occupants: String(resident.occupants ?? 1),
    status: resident.status ?? 'active',
  }
}

const UNIT_TYPE_OPTIONS = ['Studio', '1BR'] as const

export default function AdminPortal() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const detailRef = useRef<HTMLElement>(null)
  const { logout, session } = useAuth()
  const { lang, tr } = useLang()
  const {
    residentList,
    messages,
    humanMode,
    selectedResidentId,
    setSelectedResidentId,
    selectedResident,
    adminBalance,
    payments,
    pendingPayments,
    confirmBankPayment,
    rejectBankPayment,
    deletePayment,
    adminResidentInvoices,
    adminResidentTickets,
    adminResidentPayments,
    invoiceMap,
    ticketMap,
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
    toast,
    chatInput,
    setChatInput,
    chatEndRef,
    showToast,
    sendChat,
    saveRentPlan,
    clearApartmentInfo,
    resetHumanMode,
    availableListings,
    addAvailableListing,
    updateAvailableListing,
    removeAvailableListing,
    suppressVacantListing,
    saveApartmentRecord,
    removeApartment,
    bankSettings,
    saveBankSettings,
    serviceDirectory,
    addServiceContact,
    updateServiceContact,
    removeServiceContact,
  } = useData()

  const [apartmentSearch, setApartmentSearch] = useState('')
  const [apartmentEditorOpen, setApartmentEditorOpen] = useState(false)
  const [tab, setTab] = useState<Tab>(() => parseAdminPortalTab(searchParams.get('tab')) ?? 'info')
  const unitFromUrl = searchParams.get('unit')?.trim() ?? ''
  const paymentFromUrl = searchParams.get('payment')?.trim() ?? ''
  const invoiceFromUrl = searchParams.get('invoice')?.trim() ?? ''
  const unitFocus = Boolean(unitFromUrl) && tab === 'info' && !apartmentEditorOpen
  const paymentsUnitFocus = Boolean(unitFromUrl) && tab === 'payments'
  const paymentFocus = Boolean(paymentFromUrl)
  const invoiceFocus = Boolean(invoiceFromUrl)
  const canEditBank = staffCan(session, 'bank_settings')
  const canClearApartment = staffCan(session, 'clear_apartment')
  const canDeletePayment = staffCan(session, 'delete_payment')
  const canManageListings = staffCan(session, 'manage_listings')
  const canManageApartments = staffCan(session, 'manage_apartments')
  const [cloudSyncActive, setCloudSyncActive] = useState(() => getSyncMode() === 'cloud')
  const [syncHint, setSyncHint] = useState<string | null>(() => getSyncStatus().hint)
  const [syncError, setSyncError] = useState<string | null>(() => getSyncStatus().lastError)
  const [syncBackends, setSyncBackends] = useState(() => getSyncStatus().backends)

  useEffect(() => {
    const refresh = () => {
      const status = getSyncStatus()
      setCloudSyncActive(status.mode === 'cloud')
      setSyncHint(status.hint)
      setSyncError(status.lastError)
      setSyncBackends(status.backends)
    }
    void fetchSyncHealth().then(() => refresh())
    const id = window.setInterval(() => {
      void fetchSyncHealth().then(() => refresh())
    }, 10000)
    return () => window.clearInterval(id)
  }, [])

  const emptyServiceForm = {
    role: '',
    name: '',
    phone: '',
    category: '',
    whatsapp: '',
  }
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null)
  const [serviceForm, setServiceForm] = useState(emptyServiceForm)

  const [editingListingId, setEditingListingId] = useState<string | null>(null)
  const [listingForm, setListingForm] = useState(emptyListingForm)
  const [apartmentForm, setApartmentForm] = useState(emptyApartmentForm)
  const [bankDraft, setBankDraft] = useState(bankSettings)
  const [bankEditUnlocked, setBankEditUnlocked] = useState(false)
  const [bankUnlockDraft, setBankUnlockDraft] = useState('')
  const [bankUnlockError, setBankUnlockError] = useState<string | null>(null)
  const [paymentNotifyPrompt, setPaymentNotifyPrompt] = useState<{
    payment: PaymentRecord
    kind: PaymentNotifyKind
  } | null>(null)
  const [paymentRefScans, setPaymentRefScans] = useState<
    Record<string, { loading?: boolean; result?: string }>
  >({})

  const residentPortalUrl = `${siteLegal.publicUrl}/resident`

  useEffect(() => {
    setBankDraft(bankSettings)
  }, [bankSettings])

  useEffect(() => {
    if (tab !== 'payments') {
      setBankEditUnlocked(false)
      setBankUnlockDraft('')
      setBankUnlockError(null)
    }
  }, [tab])

  const occupiedUnits = residentList.filter((r) => r.name.trim() || r.phone.trim()).length
  const totalUnits = residentList.length
  const totalFromResidents = residentList.reduce((sum, r) => sum + (Number(r.amountPaid) || 0), 0)
  const totalOutstanding = residentList.reduce((sum, r) => sum + remainingBalance(r), 0)
  const totalContractValue = residentList.reduce((sum, r) => sum + (Number(r.contractTotal) || 0), 0)
  const monthlyIncomeExpected = useMemo(() => expectedMonthlyIncome(residentList), [residentList])
  const monthlyIncomeCollected = useMemo(() => {
    const now = new Date()
    return collectedInMonth(payments, now.getFullYear(), now.getMonth())
  }, [payments])
  const incomePayments = useMemo(
    () => payments.filter((p) => p.status !== 'pending_review' && p.status !== 'deleted'),
    [payments],
  )
  const filteredApartments = useMemo(() => {
    const q = apartmentSearch.trim().toLowerCase()
    const sorted = [...residentList].sort(
      (a, b) => apartmentSortKey(a.apartment) - apartmentSortKey(b.apartment),
    )
    if (!q) return sorted
    return sorted.filter((r) => {
      const haystack = [
        r.apartment,
        r.name,
        r.phone,
        r.unitType ?? '',
        r.nationality ?? '',
        r.idNumber ?? '',
        r.building,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [residentList, apartmentSearch])

  useEffect(() => {
    if (apartmentEditorOpen) return
    if (!selectedResidentId) return
    setApartmentForm(residentToApartmentForm(selectedResident))
  }, [selectedResidentId, apartmentEditorOpen])

  useEffect(() => {
    const tabParam = parseAdminPortalTab(searchParams.get('tab'))
    const paymentParam = searchParams.get('payment')?.trim() ?? ''
    const invoiceParam = searchParams.get('invoice')?.trim() ?? ''
    const unitParam = searchParams.get('unit')?.trim() ?? ''

    let nextTab: Tab | null = tabParam
    if (!nextTab && paymentParam) nextTab = 'income'
    if (!nextTab && invoiceParam) nextTab = 'payments'
    if (nextTab && nextTab !== tab) setTab(nextTab)

    if (paymentParam) {
      const payment = findPaymentById(payments, paymentParam)
      if (payment && payment.residentId !== selectedResidentId) {
        setSelectedResidentId(payment.residentId)
        setApartmentEditorOpen(false)
      }
    } else if (invoiceParam) {
      const found = findInvoiceInMap(invoiceMap, invoiceParam)
      if (found && found.residentId !== selectedResidentId) {
        setSelectedResidentId(found.residentId)
        setApartmentEditorOpen(false)
      }
    }

    if (unitParam) {
      const found = findResidentByUnitCode(residentList, unitParam)
      if (found && found.id !== selectedResidentId) {
        setSelectedResidentId(found.id)
        setApartmentEditorOpen(false)
      }
    }
  }, [searchParams, residentList, selectedResidentId, tab, payments, invoiceMap])

  useEffect(() => {
    if (!unitFromUrl || tab !== 'info' || apartmentEditorOpen) return
    detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [unitFromUrl, tab, selectedResidentId, apartmentEditorOpen])

  useEffect(() => {
    if (!paymentFromUrl) return
    const payment = findPaymentById(payments, paymentFromUrl)
    if (!payment) return
    const el = document.getElementById(`admin-payment-${payment.id}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [paymentFromUrl, tab, payments, selectedResidentId])

  useEffect(() => {
    if (!invoiceFromUrl || tab !== 'payments') return
    const found = findInvoiceInMap(invoiceMap, invoiceFromUrl)
    if (!found) return
    const el = document.getElementById(`admin-invoice-${found.invoice.id}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [invoiceFromUrl, tab, invoiceMap, selectedResidentId])

  function currentUnitCode() {
    const code = unitCodeLabel(selectedResident)
    return code !== '—' ? code : unitFromUrl
  }

  function goToTab(nextTab: Tab) {
    setTab(nextTab)
    const code = currentUnitCode()
    navigate(adminPortalHref(code || undefined, nextTab), { replace: true })
  }

  async function checkPaymentReference(payment: PaymentRecord) {
    let proof = payment.transferProof?.dataUrl
      ? payment.transferProof
      : await fetchPaymentProof(payment.id)
    if (!proof?.dataUrl) {
      showToast(tr('noTransferProof'))
      return
    }
    setPaymentRefScans((prev) => ({ ...prev, [payment.id]: { loading: true } }))
    try {
      const result = await analyzePaymentReference(
        { ...payment, transferProof: proof },
        lang,
      )
      setPaymentRefScans((prev) => ({ ...prev, [payment.id]: { loading: false, result } }))
    } catch {
      setPaymentRefScans((prev) => ({
        ...prev,
        [payment.id]: { loading: false, result: tr('staffScanFailed') },
      }))
    }
  }

  function handleLogout() {
    resetHumanMode()
    logout()
    navigate('/')
  }

  function resetApartmentForm() {
    setApartmentForm(emptyApartmentForm)
    setApartmentEditorOpen(false)
  }

  function startAddApartment() {
    setApartmentForm(emptyApartmentForm)
    setApartmentEditorOpen(true)
  }

  function submitApartmentForm() {
    const isAdding = apartmentEditorOpen
    saveApartmentRecord(
      {
        buildingNumber: apartmentForm.buildingNumber,
        building: apartmentForm.building,
        apartment: apartmentForm.apartment,
        floor: Number(apartmentForm.floor) || 0,
        contractTotal: Number(apartmentForm.contractTotal) || 0,
        amountPaid: Number(apartmentForm.amountPaid) || 0,
        rentAmount: Number(apartmentForm.rentAmount) || 0,
        rentSchedule: apartmentForm.rentSchedule,
        rentDueDay: Number(apartmentForm.rentDueDay) || 1,
        name: apartmentForm.name,
        phone: apartmentForm.phone,
        pin: apartmentForm.pin,
        parking: '',
        leaseStart: apartmentForm.leaseStart,
        leaseEnd: apartmentForm.leaseEnd,
        unitType: apartmentForm.unitType,
        nationality: apartmentForm.nationality,
        idNumber: apartmentForm.idNumber,
        occupants: Number(apartmentForm.occupants) || 1,
        status: apartmentForm.status,
      },
      isAdding ? undefined : selectedResidentId,
    )
    if (isAdding) resetApartmentForm()
  }

  function renderApartmentFormFields(apartmentCodeReadOnly: boolean) {
    return (
      <div className="rent-plan-editor">
        <div className="form-row">
          <label htmlFor="aptBuildingNum">{tr('buildingLetter')}</label>
          <input
            id="aptBuildingNum"
            value={apartmentForm.buildingNumber}
            onChange={(e) =>
              setApartmentForm((f) => ({ ...f, buildingNumber: e.target.value.toUpperCase() }))
            }
            placeholder="A"
          />
        </div>
        <div className="form-row">
          <label htmlFor="aptBuildingName">{tr('building')}</label>
          <input
            id="aptBuildingName"
            value={apartmentForm.building}
            onChange={(e) => setApartmentForm((f) => ({ ...f, building: e.target.value }))}
          />
        </div>
        <div className="form-row">
          <label htmlFor="aptCode">{tr('apartment')}</label>
          <input
            id="aptCode"
            value={apartmentForm.apartment}
            onChange={(e) => setApartmentForm((f) => ({ ...f, apartment: e.target.value }))}
            placeholder="A5"
            readOnly={apartmentCodeReadOnly}
          />
        </div>
        <div className="form-row">
          <label htmlFor="aptFloor">{tr('floor')}</label>
          <input
            id="aptFloor"
            type="number"
            value={apartmentForm.floor}
            onChange={(e) => setApartmentForm((f) => ({ ...f, floor: e.target.value }))}
          />
        </div>
        <div className="form-row">
          <label htmlFor="aptContract">{tr('contractTotal')}</label>
          <input
            id="aptContract"
            type="number"
            min={0}
            value={apartmentForm.contractTotal}
            onChange={(e) => setApartmentForm((f) => ({ ...f, contractTotal: e.target.value }))}
          />
        </div>
        <div className="form-row">
          <label htmlFor="aptPaid">{tr('amountPaid')}</label>
          <input
            id="aptPaid"
            type="number"
            min={0}
            value={apartmentForm.amountPaid}
            onChange={(e) => setApartmentForm((f) => ({ ...f, amountPaid: e.target.value }))}
          />
        </div>
        <div className="form-row">
          <label htmlFor="aptRent">{tr('installment')}</label>
          <input
            id="aptRent"
            type="number"
            min={0}
            value={apartmentForm.rentAmount}
            onChange={(e) => setApartmentForm((f) => ({ ...f, rentAmount: e.target.value }))}
          />
        </div>
        <div className="form-row">
          <label htmlFor="aptSchedule">{tr('rentSchedule')}</label>
          <select
            id="aptSchedule"
            value={apartmentForm.rentSchedule}
            onChange={(e) => {
              const next = normalizeRentSchedule(Number(e.target.value))
              setApartmentForm((f) => ({
                ...f,
                rentSchedule: next,
                rentAmount: String(
                  suggestInstallment(Number(f.contractTotal) || 0, next),
                ),
              }))
            }}
          >
            {RENT_SCHEDULE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} — {rentScheduleLabel(n, lang)}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="aptDueDay">{tr('rentDueDay')} (1–28)</label>
          <input
            id="aptDueDay"
            type="number"
            min={1}
            max={28}
            value={apartmentForm.rentDueDay}
            onChange={(e) => setApartmentForm((f) => ({ ...f, rentDueDay: e.target.value }))}
          />
        </div>
        <div className="form-row">
          <label htmlFor="aptUnitType">{tr('unitType')}</label>
          <select
            id="aptUnitType"
            value={apartmentForm.unitType}
            onChange={(e) => setApartmentForm((f) => ({ ...f, unitType: e.target.value }))}
          >
            <option value="">{tr('selectUnitType')}</option>
            {UNIT_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {type === 'Studio' ? tr('unitTypeStudio') : tr('unitType1Br')}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="aptName">{tr('fullName')}</label>
          <input
            id="aptName"
            value={apartmentForm.name}
            onChange={(e) => setApartmentForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="form-row">
          <label htmlFor="aptPhone">{tr('phone')}</label>
          <input
            id="aptPhone"
            value={apartmentForm.phone}
            onChange={(e) => setApartmentForm((f) => ({ ...f, phone: e.target.value }))}
            inputMode="tel"
          />
        </div>
        <div className="form-row">
          <label htmlFor="aptNationality">{tr('nationality')}</label>
          <input
            id="aptNationality"
            value={apartmentForm.nationality}
            onChange={(e) => setApartmentForm((f) => ({ ...f, nationality: e.target.value }))}
          />
        </div>
        <div className="form-row">
          <label htmlFor="aptIdNumber">{tr('idNumber')}</label>
          <input
            id="aptIdNumber"
            value={apartmentForm.idNumber}
            onChange={(e) => setApartmentForm((f) => ({ ...f, idNumber: e.target.value }))}
            placeholder="784-XXXX-XXXXXXX-X"
          />
        </div>
        <div className="form-row">
          <label htmlFor="aptPin">{tr('newPin')}</label>
          <input
            id="aptPin"
            value={apartmentForm.pin}
            onChange={(e) => setApartmentForm((f) => ({ ...f, pin: e.target.value }))}
            inputMode="numeric"
            maxLength={4}
          />
        </div>
        <div className="form-row">
          <label htmlFor="aptLeaseStart">{tr('leaseStart')}</label>
          <input
            id="aptLeaseStart"
            value={apartmentForm.leaseStart}
            onChange={(e) => setApartmentForm((f) => ({ ...f, leaseStart: e.target.value }))}
          />
        </div>
        <div className="form-row">
          <label htmlFor="aptLeaseEnd">{tr('leaseEnd')}</label>
          <input
            id="aptLeaseEnd"
            value={apartmentForm.leaseEnd}
            onChange={(e) => setApartmentForm((f) => ({ ...f, leaseEnd: e.target.value }))}
          />
        </div>
        <div className="form-row">
          <label htmlFor="aptOccupants">{tr('occupants')}</label>
          <input
            id="aptOccupants"
            type="number"
            min={1}
            value={apartmentForm.occupants}
            onChange={(e) => setApartmentForm((f) => ({ ...f, occupants: e.target.value }))}
          />
        </div>
        <div className="form-row">
          <label htmlFor="aptStatus">{tr('accountStatus')}</label>
          <select
            id="aptStatus"
            value={apartmentForm.status}
            onChange={(e) =>
              setApartmentForm((f) => ({
                ...f,
                status: e.target.value as 'active' | 'arrears' | 'notice',
              }))
            }
          >
            <option value="active">{statusLabel(lang, 'active')}</option>
            <option value="arrears">{statusLabel(lang, 'arrears')}</option>
            <option value="notice">{statusLabel(lang, 'notice')}</option>
          </select>
        </div>
      </div>
    )
  }

  function sendRentReminder() {
    const phone = (apartmentForm.phone || selectedResident.phone).trim()
    if (!phone) {
      showToast(tr('reminderNoPhone'))
      return
    }
    const message = buildRentReminderWhatsAppMessage(
      {
        ...selectedResident,
        name: apartmentForm.name.trim() || selectedResident.name,
        phone,
      },
      adminResidentInvoices,
      `${siteLegal.publicUrl}/resident`,
      siteLegal.brandName,
    )
    const url = whatsappChatUrl(phone, message)
    if (!url) {
      showToast(tr('reminderNoPhone'))
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function residentForPayment(payment: PaymentRecord) {
    return residentList.find((r) => r.id === payment.residentId)
  }

  function paymentNotifyKind(payment: PaymentRecord): PaymentNotifyKind | null {
    if (payment.status === 'settled') return 'approved'
    if (payment.status === 'partial') return 'partial'
    if (payment.status === 'rejected') return 'rejected'
    return null
  }

  function openPaymentStatusWhatsApp(payment: PaymentRecord, kind: PaymentNotifyKind) {
    const resident = residentForPayment(payment)
    const phone = (resident?.phone ?? '').trim()
    if (!phone) {
      showToast(tr('notifyPaymentNoPhone'))
      return
    }
    const message = buildPaymentStatusWhatsAppMessage(
      payment,
      kind,
      lang,
      residentPortalUrl,
      siteLegal.brandName,
    )
    const url = whatsappChatUrl(phone, message)
    if (!url) {
      showToast(tr('notifyPaymentNoPhone'))
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function paymentNotifyBannerKey(kind: PaymentNotifyKind) {
    if (kind === 'approved') return 'paymentApprovedNotifyBanner'
    if (kind === 'partial') return 'paymentPartialNotifyBanner'
    return 'paymentRejectedNotifyBanner'
  }

  function renderPaymentNotifyActions(
    payment: PaymentRecord,
    kind: PaymentNotifyKind,
    marginTop = '0.5rem',
  ) {
    return (
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.4rem',
          marginTop,
        }}
      >
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          onClick={() => openPaymentStatusWhatsApp(payment, kind)}
        >
          {tr('notifyPaymentWhatsApp')}
        </button>
      </div>
    )
  }

  function handleApprovePayment(payment: PaymentRecord) {
    confirmBankPayment(payment.id, payment.amount, false)
    setPaymentNotifyPrompt({
      payment: { ...payment, status: 'settled', confirmedAmount: payment.amount },
      kind: 'approved',
    })
  }

  function handleRejectPayment(payment: PaymentRecord) {
    rejectBankPayment(payment.id)
    setPaymentNotifyPrompt({
      payment: { ...payment, status: 'rejected' },
      kind: 'rejected',
    })
  }

  function bundleForResident(residentId: string) {
    const resident = residentList.find((r) => r.id === residentId)
    if (!resident) return null
    return {
      resident,
      invoices: invoiceMap[residentId] ?? [],
      payments: payments.filter((p) => p.residentId === residentId),
      tickets: ticketMap[residentId] ?? [],
    }
  }

  function exportSelectedApartment() {
    exportApartmentExcel(
      {
        resident: selectedResident,
        invoices: adminResidentInvoices,
        payments: adminResidentPayments,
        tickets: adminResidentTickets,
      },
      lang,
    )
    showToast(tr('exportApartmentDone'))
  }

  function exportEveryApartment() {
    const bundles = residentList
      .map((r) => bundleForResident(r.id))
      .filter((b): b is NonNullable<typeof b> => Boolean(b))
    exportAllApartmentsExcel(bundles, lang)
    showToast(tr('exportAllApartmentsDone'))
  }

  function startEditListing(apt: AvailableApartment) {
    setEditingListingId(apt.id)
    setListingForm({
      building: apt.building,
      buildingNumber: apt.buildingNumber,
      apartment: apt.apartment,
      floor: String(apt.floor),
      bedrooms: String(apt.bedrooms),
      bathrooms: String(apt.bathrooms),
      sizeSqm: String(apt.sizeSqm),
      rentMonthly: String(apt.rentMonthly),
      availableFrom: apt.availableFrom,
      parking: apt.parking,
      highlight: apt.highlight,
      highlightAr: apt.highlightAr,
      photoDataUrl: apt.photoDataUrl ?? '',
    })
  }

  function resetListingForm() {
    setEditingListingId(null)
    setListingForm(emptyListingForm)
  }

  function saveListingForm() {
    const payload: Omit<AvailableApartment, 'id'> = {
      building: listingForm.building.trim() || 'Building',
      buildingNumber: listingForm.buildingNumber.trim() || '',
      apartment: listingForm.apartment.trim() || '',
      floor: Number(listingForm.floor) || 0,
      bedrooms: Number(listingForm.bedrooms) || 1,
      bathrooms: Number(listingForm.bathrooms) || 1,
      sizeSqm: Number(listingForm.sizeSqm) || 0,
      rentMonthly: Number(listingForm.rentMonthly) || 0,
      currency: 'AED',
      availableFrom: listingForm.availableFrom.trim() || 'Now',
      parking: listingForm.parking,
      highlight: listingForm.highlight.trim(),
      highlightAr: listingForm.highlightAr.trim(),
      photoDataUrl: listingForm.photoDataUrl || undefined,
    }
    if (editingListingId) {
      if (isVacantAutoListing({ id: editingListingId })) {
        addAvailableListing(payload)
      } else {
        updateAvailableListing(editingListingId, payload)
      }
    } else {
      addAvailableListing(payload)
    }
    resetListingForm()
  }

  function paymentRowClass(p: PaymentRecord) {
    const focused = paymentFromUrl && findPaymentById([p], paymentFromUrl)
    return focused ? 'list-row record-focused' : 'list-row'
  }

  function invoiceRowClass(inv: { id: string }) {
    const focused =
      invoiceFromUrl && inv.id.trim().toUpperCase() === invoiceFromUrl.trim().toUpperCase()
    return focused ? 'list-row record-focused' : 'list-row'
  }

  function renderResidentPicker(
    showFinancialMeta: boolean,
    residents = residentList,
    linkTab: Tab = 'info',
  ) {
    if (residents.length === 0) {
      return <p className="meta">{tr('noApartmentsYet')}</p>
    }

    const sorted = [...residents].sort(
      (a, b) => apartmentSortKey(a.apartment) - apartmentSortKey(b.apartment),
    )

    const byBuilding = BUILDING_INVENTORY.map((building) => ({
      building,
      units: sorted.filter((r) => apartmentBuildingLetter(r.apartment) === building.letter),
    })).filter((group) => group.units.length > 0)

    const seedIds = new Set(apartmentUnits.map((u) => u.id))
    const extraUnits = sorted.filter((r) => !seedIds.has(r.id))

    const renderUnitButton = (r: (typeof sorted)[number]) => {
      const unit = unitCodeLabel(r)
      const active = r.id === selectedResidentId
      const vacant = !(r.name.trim() || r.phone.trim())
      return (
        <Link
          key={r.id}
          to={adminUnitHref(unit, linkTab)}
          className={`resident-pick ${active ? 'active' : ''}`}
          onClick={() => setApartmentEditorOpen(false)}
        >
          <span>
            <strong>{unit}</strong>
            <span className="meta">
              {vacant ? tr('vacantUnit') : r.name.trim()}
              {r.unitType ? ` · ${r.unitType}` : ''}
              {!vacant && r.phone ? ` · ${r.phone}` : ''}
              {(r.nationality || r.idNumber) && (
                <>
                  <br />
                  {r.nationality}
                  {r.idNumber ? ` · ${r.idNumber}` : ''}
                </>
              )}
              {showFinancialMeta && (
                <>
                  <br />
                  {lang === 'ar' ? `الاستحقاق: يوم ${r.rentDueDay}` : `Due day: ${r.rentDueDay}`}
                  {' · '}
                  {rentScheduleLabel(r.rentSchedule, lang)}
                  {' · '}
                  {lang === 'ar' ? 'متبقي' : 'left'}{' '}
                  {formatMoney(remainingBalance(r), r.currency)}
                </>
              )}
            </span>
          </span>
          {r.status && r.status !== 'active' && <Badge lang={lang} status={r.status} />}
        </Link>
      )
    }

    return (
      <div className="building-unit-groups">
        {byBuilding.map(({ building, units }) => (
          <div key={building.letter} className="building-unit-group">
            <h3 className="section-label building-group-label">
              {buildingLabel(building.letter, lang)} · {units.length}{' '}
              {lang === 'ar' ? 'وحدات' : 'units'}
            </h3>
            <div className="list">{units.map(renderUnitButton)}</div>
          </div>
        ))}
        {extraUnits.length > 0 && (
          <div className="building-unit-group">
            <h3 className="section-label building-group-label">
              {tr('extraApartments')} · {extraUnits.length}
            </h3>
            <div className="list">{extraUnits.map(renderUnitButton)}</div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="portal">
      <aside className="sidebar">
        <div className="brand" style={{ color: '#f7faf8' }}>
          <BrandMark />
          {siteLegal.brandName}
        </div>

        <LanguageSwitch />

        <nav className="side-nav">
          <button
            type="button"
            className={`side-link ${tab === 'info' ? 'active' : ''}`}
            onClick={() => goToTab('info')}
          >
            {tr('adminInfoTab')}
          </button>
          <button
            type="button"
            className={`side-link ${tab === 'income' ? 'active' : ''}`}
            onClick={() => goToTab('income')}
          >
            {tr('adminIncomeTab')}
          </button>
          <button
            type="button"
            className={`side-link ${tab === 'payments' ? 'active' : ''}`}
            onClick={() => goToTab('payments')}
          >
            {tr('adminPaymentsTab')}
          </button>
          <button
            type="button"
            className={`side-link ${tab === 'available' ? 'active' : ''}`}
            onClick={() => goToTab('available')}
          >
            {tr('adminAvailableTab')}
          </button>
          <button
            type="button"
            className={`side-link ${tab === 'chat' ? 'active' : ''}`}
            onClick={() => goToTab('chat')}
          >
            {tr('inbox')}
          </button>
        </nav>

        <div className="user-card">
          <strong>{session?.name ?? tr('buildingManager')}</strong>
          <span>{isBuildingAdmin(session) ? tr('staffRoleAdmin') : tr('staffRoleOps')}</span>
          <p
            className="meta"
            style={{
              margin: '0.5rem 0 0',
              fontSize: '0.8rem',
              color: cloudSyncActive ? 'var(--accent)' : 'var(--muted)',
            }}
          >
            {cloudSyncActive ? tr('syncCloudActive') : tr('syncLocalOnly')}
          </p>
          {!cloudSyncActive && syncHint && (
            <p className="meta" style={{ margin: '0.35rem 0 0', fontSize: '0.75rem' }}>
              {syncHint}
            </p>
          )}
          {!cloudSyncActive && syncError && (
            <p className="meta" style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: '#c44' }}>
              {syncError}
            </p>
          )}
          {!cloudSyncActive && syncBackends && (
            <p className="meta" style={{ margin: '0.35rem 0 0', fontSize: '0.72rem' }}>
              {tr('syncBackendStatus')}:{' '}
              {[
                syncBackends.github && 'GitHub',
                syncBackends.redis && 'Redis',
                syncBackends.blob && 'Blob',
                syncBackends.postgres && 'Postgres',
                syncBackends.supabase && 'Supabase',
              ]
                .filter(Boolean)
                .join(', ') || tr('syncBackendNone')}
            </p>
          )}
        </div>

        <div className="side-footer">
          <button className="btn btn-ghost btn-sm logout-btn" type="button" onClick={handleLogout}>
            {tr('signOut')}
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="portal-topbar">
          <span className="meta">{tr('admin')}</span>
          <button className="btn btn-ghost btn-sm" type="button" onClick={handleLogout}>
            {tr('signOut')}
          </button>
        </div>

        {tab === 'info' && (
          <>
            <header className="page-head">
              <div>
                <h1>{tr('adminInfoTab')}</h1>
                <p>{tr('adminInfoLead')}</p>
              </div>
              <button className="btn btn-ghost btn-sm" type="button" onClick={exportEveryApartment}>
                {tr('exportAllApartmentsExcel')}
              </button>
            </header>
            <div className="grid-3">
              <section className="panel stat">
                <span className="value">
                  {occupiedUnits}/{totalUnits}
                </span>
                <span className="label">{tr('occupiedUnits')}</span>
              </section>
            </div>

            <details className="panel collapsible-section" style={{ marginTop: '1rem' }}>
              <summary>{tr('serviceDirectory')}</summary>
              <p className="meta" style={{ marginTop: '0.75rem' }}>
                {tr('serviceDirectoryLead')}
              </p>
              <div className="list">
                {serviceDirectory.map((c) => {
                  const waNumber = c.whatsapp?.trim() || c.phone
                  const waUrl = whatsappChatUrl(waNumber)
                  return (
                  <div className="list-row" key={c.id} style={{ alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <strong>
                        {c.role} · {c.name}
                      </strong>
                      <div className="meta">{c.category}</div>
                      <div className="meta" style={{ marginTop: '0.25rem' }}>
                        <a href={`tel:${c.phone.replace(/\s/g, '')}`}>{c.phone}</a>
                        {waUrl && (
                          <>
                            {' · '}
                            <a href={waUrl} target="_blank" rel="noreferrer">
                              {tr('whatsappChat')}
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        type="button"
                        onClick={() => {
                          setEditingServiceId(c.id)
                          setServiceForm({
                            role: c.role,
                            name: c.name,
                            phone: c.phone,
                            category: c.category,
                            whatsapp: c.whatsapp?.trim() || c.phone,
                          })
                        }}
                      >
                        {tr('editServiceContact')}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        type="button"
                        onClick={() => {
                          if (!window.confirm(tr('removeServiceContact') + '?')) return
                          removeServiceContact(c.id)
                          if (editingServiceId === c.id) {
                            setEditingServiceId(null)
                            setServiceForm(emptyServiceForm)
                          }
                        }}
                      >
                        {tr('removeServiceContact')}
                      </button>
                    </div>
                  </div>
                  )
                })}
                {serviceDirectory.length === 0 && (
                  <p className="meta">{tr('serviceContactEmpty')}</p>
                )}
              </div>

              <h3 className="section-label" style={{ marginTop: '1.25rem' }}>
                {editingServiceId ? tr('editServiceContact') : tr('addServiceContact')}
              </h3>
              <div className="rent-plan-editor">
                <div className="form-row">
                  <label htmlFor="svcRole">{tr('serviceRole')}</label>
                  <input
                    id="svcRole"
                    value={serviceForm.role}
                    onChange={(e) => setServiceForm((f) => ({ ...f, role: e.target.value }))}
                    placeholder="AC technician"
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="svcName">{tr('serviceName')}</label>
                  <input
                    id="svcName"
                    value={serviceForm.name}
                    onChange={(e) => setServiceForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="svcPhone">{tr('phone')}</label>
                  <input
                    id="svcPhone"
                    value={serviceForm.phone}
                    onChange={(e) => setServiceForm((f) => ({ ...f, phone: e.target.value }))}
                    inputMode="tel"
                    placeholder="+971 50 000 0000"
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="svcCategory">{tr('serviceCategory')}</label>
                  <input
                    id="svcCategory"
                    value={serviceForm.category}
                    onChange={(e) => setServiceForm((f) => ({ ...f, category: e.target.value }))}
                    placeholder="HVAC"
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="svcWhatsapp">{tr('serviceWhatsapp')}</label>
                  <input
                    id="svcWhatsapp"
                    value={serviceForm.whatsapp}
                    onChange={(e) => setServiceForm((f) => ({ ...f, whatsapp: e.target.value }))}
                    inputMode="tel"
                    placeholder="+971 50 000 0000"
                  />
                </div>
                <p className="meta" style={{ margin: 0 }}>
                  {tr('serviceWhatsappHelp')}
                </p>
              </div>
              <button
                className="btn btn-primary btn-sm"
                type="button"
                style={{ marginTop: '0.75rem' }}
                onClick={() => {
                  if (editingServiceId) {
                    updateServiceContact(editingServiceId, serviceForm)
                  } else {
                    addServiceContact(serviceForm)
                  }
                  setEditingServiceId(null)
                  setServiceForm(emptyServiceForm)
                }}
              >
                {tr('saveServiceContact')}
              </button>
              {editingServiceId && (
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  style={{ marginTop: '0.5rem', marginInlineStart: '0.5rem' }}
                  onClick={() => {
                    setEditingServiceId(null)
                    setServiceForm(emptyServiceForm)
                  }}
                >
                  {tr('cancelEdit')}
                </button>
              )}
            </details>

            <div className={`admin-split ${unitFocus ? 'unit-focused' : ''}`} style={{ marginTop: '1rem' }}>
              <section className="panel resident-directory">
                <div className="file-head">
                  <div>
                    <h2 style={{ marginBottom: '0.25rem' }}>{tr('apartments')}</h2>
                    <p className="meta" style={{ margin: 0 }}>
                      {tr('apartmentListLead')}
                    </p>
                  </div>
                  {canManageApartments && (
                    <button className="btn btn-primary btn-sm" type="button" onClick={startAddApartment}>
                      {tr('addApartment')}
                    </button>
                  )}
                </div>
                <div className="form-row" style={{ marginTop: '0.75rem' }}>
                  <label htmlFor="aptSearch">{tr('searchApartments')}</label>
                  <input
                    id="aptSearch"
                    value={apartmentSearch}
                    onChange={(e) => setApartmentSearch(e.target.value)}
                    placeholder={tr('searchApartmentsPlaceholder')}
                  />
                </div>
                <div className="info-scroll-list">
                  {renderResidentPicker(false, filteredApartments)}
                </div>
              </section>

              <section className="panel resident-file" ref={detailRef}>
                {apartmentEditorOpen && canManageApartments ? (
                  <>
                    <h2 style={{ marginBottom: '0.25rem' }}>{tr('addApartment')}</h2>
                    <p className="meta" style={{ marginTop: 0 }}>
                      {tr('apartmentFormHelp')}
                    </p>
                    {renderApartmentFormFields(false)}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                      <button className="btn btn-primary btn-sm" type="button" onClick={submitApartmentForm}>
                        {tr('addApartment')}
                      </button>
                      <button className="btn btn-ghost btn-sm" type="button" onClick={resetApartmentForm}>
                        {tr('cancelEdit')}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {unitFocus && (
                      <Link to="/admin" className="btn btn-ghost btn-sm" style={{ marginBottom: '0.75rem' }}>
                        {tr('allUnits')}
                      </Link>
                    )}
                    <div className="file-head">
                      <div>
                        <h2 style={{ marginBottom: '0.25rem' }}>
                          {apartmentDisplayTitle(selectedResident, lang)}
                        </h2>
                        <p className="meta" style={{ margin: 0 }}>
                          <AdminUnitLink unit={unitCodeLabel(selectedResident)} />
                          {selectedResident.building ? ` · ${selectedResident.building}` : ''}
                          {selectedResident.unitType ? ` · ${selectedResident.unitType}` : ''}
                          {selectedResident.nationality ? (
                            <>
                              <br />
                              {selectedResident.nationality}
                              {selectedResident.idNumber ? ` · ${selectedResident.idNumber}` : ''}
                            </>
                          ) : null}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          title={tr('sendReminderHelp')}
                          onClick={sendRentReminder}
                        >
                          {tr('sendReminder')}
                        </button>
                        <button
                          className="btn btn-primary btn-sm"
                          type="button"
                          onClick={() => {
                            setSelectedResidentId(selectedResident.id)
                            goToTab('chat')
                            showToast(
                              lang === 'ar'
                                ? `تم فتح محادثة الدعم لـ ${apartmentDisplayTitle(selectedResident, lang)}`
                                : `Opened support thread for ${apartmentDisplayTitle(selectedResident, lang)}`,
                            )
                          }}
                        >
                          {tr('openChat')}
                        </button>
                      </div>
                    </div>

                    <h3 className="section-label">{tr('editApartmentInfo')}</h3>
                    <p className="meta" style={{ marginTop: 0 }}>
                      {tr('editApartmentHelp')}
                    </p>
                    {renderApartmentFormFields(selectedResident.id.startsWith('apt-'))}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                      {canManageApartments && (
                        <button className="btn btn-primary btn-sm" type="button" onClick={submitApartmentForm}>
                          {tr('saveApartmentInfo')}
                        </button>
                      )}
                      {canManageApartments && (
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          onClick={() => {
                            if (!window.confirm(tr('removeApartmentConfirm'))) return
                            removeApartment(selectedResidentId)
                          }}
                        >
                          {tr('removeApartment')}
                        </button>
                      )}
                      <button className="btn btn-ghost btn-sm" type="button" onClick={exportSelectedApartment}>
                        {tr('exportApartmentExcel')}
                      </button>
                      {canClearApartment && (
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          onClick={() => {
                            if (!window.confirm(tr('clearApartmentConfirm'))) return
                            exportSelectedApartment()
                            clearApartmentInfo()
                            setApartmentForm({
                              ...emptyApartmentForm,
                              buildingNumber: selectedResident.buildingNumber,
                              building: selectedResident.building,
                              apartment: selectedResident.apartment,
                              floor: String(selectedResident.floor ?? 1),
                            })
                            setContractDraft('0')
                            setPaidDraft('0')
                            setInstallmentDraft('0')
                            setNextDueDateDraft(new Date().toISOString().slice(0, 10))
                            setScheduleDraft(1)
                          }}
                        >
                          {tr('clearApartmentInfo')}
                        </button>
                      )}
                    </div>

                <details className="collapsible-section" style={{ marginTop: '1.25rem' }}>
                  <summary>{tr('maintenanceTickets')}</summary>
                <div className="list" style={{ marginTop: '0.75rem' }}>
                  {adminResidentTickets.map((tkt) => (
                    <div className="list-row" key={tkt.id}>
                      <div>
                        <strong>{tkt.title}</strong>
                        <div className="meta">
                          {tkt.id} · {tkt.category} · {tkt.created}
                          <br />
                          {tkt.note}
                        </div>
                      </div>
                      <Badge lang={lang} status={tkt.status} />
                    </div>
                  ))}
                  {adminResidentTickets.length === 0 && (
                    <p className="meta">{tr('noTickets')}</p>
                  )}
                </div>
                </details>

                <details className="collapsible-section" style={{ marginTop: '0.75rem' }}>
                  <summary>{tr('chatContext')}</summary>
                {selectedResident.id ? (
                  <div className="admin-chat-preview" style={{ marginTop: '0.75rem' }}>
                    {messages.slice(-6).map((m) => (
                      <div
                        key={m.id}
                        className={`bubble ${m.role === 'user' ? 'user' : m.role}`}
                        style={{ maxWidth: '100%' }}
                      >
                        <strong
                          style={{
                            display: 'block',
                            fontSize: '0.72rem',
                            marginBottom: '0.2rem',
                            opacity: 0.7,
                          }}
                        >
                          {m.role === 'user'
                            ? selectedResident.name
                            : m.role === 'ai'
                              ? 'MLIH AI'
                              : m.role === 'agent'
                                ? 'Agent'
                                : 'System'}
                        </strong>
                        {m.text}
                        <span className="time">{m.time}</span>
                      </div>
                    ))}
                    {humanMode && (
                      <p className="meta" style={{ marginTop: '0.5rem' }}>
                        Live handoff active — agent has unit, invoices, and tickets loaded.
                      </p>
                    )}
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      style={{ marginTop: '0.75rem' }}
                      onClick={() => goToTab('chat')}
                    >
                      {tr('continueInbox')}
                    </button>
                  </div>
                ) : (
                  <p className="meta" style={{ margin: '0.75rem 0 0' }}>
                    {tr('noChatHistory')}
                  </p>
                )}
                </details>
                  </>
                )}
              </section>
            </div>
          </>
        )}

        {tab === 'income' && (
          <>
            <header className="page-head">
              <div>
                <h1>{tr('adminIncomeTab')}</h1>
                <p>{tr('adminIncomeLead')}</p>
              </div>
              <button className="btn btn-ghost btn-sm" type="button" onClick={exportEveryApartment}>
                {tr('exportAllApartmentsExcel')}
              </button>
            </header>
            <div className="grid-3" style={{ marginBottom: '1rem' }}>
              <section className="panel stat">
                <span className="value">{formatMoney(monthlyIncomeExpected).replace('AED ', '')}</span>
                <span className="label">{tr('monthlyIncomeExpected')}</span>
              </section>
              <section className="panel stat">
                <span className="value">{formatMoney(monthlyIncomeCollected).replace('AED ', '')}</span>
                <span className="label">{tr('monthlyIncomeCollected')}</span>
              </section>
              <section className="panel stat">
                <span className="value">{formatMoney(totalFromResidents).replace('AED ', '')}</span>
                <span className="label">{tr('totalFromResidents')}</span>
              </section>
            </div>
            <div className="grid-3" style={{ marginBottom: '1rem' }}>
              <section className="panel stat">
                <span className="value">{formatMoney(totalOutstanding).replace('AED ', '')}</span>
                <span className="label">{tr('totalOutstanding')}</span>
              </section>
              <section className="panel stat">
                <span className="value">{formatMoney(totalContractValue).replace('AED ', '')}</span>
                <span className="label">{tr('totalContractValue')}</span>
              </section>
              <section className="panel stat">
                <span className="value">{formatMoney(adminBalance).replace('AED ', '')}</span>
                <span className="label">{tr('merchantBalance')}</span>
              </section>
            </div>
            <div className="grid-3" style={{ marginBottom: '1rem' }}>
              <section className="panel stat">
                <span className="value">{payments.filter((p) => p.status !== 'deleted').length}</span>
                <span className="label">{tr('settledPayments')}</span>
              </section>
            </div>

            <section className="panel" style={{ marginBottom: '1rem' }}>
              <h2 style={{ marginBottom: '0.25rem' }}>{tr('arrearsSnapshot')}</h2>
              <table className="table">
                <thead>
                  <tr>
                    <th>{tr('unit')}</th>
                    <th>{tr('amount')}</th>
                    <th>{tr('days')}</th>
                  </tr>
                </thead>
                <tbody>
                  {arrearsList.map((row) => (
                    <tr key={row.unit}>
                      <td><AdminUnitLink unit={row.unit} /></td>
                      <td>{formatMoney(row.amount)}</td>
                      <td>{row.days}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {arrearsList.length === 0 && <p className="meta">{tr('allClear')}</p>}
            </section>

            <section className="panel">
              {paymentFocus && (
                <Link
                  to={adminPortalHref({ tab: 'income' })}
                  className="btn btn-ghost btn-sm"
                  style={{ marginBottom: '0.75rem' }}
                >
                  {tr('allPayments')}
                </Link>
              )}
              <h2 style={{ marginBottom: '0.25rem' }}>{tr('incomingPayments')}</h2>
              <p className="meta" style={{ marginTop: 0 }}>
                {tr('incomingPaymentsLead')}
              </p>
              <div className="list">
                {incomePayments.map((p) => (
                  <div
                    className={paymentRowClass(p)}
                    key={p.id}
                    id={`admin-payment-${p.id}`}
                    style={{ alignItems: 'flex-start' }}
                  >
                    <div style={{ flex: 1 }}>
                      <strong>
                        <AdminPaymentLink paymentId={p.id} />
                      </strong>
                      <div className="meta">
                        +{formatMoney(p.confirmedAmount ?? p.amount)} · {p.residentName || p.unit}
                        <br />
                        <AdminUnitLink unit={p.unit} tab="payments" /> · {paymentMethodLabel(p.method)} ·{' '}
                        {p.paidAt}
                        {p.invoiceId ? (
                          <>
                            <br />
                            <AdminInvoiceLink invoiceId={p.invoiceId} unit={p.unit} /> ·{' '}
                            {tr('paymentRefLabel')}
                          </>
                        ) : null}
                      </div>
                      <PaymentProofThumb payment={p} />
                      {(() => {
                        const kind = paymentNotifyKind(p)
                        return kind ? renderPaymentNotifyActions(p, kind) : null
                      })()}
                      {canDeletePayment && (
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          style={{ marginTop: '0.5rem' }}
                          onClick={() => {
                            if (!window.confirm(tr('deletePaymentConfirm'))) return
                            deletePayment(p.id)
                          }}
                        >
                          {tr('deletePayment')}
                        </button>
                      )}
                    </div>
                    <Badge lang={lang} status={p.status === 'settled' ? 'paid' : p.status} />
                  </div>
                ))}
                {incomePayments.length === 0 && <p className="meta">{tr('noPaymentsYet')}</p>}
              </div>
            </section>
          </>
        )}

        {tab === 'payments' && (
          <>
            <header className="page-head">
              <div>
                <h1>{tr('adminPaymentsTab')}</h1>
                <p>{tr('adminPaymentsLead')}</p>
              </div>
            </header>

            <section className="panel" style={{ marginTop: '1rem' }}>
              <div className="file-head">
                <div>
                  <h2 style={{ marginBottom: '0.25rem' }}>{tr('bankAccountSettings')}</h2>
                  <p className="meta" style={{ margin: 0 }}>
                    {isBankConfigured(bankSettings)
                      ? bankSummary(bankSettings)
                      : tr('bankNotConfiguredAdmin')}
                  </p>
                </div>
                {isBankConfigured(bankSettings) && (
                  <span className="badge badge-paid">{tr('bankConfigured')}</span>
                )}
              </div>
              <p className="meta" style={{ marginTop: '0.75rem' }}>
                {tr('bankSettingsHelp')}
              </p>

              {!canEditBank ? (
                <p className="meta" style={{ marginTop: '0.75rem' }}>
                  {tr('staffOpsReadOnlyBank')}
                </p>
              ) : !bankEditUnlocked ? (
                <div style={{ marginTop: '0.75rem' }}>
                  <p className="meta">{tr('bankEditLockedHelp')}</p>
                  <div className="rent-plan-editor" style={{ marginTop: '0.5rem', maxWidth: 280 }}>
                    <div className="form-row">
                      <label htmlFor="bankUnlockPassword">{tr('bankEditPassword')}</label>
                      <input
                        id="bankUnlockPassword"
                        type="password"
                        inputMode="numeric"
                        autoComplete="off"
                        value={bankUnlockDraft}
                        onChange={(e) => {
                          setBankUnlockDraft(e.target.value)
                          setBankUnlockError(null)
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return
                          if (bankUnlockDraft === BANK_EDIT_PASSWORD) {
                            setBankEditUnlocked(true)
                            setBankUnlockDraft('')
                            setBankUnlockError(null)
                            setBankDraft(bankSettings)
                          } else {
                            setBankUnlockError(tr('bankEditPasswordWrong'))
                          }
                        }}
                      />
                    </div>
                  </div>
                  {bankUnlockError && (
                    <p className="meta" style={{ color: '#c44', marginTop: '0.35rem' }}>
                      {bankUnlockError}
                    </p>
                  )}
                  <button
                    className="btn btn-primary btn-sm"
                    type="button"
                    style={{ marginTop: '0.75rem' }}
                    onClick={() => {
                      if (bankUnlockDraft === BANK_EDIT_PASSWORD) {
                        setBankEditUnlocked(true)
                        setBankUnlockDraft('')
                        setBankUnlockError(null)
                        setBankDraft(bankSettings)
                      } else {
                        setBankUnlockError(tr('bankEditPasswordWrong'))
                      }
                    }}
                  >
                    {tr('unlockBankEdit')}
                  </button>
                </div>
              ) : (
                <>
                  <p className="meta">{tr('bankSettingsRequired')}</p>
                  <div className="rent-plan-editor" style={{ marginTop: '0.75rem' }}>
                    <div className="form-row">
                      <label htmlFor="bankAccountName">{tr('accountHolder')}</label>
                      <input
                        id="bankAccountName"
                        value={bankDraft.accountName}
                        onChange={(e) => setBankDraft((d) => ({ ...d, accountName: e.target.value }))}
                      />
                    </div>
                    <div className="form-row">
                      <label htmlFor="bankName">{tr('bankName')}</label>
                      <input
                        id="bankName"
                        value={bankDraft.bankName}
                        onChange={(e) => setBankDraft((d) => ({ ...d, bankName: e.target.value }))}
                      />
                    </div>
                    <div className="form-row">
                      <label htmlFor="bankIban">{tr('iban')}</label>
                      <input
                        id="bankIban"
                        value={bankDraft.iban}
                        onChange={(e) => setBankDraft((d) => ({ ...d, iban: e.target.value }))}
                        placeholder="AE00 0000 0000 0000 0000 000"
                      />
                    </div>
                    <div className="form-row">
                      <label htmlFor="bankAccountNumber">{tr('accountNumber')}</label>
                      <input
                        id="bankAccountNumber"
                        value={bankDraft.accountNumber}
                        onChange={(e) =>
                          setBankDraft((d) => ({ ...d, accountNumber: e.target.value }))
                        }
                      />
                    </div>
                    <div className="form-row">
                      <label htmlFor="bankSwift">{tr('swift')}</label>
                      <input
                        id="bankSwift"
                        value={bankDraft.swift}
                        onChange={(e) => setBankDraft((d) => ({ ...d, swift: e.target.value }))}
                        placeholder="WIOBAEADXXX"
                      />
                    </div>
                    <div className="form-row">
                      <label htmlFor="bankAddress">{tr('bankAddress')}</label>
                      <input
                        id="bankAddress"
                        value={bankDraft.bankAddress}
                        onChange={(e) => setBankDraft((d) => ({ ...d, bankAddress: e.target.value }))}
                      />
                    </div>
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    type="button"
                    style={{ marginTop: '0.75rem' }}
                    onClick={() => {
                      saveBankSettings(bankDraft)
                      setBankEditUnlocked(false)
                      setBankUnlockDraft('')
                    }}
                  >
                    {tr('saveBankSettings')}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    style={{ marginTop: '0.5rem', marginInlineStart: '0.5rem' }}
                    onClick={() => {
                      setBankEditUnlocked(false)
                      setBankUnlockDraft('')
                      setBankUnlockError(null)
                      setBankDraft(bankSettings)
                    }}
                  >
                    {tr('cancelBankEdit')}
                  </button>
                </>
              )}

            </section>

            <StaffPaymentAssistant />

            <section className="panel" style={{ marginTop: '1rem' }}>
              <h2 style={{ marginBottom: '0.25rem' }}>
                {tr('pendingPayments')}
                {pendingPayments.length > 0 ? ` (${pendingPayments.length})` : ''}
              </h2>
              <p className="meta" style={{ marginTop: 0 }}>
                {tr('pendingPaymentsLead')}
              </p>
              {paymentNotifyPrompt && (
                <section
                  className="panel"
                  style={{
                    marginBottom: '1rem',
                    padding: '0.85rem 1rem',
                    background: 'var(--surface-elevated, rgba(0,0,0,0.03))',
                  }}
                >
                  <p className="meta" style={{ margin: 0, fontWeight: 600 }}>
                    {tr(paymentNotifyBannerKey(paymentNotifyPrompt.kind))}
                  </p>
                  {renderPaymentNotifyActions(paymentNotifyPrompt.payment, paymentNotifyPrompt.kind)}
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    style={{ marginTop: '0.5rem' }}
                    onClick={() => setPaymentNotifyPrompt(null)}
                  >
                    {tr('notifyPaymentDismiss')}
                  </button>
                </section>
              )}
              <div className="list">
                {pendingPayments.map((p) => (
                  <div
                    className={paymentRowClass(p)}
                    key={p.id}
                    id={`admin-payment-${p.id}`}
                    style={{ alignItems: 'flex-start' }}
                  >
                    <div style={{ flex: 1 }}>
                      <strong>
                        <AdminPaymentLink paymentId={p.id} tab="payments" />
                      </strong>
                      <div className="meta">
                        {formatMoney(p.amount)} · {p.residentName || p.unit}
                        <br />
                        <AdminUnitLink unit={p.unit} tab="payments" /> · {p.paidAt}
                        {p.bankReference ? (
                          <>
                            <br />
                            {tr('bankReferenceShort')}: {p.bankReference}
                          </>
                        ) : null}
                        {p.invoiceId ? (
                          <>
                            <br />
                            <AdminInvoiceLink invoiceId={p.invoiceId} unit={p.unit} />
                          </>
                        ) : null}
                        {p.paymentRef ? (
                          <>
                            <br />
                            {tr('paymentRefLabel')}: {p.paymentRef}
                          </>
                        ) : null}
                        {p.ocrAmount != null ? (
                          <>
                            <br />
                            {tr('ocrAmountLabel')}: {formatMoney(p.ocrAmount)}
                          </>
                        ) : null}
                      </div>
                      {(p.amountMismatchFlag || p.bankRefMismatchFlag) && (
                        <p
                          className="meta"
                          style={{ marginTop: '0.5rem', color: '#c44', fontWeight: 600 }}
                        >
                          {p.amountMismatchFlag && tr('amountMismatchFlag')}
                          {p.amountMismatchFlag && p.bankRefMismatchFlag ? ' · ' : ''}
                          {p.bankRefMismatchFlag && tr('bankRefMismatchFlag')}
                        </p>
                      )}
                      {p.reviewNote && (
                        <p className="meta" style={{ marginTop: '0.35rem' }}>
                          {p.reviewNote}
                        </p>
                      )}
                      <PaymentProofThumb
                        payment={p}
                        showMissing
                        style={{ marginTop: '0.65rem' }}
                      />
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '0.4rem',
                          marginTop: '0.75rem',
                        }}
                      >
                        {p.status === 'pending_review' && (
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            disabled={paymentRefScans[p.id]?.loading}
                            onClick={() => void checkPaymentReference(p)}
                          >
                            {paymentRefScans[p.id]?.loading
                              ? tr('checkingReference')
                              : tr('checkReferenceInPhoto')}
                          </button>
                        )}
                        <button
                          className="btn btn-primary btn-sm"
                          type="button"
                          onClick={() => handleApprovePayment(p)}
                        >
                          {tr('approvePayment')}
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          onClick={() => handleRejectPayment(p)}
                        >
                          {tr('rejectPayment')}
                        </button>
                      </div>
                      {paymentRefScans[p.id]?.result && (
                        <pre
                          className="meta"
                          style={{
                            marginTop: '0.75rem',
                            marginBottom: 0,
                            whiteSpace: 'pre-wrap',
                            fontFamily: 'inherit',
                            background: 'var(--surface-elevated, rgba(0,0,0,0.03))',
                            padding: '0.65rem 0.75rem',
                            borderRadius: '8px',
                          }}
                        >
                          {paymentRefScans[p.id]?.result}
                        </pre>
                      )}
                    </div>
                    <Badge lang={lang} status="pending_review" />
                  </div>
                ))}
                {pendingPayments.length === 0 && (
                  <p className="meta">{tr('noPendingPayments')}</p>
                )}
              </div>
            </section>

            <div className={`admin-split ${paymentsUnitFocus ? 'unit-focused' : ''}`} style={{ marginTop: '1rem' }}>
              <section className="panel resident-directory">
                <h2>{tr('apartments')}</h2>
                <p className="meta" style={{ marginTop: 0, marginBottom: '0.85rem' }}>
                  {tr('selectApartment')}
                </p>
                {renderResidentPicker(true, residentList, 'payments')}
              </section>

              <section className="panel resident-file" ref={paymentsUnitFocus ? detailRef : undefined}>
                {(paymentsUnitFocus || invoiceFocus || (paymentFocus && tab === 'payments')) && (
                  <Link
                    to={adminPortalHref({ tab: 'payments' })}
                    className="btn btn-ghost btn-sm"
                    style={{ marginBottom: '0.75rem' }}
                  >
                    {invoiceFocus
                      ? tr('allInvoices')
                      : paymentFocus
                        ? tr('allPayments')
                        : tr('allUnits')}
                  </Link>
                )}
                <div className="file-head">
                  <div>
                    <h2 style={{ marginBottom: '0.25rem' }}>
                      {apartmentDisplayTitle(selectedResident, lang)}
                    </h2>
                    <p className="meta" style={{ margin: 0 }}>
                      <AdminUnitLink unit={unitCodeLabel(selectedResident)} tab="payments" />
                      {selectedResident.building ? ` · ${selectedResident.building}` : ''}
                    </p>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    title={tr('sendReminderHelp')}
                    onClick={sendRentReminder}
                  >
                    {tr('sendReminder')}
                  </button>
                </div>

                <h3 className="section-label">{tr('rentSchedule')}</h3>
                <p className="meta" style={{ marginTop: 0 }}>
                  {tr('rentScheduleHelp')}
                </p>
                <div className="rent-plan-editor">
                  <div className="form-row">
                    <label htmlFor="schedule">{tr('rentSchedule')}</label>
                    <select
                      id="schedule"
                      value={scheduleDraft}
                      onChange={(e) => {
                        const next = normalizeRentSchedule(Number(e.target.value))
                        setScheduleDraft(next)
                        const total = Number(contractDraft) || selectedResident.contractTotal
                        setInstallmentDraft(String(suggestInstallment(total, next)))
                      }}
                    >
                      {RENT_SCHEDULE_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n} — {rentScheduleLabel(n, lang)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-row">
                    <label htmlFor="nextDueDate">{tr('nextDueDate')}</label>
                    <input
                      id="nextDueDate"
                      type="date"
                      value={nextDueDateDraft}
                      onChange={(e) => setNextDueDateDraft(e.target.value)}
                    />
                    <p className="meta" style={{ marginTop: '0.35rem' }}>
                      {tr('nextDueDateHelp')}
                    </p>
                  </div>
                  <div className="form-row">
                    <label htmlFor="contractTotal">{tr('contractTotal')}</label>
                    <input
                      id="contractTotal"
                      type="number"
                      min={0}
                      value={contractDraft}
                      onChange={(e) => {
                        setContractDraft(e.target.value)
                        const total = Number(e.target.value) || 0
                        setInstallmentDraft(String(suggestInstallment(total, scheduleDraft)))
                      }}
                    />
                  </div>
                  <div className="form-row">
                    <label htmlFor="amountPaid">{tr('amountPaid')}</label>
                    <input
                      id="amountPaid"
                      type="number"
                      min={0}
                      value={paidDraft}
                      onChange={(e) => setPaidDraft(e.target.value)}
                    />
                  </div>
                  <div className="form-row">
                    <label htmlFor="installment">{tr('installment')}</label>
                    <input
                      id="installment"
                      type="number"
                      min={0}
                      value={installmentDraft}
                      onChange={(e) => setInstallmentDraft(e.target.value)}
                    />
                  </div>
                  <div className="profile-item" style={{ margin: 0 }}>
                    <span className="k">{tr('amountRemaining')}</span>
                    <span className="v">
                      {formatMoney(
                        Math.max(0, (Number(contractDraft) || 0) - (Number(paidDraft) || 0)),
                        selectedResident.currency,
                      )}
                    </span>
                  </div>
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  type="button"
                  onClick={saveRentPlan}
                  style={{ marginTop: '0.75rem' }}
                >
                  {tr('saveRentPlan')}
                </button>

                <div style={{ marginTop: '1rem' }}>
                  <RentBalanceCard resident={selectedResident} lang={lang} tr={tr} />
                </div>

                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  style={{ marginTop: '0.75rem' }}
                  onClick={exportSelectedApartment}
                >
                  {tr('exportApartmentExcel')}
                </button>

                <h3 className="section-label">{tr('invoices')}</h3>
                <div className="list">
                  {adminResidentInvoices.map((inv) => (
                    <div
                      className={invoiceRowClass(inv)}
                      key={inv.id}
                      id={`admin-invoice-${inv.id}`}
                      style={{ alignItems: 'flex-start' }}
                    >
                      <div style={{ flex: 1 }}>
                        <strong>
                          <AdminInvoiceLink
                            invoiceId={inv.id}
                            unit={unitCodeLabel(selectedResident)}
                          />
                        </strong>
                        <div className="meta">
                          {inv.period} · {tr('due')} {inv.dueDate} · {formatMoney(inv.amount)}
                          {(inv.extensionDays ?? 0) > 0
                            ? ` · +${inv.extensionDays}d`
                            : ''}
                        </div>
                      </div>
                      <Badge lang={lang} status={inv.status} />
                    </div>
                  ))}
                  {adminResidentInvoices.length === 0 && (
                    <p className="meta">{tr('noInvoices')}</p>
                  )}
                </div>

                <h3 className="section-label">{tr('receivedAdmin')}</h3>
                <div className="list">
                  {adminResidentPayments.map((p) => (
                    <div
                      className={paymentRowClass(p)}
                      key={p.id}
                      id={`admin-payment-${p.id}`}
                      style={{ alignItems: 'flex-start' }}
                    >
                      <div style={{ flex: 1 }}>
                        <strong>
                          <AdminPaymentLink paymentId={p.id} tab="payments" />
                        </strong>
                        <div className="meta">
                          +{formatMoney(p.confirmedAmount ?? p.amount)} · {paymentMethodLabel(p.method)} ·{' '}
                          {p.paidAt}
                          {p.invoiceId ? (
                            <>
                              <br />
                              <AdminInvoiceLink invoiceId={p.invoiceId} unit={p.unit} />
                            </>
                          ) : null}
                          <br />
                          {p.destination}
                          {p.reviewNote ? (
                            <>
                              <br />
                              {p.reviewNote}
                            </>
                          ) : null}
                        </div>
                        <PaymentProofThumb payment={p} />
                        {(() => {
                          const kind = paymentNotifyKind(p)
                          return kind ? renderPaymentNotifyActions(p, kind) : null
                        })()}
                        {canDeletePayment && (
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          style={{ marginTop: '0.5rem' }}
                          onClick={() => {
                            if (!window.confirm(tr('deletePaymentConfirm'))) return
                            deletePayment(p.id)
                          }}
                        >
                          {tr('deletePayment')}
                        </button>
                        )}
                      </div>
                      <Badge lang={lang} status={p.status === 'settled' ? 'paid' : p.status} />
                    </div>
                  ))}
                  {adminResidentPayments.length === 0 && (
                    <p className="meta">{tr('noPaymentsYet')}</p>
                  )}
                </div>
              </section>
            </div>
          </>
        )}

        {tab === 'available' && (
          <>
            <header className="page-head">
              <div>
                <h1>{tr('adminAvailableTab')}</h1>
                <p>{tr('adminAvailableLead')}</p>
                {!canManageListings && (
                  <p className="meta" style={{ marginTop: '0.5rem' }}>
                    {tr('staffOpsListingsReadOnly')}
                  </p>
                )}
              </div>
            </header>

            <section className="panel">
              <h2>{tr('availableTitle')}</h2>
              <div className="list">
                {availableListings.map((apt) => {
                  const autoVacant = isVacantAutoListing(apt)
                  return (
                  <div className="list-row" key={apt.id}>
                    {apt.photoDataUrl ? (
                      <img className="listing-thumb" src={apt.photoDataUrl} alt="" />
                    ) : null}
                    <div>
                      <strong>
                        {apt.building} · {apt.apartment}
                        {autoVacant ? (
                          <span className="meta" style={{ marginInlineStart: '0.5rem' }}>
                            ({tr('vacantUnit')})
                          </span>
                        ) : null}
                      </strong>
                      <div className="meta">
                        {apt.bedrooms} {tr('bedrooms')} · {apt.bathrooms}{' '}
                        {tr('bathrooms')}
                        {apt.sizeSqm > 0 ? (
                          <>
                            {' '}
                            · {apt.sizeSqm} {tr('sqm')}
                          </>
                        ) : null}
                        {apt.rentMonthly > 0 ? (
                          <>
                            {' '}
                            · {formatMoney(apt.rentMonthly, apt.currency)}
                          </>
                        ) : null}
                        <br />
                        {lang === 'ar' ? apt.highlightAr : apt.highlight}
                      </div>
                    </div>
                    {canManageListings && (
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        type="button"
                        onClick={() => startEditListing(apt)}
                      >
                        {tr('editListing')}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        type="button"
                        onClick={() => {
                          if (autoVacant) {
                            suppressVacantListing(apt)
                          } else {
                            removeAvailableListing(apt.id)
                          }
                          if (editingListingId === apt.id) resetListingForm()
                        }}
                      >
                        {tr('removeListing')}
                      </button>
                    </div>
                    )}
                  </div>
                  )
                })}
                {availableListings.length === 0 && (
                  <p className="meta">{tr('adminAvailableLead')}</p>
                )}
              </div>
            </section>

            {canManageListings && (
            <section className="panel" style={{ marginTop: '1rem' }}>
              <h2>{editingListingId ? tr('editListing') : tr('addListing')}</h2>
              <div className="rent-plan-editor">
                <div className="form-row">
                  <label htmlFor="listBuilding">{tr('building')}</label>
                  <input
                    id="listBuilding"
                    value={listingForm.building}
                    onChange={(e) => setListingForm((f) => ({ ...f, building: e.target.value }))}
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="listApartment">{tr('apartment')}</label>
                  <input
                    id="listApartment"
                    value={listingForm.apartment}
                    onChange={(e) => setListingForm((f) => ({ ...f, apartment: e.target.value }))}
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="listBedrooms">{tr('bedrooms')}</label>
                  <input
                    id="listBedrooms"
                    type="number"
                    min={0}
                    value={listingForm.bedrooms}
                    onChange={(e) => setListingForm((f) => ({ ...f, bedrooms: e.target.value }))}
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="listBathrooms">{tr('bathrooms')}</label>
                  <input
                    id="listBathrooms"
                    type="number"
                    min={0}
                    value={listingForm.bathrooms}
                    onChange={(e) => setListingForm((f) => ({ ...f, bathrooms: e.target.value }))}
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="listSize">
                    {tr('sqm')}
                  </label>
                  <input
                    id="listSize"
                    type="number"
                    min={0}
                    value={listingForm.sizeSqm}
                    onChange={(e) => setListingForm((f) => ({ ...f, sizeSqm: e.target.value }))}
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="listRent">{tr('rentMonthly')}</label>
                  <input
                    id="listRent"
                    type="number"
                    min={0}
                    value={listingForm.rentMonthly}
                    onChange={(e) => setListingForm((f) => ({ ...f, rentMonthly: e.target.value }))}
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="listFrom">{tr('availableFrom')}</label>
                  <input
                    id="listFrom"
                    value={listingForm.availableFrom}
                    onChange={(e) =>
                      setListingForm((f) => ({ ...f, availableFrom: e.target.value }))
                    }
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="listParking">{tr('parking')}</label>
                  <input
                    id="listParking"
                    type="checkbox"
                    checked={listingForm.parking}
                    onChange={(e) => setListingForm((f) => ({ ...f, parking: e.target.checked }))}
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="listHighlight">{tr('highlightEn')}</label>
                  <input
                    id="listHighlight"
                    value={listingForm.highlight}
                    onChange={(e) => setListingForm((f) => ({ ...f, highlight: e.target.value }))}
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="listHighlightAr">{tr('highlightArLabel')}</label>
                  <input
                    id="listHighlightAr"
                    value={listingForm.highlightAr}
                    onChange={(e) => setListingForm((f) => ({ ...f, highlightAr: e.target.value }))}
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="listPhoto">{tr('listingPhoto')}</label>
                  <p className="meta" style={{ margin: '0 0 0.5rem' }}>
                    {tr('listingPhotoHint')}
                  </p>
                  <input
                    id="listPhoto"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const reader = new FileReader()
                      reader.onload = () => {
                        setListingForm((f) => ({
                          ...f,
                          photoDataUrl: String(reader.result ?? ''),
                        }))
                      }
                      reader.readAsDataURL(file)
                      e.target.value = ''
                    }}
                  />
                  {listingForm.photoDataUrl ? (
                    <div className="transfer-proof-preview" style={{ marginTop: '0.5rem' }}>
                      <img src={listingForm.photoDataUrl} alt="" />
                      <div className="transfer-proof-meta">
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          onClick={() => setListingForm((f) => ({ ...f, photoDataUrl: '' }))}
                        >
                          {tr('listingPhotoRemove')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label htmlFor="listPhoto" className="transfer-proof-drop" style={{ marginTop: '0.5rem' }}>
                      <span>{tr('listingPhotoChoose')}</span>
                    </label>
                  )}
                </div>
              </div>
              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button className="btn btn-primary btn-sm" type="button" onClick={saveListingForm}>
                  {tr('saveListing')}
                </button>
                {editingListingId && (
                  <button className="btn btn-ghost btn-sm" type="button" onClick={resetListingForm}>
                    {tr('cancel')}
                  </button>
                )}
              </div>
            </section>
            )}
          </>
        )}

        {tab === 'chat' && (
          <>
            <header className="page-head">
              <div>
                <h1>{tr('supportInbox')}</h1>
                <p>
                  {lang === 'ar'
                    ? `عرض ${apartmentDisplayTitle(selectedResident, lang)} · ${unitCodeLabel(selectedResident)} — السياق الكامل متاح.`
                    : `Viewing ${apartmentDisplayTitle(selectedResident, lang)} · ${unitCodeLabel(selectedResident)} — full apartment context available.`}
                </p>
              </div>
              <button className="btn btn-ghost" type="button" onClick={() => goToTab('info')}>
                {tr('backToFile')}
              </button>
            </header>
            <div className="panel" style={{ marginBottom: '1rem', padding: '0.9rem 1.1rem' }}>
              <div className="profile-grid">
                <div className="profile-item">
                  <span className="k">{tr('tenant')}</span>
                  <span className="v">{selectedResident.name.trim() || tr('vacantUnit')}</span>
                </div>
                <div className="profile-item">
                  <span className="k">{tr('phone')}</span>
                  <span className="v">{selectedResident.phone || '—'}</span>
                </div>
                <div className="profile-item">
                  <span className="k">{tr('unit')}</span>
                  <span className="v">{unitCodeLabel(selectedResident)}</span>
                </div>
                <div className="profile-item">
                  <span className="k">{tr('openTickets')}</span>
                  <span className="v">
                    {adminResidentTickets.filter((tkt) => tkt.status !== 'resolved').length}
                  </span>
                </div>
              </div>
            </div>
            <div className="chat-layout">
              <div className={`chat-banner ${humanMode ? 'human' : ''}`}>
                <div>
                  <strong>
                    {humanMode
                      ? lang === 'ar'
                        ? 'مايا · دعم المبنى'
                        : 'Maya · Building Support'
                      : tr('shadeAssistant')}
                  </strong>
                  <span>
                    {humanMode
                      ? tr('liveChat')
                      : `${tr('linkedTo')} ${unitCodeLabel(selectedResident)}`}
                  </span>
                  {!humanMode && (
                    <span className="meta" style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.78rem' }}>
                      {tr('chatAutomatedDisclaimer')}
                    </span>
                  )}
                </div>
              </div>
              <div className="chat-stream">
                {messages.map((m) => (
                  <div key={m.id} className={`bubble ${m.role === 'user' ? 'user' : m.role}`}>
                    {m.text.split('\n').map((line, i) => (
                      <span key={i}>
                        {i > 0 && <br />}
                        {line}
                      </span>
                    ))}
                    {m.contactPhone && (
                      <a className="call-link" href={`tel:${m.contactPhone.replace(/\s/g, '')}`}>
                        {tr('call')} {m.contactLabel ?? m.contactPhone}
                      </a>
                    )}
                    <span className="time">{m.time}</span>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <form
                className="chat-compose"
                onSubmit={(e) => {
                  e.preventDefault()
                  sendChat(chatInput)
                }}
              >
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={humanMode ? tr('messageMaya') : tr('askAnything')}
                />
                <button className="btn btn-primary" type="submit">
                  {tr('send')}
                </button>
              </form>
            </div>
          </>
        )}
      </main>

      <nav className="mobile-nav" aria-label="Primary">
        {(
          [
            { id: 'info' as Tab, labelKey: 'adminInfoTab', icon: 'info' as const },
            { id: 'income' as Tab, labelKey: 'adminIncomeTab', icon: 'income' as const },
            { id: 'payments' as Tab, labelKey: 'adminPaymentsTab', icon: 'payments' as const },
            { id: 'available' as Tab, labelKey: 'adminAvailableTab', icon: 'available' as const },
            { id: 'chat' as Tab, labelKey: 'inbox', icon: 'inbox' as const },
          ]
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'active' : ''}
            onClick={() => goToTab(item.id as Tab)}
          >
            <NavIcon id={item.icon} />
            {tr(item.labelKey)}
          </button>
        ))}
        <button type="button" onClick={handleLogout}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <path d="M16 17l5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
          {tr('signOut')}
        </button>
      </nav>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
