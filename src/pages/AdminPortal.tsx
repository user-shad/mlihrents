import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  apartmentBuildingLetter,
  apartmentDisplayTitle,
  apartmentSortKey,
  arrearsList,
  AvailableApartment,
  BUILDING_INVENTORY,
  buildingLabel,
  buildRentReminderWhatsAppMessage,
  buildPaymentStatusEmailMessage,
  buildPaymentStatusWhatsAppMessage,
  formatMoney,
  mailtoUrl,
  paymentMethodLabel,
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
import { bankSummary, BANK_EDIT_PASSWORD, isBankConfigured } from '../config/paymentSettings'
import { fetchSyncHealth, getSyncMode, getSyncStatus } from '../lib/cloudSync'
import { exportAllApartmentsExcel, exportApartmentExcel } from '../lib/exportApartmentExcel'
import { isBuildingAdmin, staffCan } from '../lib/staffPermissions'

type Tab = 'info' | 'payments' | 'available' | 'chat'

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

export default function AdminPortal() {
  const navigate = useNavigate()
  const { logout, accounts, session } = useAuth()
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
    toast,
    chatInput,
    setChatInput,
    chatEndRef,
    showToast,
    sendChat,
    saveRentPlan,
    saveResidentLoginPin,
    clearResidentLogin,
    updateResidentInfo,
    clearApartmentInfo,
    resetHumanMode,
    availableListings,
    addAvailableListing,
    updateAvailableListing,
    removeAvailableListing,
    bankSettings,
    saveBankSettings,
    serviceDirectory,
    addServiceContact,
    updateServiceContact,
    removeServiceContact,
  } = useData()

  const [tab, setTab] = useState<Tab>('info')
  const canEditBank = staffCan(session, 'bank_settings')
  const canClearApartment = staffCan(session, 'clear_apartment')
  const canDeletePayment = staffCan(session, 'delete_payment')
  const canManageListings = staffCan(session, 'manage_listings')
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

  const [pinDraft, setPinDraft] = useState(selectedResident.pin)
  const [phoneDraft, setPhoneDraft] = useState(selectedResident.phone)
  const [editName, setEditName] = useState(selectedResident.name)
  const [editPhone, setEditPhone] = useState(selectedResident.phone)
  const [editEmail, setEditEmail] = useState(selectedResident.email ?? '')
  const [editBuilding, setEditBuilding] = useState(selectedResident.building)
  const [editApartment, setEditApartment] = useState(selectedResident.apartment)
  const [editParking, setEditParking] = useState(selectedResident.parking)
  const [editOccupants, setEditOccupants] = useState(String(selectedResident.occupants ?? 1))
  const [editMoveIn, setEditMoveIn] = useState(selectedResident.moveIn ?? '')
  const [editLeaseEnd, setEditLeaseEnd] = useState(selectedResident.leaseEnd)
  const [editStatus, setEditStatus] = useState<'active' | 'arrears' | 'notice'>(
    selectedResident.status ?? 'active',
  )
  const [editingListingId, setEditingListingId] = useState<string | null>(null)
  const [listingForm, setListingForm] = useState(emptyListingForm)
  const [bankDraft, setBankDraft] = useState(bankSettings)
  const [bankEditUnlocked, setBankEditUnlocked] = useState(false)
  const [bankUnlockDraft, setBankUnlockDraft] = useState('')
  const [bankUnlockError, setBankUnlockError] = useState<string | null>(null)
  const [paymentNotifyPrompt, setPaymentNotifyPrompt] = useState<{
    payment: PaymentRecord
    kind: PaymentNotifyKind
  } | null>(null)

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

  useEffect(() => {
    setPinDraft(selectedResident.pin)
    setPhoneDraft(selectedResident.phone)
    setEditName(selectedResident.name)
    setEditPhone(selectedResident.phone)
    setEditEmail(selectedResident.email ?? '')
    setEditBuilding(selectedResident.building)
    setEditApartment(selectedResident.apartment)
    setEditParking(selectedResident.parking)
    setEditOccupants(String(selectedResident.occupants ?? 1))
    setEditMoveIn(selectedResident.moveIn ?? '')
    setEditLeaseEnd(selectedResident.leaseEnd)
    setEditStatus(selectedResident.status ?? 'active')
  }, [selectedResident])

  const accountPin =
    accounts.find((a) => a.residentId === selectedResident.id)?.pin ?? selectedResident.pin

  function handleLogout() {
    resetHumanMode()
    logout()
    navigate('/')
  }

  function sendRentReminder() {
    const phone = (editPhone || selectedResident.phone).trim()
    if (!phone) {
      showToast(tr('reminderNoPhone'))
      return
    }
    const message = buildRentReminderWhatsAppMessage(
      {
        ...selectedResident,
        name: editName.trim() || selectedResident.name,
        phone,
      },
      adminResidentInvoices,
      lang,
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

  function openPaymentStatusEmail(payment: PaymentRecord, kind: PaymentNotifyKind) {
    const resident = residentForPayment(payment)
    const email = (resident?.email ?? '').trim()
    if (!email) {
      showToast(tr('notifyPaymentNoEmail'))
      return
    }
    const { subject, body } = buildPaymentStatusEmailMessage(
      payment,
      kind,
      lang,
      residentPortalUrl,
      siteLegal.brandName,
    )
    const url = mailtoUrl(email, subject, body)
    if (!url) {
      showToast(tr('notifyPaymentNoEmail'))
      return
    }
    window.location.href = url
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
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          onClick={() => openPaymentStatusEmail(payment, kind)}
        >
          {tr('notifyPaymentEmail')}
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
      updateAvailableListing(editingListingId, payload)
    } else {
      addAvailableListing(payload)
    }
    resetListingForm()
  }

  function renderResidentPicker(showFinancialMeta: boolean) {
    if (residentList.length === 0) {
      return <p className="meta">{tr('noApartmentsYet')}</p>
    }

    const sorted = [...residentList].sort(
      (a, b) => apartmentSortKey(a.apartment) - apartmentSortKey(b.apartment),
    )

    const byBuilding = BUILDING_INVENTORY.map((building) => ({
      building,
      units: sorted.filter((r) => apartmentBuildingLetter(r.apartment) === building.letter),
    })).filter((group) => group.units.length > 0)

    return (
      <div className="building-unit-groups">
        {byBuilding.map(({ building, units }) => (
          <div key={building.letter} className="building-unit-group">
            <h3 className="section-label building-group-label">
              {buildingLabel(building.letter, lang)} · {units.length}{' '}
              {lang === 'ar' ? 'وحدات' : 'units'}
            </h3>
            <div className="list">
              {units.map((r) => {
                const unit = unitCodeLabel(r)
                const active = r.id === selectedResidentId
                const title = apartmentDisplayTitle(r, lang)
                const vacant = !(r.name.trim() || r.phone.trim())
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`resident-pick ${active ? 'active' : ''}`}
                    onClick={() => setSelectedResidentId(r.id)}
                  >
                    <span>
                      <strong>{title}</strong>
                      <span className="meta">
                        {unit}
                        {!vacant && r.phone ? ` · ${r.phone}` : vacant ? ` · ${tr('vacantUnit')}` : ''}
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
                  </button>
                )
              })}
            </div>
          </div>
        ))}
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
            onClick={() => setTab('info')}
          >
            {tr('adminInfoTab')}
          </button>
          <button
            type="button"
            className={`side-link ${tab === 'payments' ? 'active' : ''}`}
            onClick={() => setTab('payments')}
          >
            {tr('adminPaymentsTab')}
          </button>
          <button
            type="button"
            className={`side-link ${tab === 'available' ? 'active' : ''}`}
            onClick={() => setTab('available')}
          >
            {tr('adminAvailableTab')}
          </button>
          <button
            type="button"
            className={`side-link ${tab === 'chat' ? 'active' : ''}`}
            onClick={() => setTab('chat')}
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

            <section className="panel" style={{ marginTop: '1rem' }}>
              <h2>{tr('serviceDirectory')}</h2>
              <p className="meta" style={{ marginTop: 0 }}>
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
            </section>

            <div className="admin-split" style={{ marginTop: '1rem' }}>
              <section className="panel resident-directory">
                <h2>{tr('apartments')}</h2>
                <p className="meta" style={{ marginTop: 0, marginBottom: '0.85rem' }}>
                  {tr('selectApartment')}
                </p>
                {renderResidentPicker(false)}
              </section>

              <section className="panel resident-file">
                <div className="file-head">
                  <div>
                    <h2 style={{ marginBottom: '0.25rem' }}>
                      {apartmentDisplayTitle(selectedResident, lang)}
                    </h2>
                    <p className="meta" style={{ margin: 0 }}>
                      {unitCodeLabel(selectedResident)}
                      {selectedResident.building ? ` · ${selectedResident.building}` : ''}
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
                        setTab('chat')
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
                <div className="rent-plan-editor">
                  <div className="form-row">
                    <label htmlFor="editName">{tr('fullName')}</label>
                    <input id="editName" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </div>
                  <div className="form-row">
                    <label htmlFor="editPhone">{tr('phone')}</label>
                    <input
                      id="editPhone"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      inputMode="tel"
                    />
                  </div>
                  <div className="form-row">
                    <label htmlFor="editEmail">{tr('email')}</label>
                    <input
                      id="editEmail"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      type="email"
                    />
                  </div>
                  <div className="form-row">
                    <label htmlFor="editBuilding">{tr('building')}</label>
                    <input
                      id="editBuilding"
                      value={editBuilding}
                      onChange={(e) => setEditBuilding(e.target.value)}
                    />
                  </div>
                  <div className="form-row">
                    <label htmlFor="editApartment">{tr('apartment')}</label>
                    <input
                      id="editApartment"
                      value={editApartment}
                      onChange={(e) => setEditApartment(e.target.value)}
                      readOnly={selectedResident.id.startsWith('apt-')}
                    />
                  </div>
                  <div className="form-row">
                    <label htmlFor="editParking">{tr('parking')}</label>
                    <input
                      id="editParking"
                      value={editParking}
                      onChange={(e) => setEditParking(e.target.value)}
                    />
                  </div>
                  <div className="form-row">
                    <label htmlFor="editOccupants">{tr('occupants')}</label>
                    <input
                      id="editOccupants"
                      type="number"
                      min={1}
                      value={editOccupants}
                      onChange={(e) => setEditOccupants(e.target.value)}
                    />
                  </div>
                  <div className="form-row">
                    <label htmlFor="editMoveIn">{tr('moveIn')}</label>
                    <input
                      id="editMoveIn"
                      value={editMoveIn}
                      onChange={(e) => setEditMoveIn(e.target.value)}
                    />
                  </div>
                  <div className="form-row">
                    <label htmlFor="editLeaseEnd">{tr('leaseEnd')}</label>
                    <input
                      id="editLeaseEnd"
                      value={editLeaseEnd}
                      onChange={(e) => setEditLeaseEnd(e.target.value)}
                    />
                  </div>
                  <div className="form-row">
                    <label htmlFor="editStatus">{tr('accountStatus')}</label>
                    <select
                      id="editStatus"
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as 'active' | 'arrears' | 'notice')}
                    >
                      <option value="active">{statusLabel(lang, 'active')}</option>
                      <option value="arrears">{statusLabel(lang, 'arrears')}</option>
                      <option value="notice">{statusLabel(lang, 'notice')}</option>
                    </select>
                  </div>
                  <div className="profile-item" style={{ margin: 0 }}>
                    <span className="k">{tr('currentPin')}</span>
                    <span className="v">{accountPin}</span>
                  </div>
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  type="button"
                  style={{ marginTop: '0.75rem' }}
                  onClick={() =>
                    updateResidentInfo({
                      name: editName,
                      phone: editPhone,
                      email: editEmail,
                      building: editBuilding,
                      buildingNumber: selectedResident.buildingNumber,
                      apartment: editApartment,
                      floor: selectedResident.floor,
                      parking: editParking,
                      occupants: Number(editOccupants) || 1,
                      moveIn: editMoveIn,
                      leaseEnd: editLeaseEnd,
                      status: editStatus,
                    })
                  }
                >
                  {tr('saveApartmentInfo')}
                </button>

                <h3 className="section-label" style={{ marginTop: '1.25rem' }}>
                  {tr('setLoginPin')}
                </h3>
                <p className="meta" style={{ marginTop: 0 }}>
                  {tr('setLoginPinHelp')}
                </p>
                <div className="rent-plan-editor">
                  <div className="form-row">
                    <label htmlFor="loginPhone">{tr('mobileNumber')}</label>
                    <input
                      id="loginPhone"
                      value={phoneDraft}
                      onChange={(e) => setPhoneDraft(e.target.value)}
                      inputMode="tel"
                    />
                  </div>
                  <div className="form-row">
                    <label htmlFor="loginPin">{tr('loginPin')}</label>
                    <input
                      id="loginPin"
                      value={pinDraft}
                      onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="1234"
                    />
                  </div>
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  type="button"
                  style={{ marginTop: '0.75rem' }}
                  onClick={() => saveResidentLoginPin(phoneDraft, pinDraft)}
                >
                  {tr('saveLoginPin')}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  style={{ marginTop: '0.5rem', marginInlineStart: '0.5rem' }}
                  onClick={() => {
                    if (!window.confirm(tr('clearLoginConfirm'))) return
                    clearResidentLogin()
                    setPhoneDraft('')
                    setPinDraft('')
                  }}
                >
                  {tr('clearLoginPin')}
                </button>

                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  style={{ marginTop: '0.5rem', marginInlineStart: '0.5rem' }}
                  onClick={exportSelectedApartment}
                >
                  {tr('exportApartmentExcel')}
                </button>
                {canClearApartment && (
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  style={{ marginTop: '0.5rem', marginInlineStart: '0.5rem' }}
                  onClick={() => {
                    if (!window.confirm(tr('clearApartmentConfirm'))) return
                    exportSelectedApartment()
                    clearApartmentInfo()
                    setEditName('')
                    setEditPhone('')
                    setEditEmail('')
                    setEditParking('')
                    setEditOccupants('1')
                    setEditMoveIn('')
                    setEditLeaseEnd('')
                    setEditStatus('active')
                    setPhoneDraft('')
                    setPinDraft('')
                    setContractDraft('0')
                    setPaidDraft('0')
                    setInstallmentDraft('0')
                    setDueDayDraft('1')
                    setScheduleDraft('monthly')
                  }}
                >
                  {tr('clearApartmentInfo')}
                </button>
                )}

                <h3 className="section-label">{tr('maintenanceTickets')}</h3>
                <div className="list">
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

                <h3 className="section-label">{tr('chatContext')}</h3>
                {selectedResident.id ? (
                  <div className="admin-chat-preview">
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
                      onClick={() => setTab('chat')}
                    >
                      {tr('continueInbox')}
                    </button>
                  </div>
                ) : (
                  <p className="meta" style={{ margin: 0 }}>
                    {tr('noChatHistory')}
                  </p>
                )}
              </section>
            </div>
          </>
        )}

        {tab === 'payments' && (
          <>
            <header className="page-head">
              <div>
                <h1>{tr('adminPaymentsTab')}</h1>
                <p>{tr('adminPaymentsLead')}</p>
              </div>
              <button className="btn btn-ghost btn-sm" type="button" onClick={exportEveryApartment}>
                {tr('exportAllApartmentsExcel')}
              </button>
            </header>
            <div className="grid-3" style={{ marginBottom: '1rem' }}>
              <section className="panel stat">
                <span className="value">{formatMoney(totalFromResidents).replace('AED ', '')}</span>
                <span className="label">{tr('totalFromResidents')}</span>
              </section>
              <section className="panel stat">
                <span className="value">{formatMoney(totalOutstanding).replace('AED ', '')}</span>
                <span className="label">{tr('totalOutstanding')}</span>
              </section>
              <section className="panel stat">
                <span className="value">{formatMoney(totalContractValue).replace('AED ', '')}</span>
                <span className="label">{tr('totalContractValue')}</span>
              </section>
            </div>
            <div className="grid-3">
              <section className="panel stat">
                <span className="value">{formatMoney(adminBalance).replace('AED ', '')}</span>
                <span className="label">{tr('merchantBalance')}</span>
              </section>
              <section className="panel stat">
                <span className="value">{payments.length}</span>
                <span className="label">{tr('settledPayments')}</span>
              </section>
            </div>

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

              <p
                style={{
                  margin: '1.25rem 0 0.75rem',
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.5rem',
                  fontWeight: 700,
                }}
              >
                {formatMoney(adminBalance)}
              </p>
              <h3
                className="section-label"
                style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}
              >
                {tr('pendingPayments')}
                {pendingPayments.length > 0 ? ` (${pendingPayments.length})` : ''}
              </h3>
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
              <div className="list" style={{ marginBottom: '1.25rem' }}>
                {pendingPayments.map((p) => (
                  <div className="list-row" key={p.id} style={{ alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <strong>
                        {formatMoney(p.amount)} · {p.residentName || p.unit}
                      </strong>
                      <div className="meta">
                        {p.unit} · {p.paidAt}
                        {p.bankReference ? (
                          <>
                            <br />
                            {tr('bankReferenceShort')}: {p.bankReference}
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
                      {p.transferProof?.dataUrl ? (
                        <a
                          className="proof-thumb"
                          href={p.transferProof.dataUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ marginTop: '0.65rem' }}
                        >
                          <img src={p.transferProof.dataUrl} alt={p.transferProof.name} />
                          <span>{tr('viewProof')}</span>
                        </a>
                      ) : (
                        <p className="meta" style={{ marginTop: '0.5rem' }}>
                          {tr('noTransferProof')}
                        </p>
                      )}
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '0.4rem',
                          marginTop: '0.75rem',
                        }}
                      >
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
                    </div>
                    <Badge lang={lang} status="pending_review" />
                  </div>
                ))}
                {pendingPayments.length === 0 && (
                  <p className="meta">{tr('noPendingPayments')}</p>
                )}
              </div>

              <h3 className="section-label">{tr('incomingPayments')}</h3>
              <p className="meta" style={{ marginTop: 0 }}>
                {tr('incomingPaymentsLead')}
              </p>
              <div className="list">
                {payments
                  .filter((p) => p.status !== 'pending_review' && p.status !== 'deleted')
                  .map((p) => (
                  <div className="list-row" key={p.id} style={{ alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <strong>
                        +{formatMoney(p.confirmedAmount ?? p.amount)} · {p.residentName || p.unit}
                      </strong>
                      <div className="meta">
                        {p.unit} · {paymentMethodLabel(p.method)} · {p.paidAt}
                      </div>
                      {p.transferProof?.dataUrl && (
                        <a
                          className="proof-thumb"
                          href={p.transferProof.dataUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <img src={p.transferProof.dataUrl} alt={p.transferProof.name} />
                          <span>{tr('viewProof')}</span>
                        </a>
                      )}
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
                {payments.filter((p) => p.status !== 'pending_review' && p.status !== 'deleted')
                  .length === 0 && (
                  <p className="meta">{tr('noPaymentsYet')}</p>
                )}
              </div>
            </section>

            <div className="admin-split" style={{ marginTop: '1rem' }}>
              <section className="panel resident-directory">
                <h2>{tr('apartments')}</h2>
                <p className="meta" style={{ marginTop: 0, marginBottom: '0.85rem' }}>
                  {tr('selectApartment')}
                </p>
                {renderResidentPicker(true)}
                <div style={{ marginTop: '1rem' }}>
                  <h2 style={{ fontSize: '1rem' }}>{tr('arrearsSnapshot')}</h2>
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
                          <td>{row.unit}</td>
                          <td>{formatMoney(row.amount)}</td>
                          <td>{row.days}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {arrearsList.length === 0 && (
                    <p className="meta">{tr('allClear')}</p>
                  )}
                </div>
              </section>

              <section className="panel resident-file">
                <div className="file-head">
                  <div>
                    <h2 style={{ marginBottom: '0.25rem' }}>
                      {apartmentDisplayTitle(selectedResident, lang)}
                    </h2>
                    <p className="meta" style={{ margin: 0 }}>
                      {unitCodeLabel(selectedResident)}
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
                        const next = e.target.value as RentSchedule
                        setScheduleDraft(next)
                        const total = Number(contractDraft) || selectedResident.contractTotal
                        setInstallmentDraft(String(suggestInstallment(total, next)))
                      }}
                    >
                      <option value="monthly">{rentScheduleLabel('monthly', lang)}</option>
                      <option value="quarterly">{rentScheduleLabel('quarterly', lang)}</option>
                      <option value="semi_annual">{rentScheduleLabel('semi_annual', lang)}</option>
                      <option value="annual">{rentScheduleLabel('annual', lang)}</option>
                      <option value="full_lease">{rentScheduleLabel('full_lease', lang)}</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <label htmlFor="dueDay">{tr('rentDueDay')} (1–28)</label>
                    <input
                      id="dueDay"
                      type="number"
                      min={1}
                      max={28}
                      value={dueDayDraft}
                      onChange={(e) => setDueDayDraft(e.target.value)}
                    />
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

                <h3 className="section-label">{tr('receivedAdmin')}</h3>
                <div className="list">
                  {adminResidentPayments.map((p) => (
                    <div className="list-row" key={p.id} style={{ alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <strong>+{formatMoney(p.confirmedAmount ?? p.amount)}</strong>
                        <div className="meta">
                          {paymentMethodLabel(p.method)} · {p.paidAt}
                          <br />
                          {p.destination}
                          {p.reviewNote ? (
                            <>
                              <br />
                              {p.reviewNote}
                            </>
                          ) : null}
                        </div>
                        {p.transferProof && (
                          <a
                            className="proof-thumb"
                            href={p.transferProof.dataUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <img src={p.transferProof.dataUrl} alt={p.transferProof.name} />
                            <span>{tr('viewProof')}</span>
                          </a>
                        )}
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
                {availableListings.map((apt) => (
                  <div className="list-row" key={apt.id}>
                    {apt.photoDataUrl ? (
                      <img className="listing-thumb" src={apt.photoDataUrl} alt="" />
                    ) : null}
                    <div>
                      <strong>
                        {apt.building} · {apt.apartment}
                      </strong>
                      <div className="meta">
                        {apt.bedrooms} {tr('bedrooms')} · {apt.bathrooms}{' '}
                        {tr('bathrooms')} · {apt.sizeSqm} {tr('sqm')} ·{' '}
                        {formatMoney(apt.rentMonthly, apt.currency)}
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
                          removeAvailableListing(apt.id)
                          if (editingListingId === apt.id) resetListingForm()
                        }}
                      >
                        {tr('removeListing')}
                      </button>
                    </div>
                    )}
                  </div>
                ))}
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
              <button className="btn btn-ghost" type="button" onClick={() => setTab('info')}>
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
            { id: 'payments' as Tab, labelKey: 'adminPaymentsTab', icon: 'payments' as const },
            { id: 'available' as Tab, labelKey: 'adminAvailableTab', icon: 'available' as const },
            { id: 'chat' as Tab, labelKey: 'inbox', icon: 'inbox' as const },
          ]
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'active' : ''}
            onClick={() => setTab(item.id)}
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
