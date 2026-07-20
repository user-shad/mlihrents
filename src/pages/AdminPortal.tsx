import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  adminStats,
  amountsMatch,
  apartmentDisplayTitle,
  apartmentSortKey,
  arrearsList,
  AvailableApartment,
  formatMoney,
  paymentMethodLabel,
  remainingBalance,
  rentScheduleLabel,
  RentSchedule,
  serviceDirectory,
  suggestInstallment,
  unitCodeLabel,
} from '../data'
import { statusLabel } from '../i18n'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { useData } from '../context/DataContext'
import { Badge, BrandMark, LanguageSwitch, NavIcon, RentBalanceCard } from '../components/ui'
import { bankSummary, isBankConfigured } from '../config/paymentSettings'

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
  const { logout, accounts } = useAuth()
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
    adminResidentInvoices,
    adminResidentTickets,
    adminResidentPayments,
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
    updateResidentInfo,
    resetHumanMode,
    availableListings,
    addAvailableListing,
    updateAvailableListing,
    removeAvailableListing,
    bankSettings,
    saveBankSettings,
  } = useData()

  const [tab, setTab] = useState<Tab>('info')
  const [pinDraft, setPinDraft] = useState(selectedResident.pin)
  const [phoneDraft, setPhoneDraft] = useState(selectedResident.phone)
  const [editName, setEditName] = useState(selectedResident.name)
  const [editPhone, setEditPhone] = useState(selectedResident.phone)
  const [editEmail, setEditEmail] = useState(selectedResident.email ?? '')
  const [editBuilding, setEditBuilding] = useState(selectedResident.building)
  const [editBuildingNumber, setEditBuildingNumber] = useState(selectedResident.buildingNumber)
  const [editApartment, setEditApartment] = useState(selectedResident.apartment)
  const [editFloor, setEditFloor] = useState(String(selectedResident.floor))
  const [editParking, setEditParking] = useState(selectedResident.parking)
  const [editOccupants, setEditOccupants] = useState(String(selectedResident.occupants ?? 1))
  const [editMoveIn, setEditMoveIn] = useState(selectedResident.moveIn ?? '')
  const [editLeaseEnd, setEditLeaseEnd] = useState(selectedResident.leaseEnd)
  const [editStatus, setEditStatus] = useState<'active' | 'arrears' | 'notice'>(
    selectedResident.status ?? 'active',
  )
  const [editingListingId, setEditingListingId] = useState<string | null>(null)
  const [listingForm, setListingForm] = useState(emptyListingForm)
  const [verifyDrafts, setVerifyDrafts] = useState<Record<string, string>>({})
  const [bankDraft, setBankDraft] = useState(bankSettings)

  useEffect(() => {
    setBankDraft(bankSettings)
  }, [bankSettings])

  useEffect(() => {
    setVerifyDrafts((prev) => {
      const next = { ...prev }
      for (const p of pendingPayments) {
        if (next[p.id] === undefined) next[p.id] = String(p.amount)
      }
      return next
    })
  }, [pendingPayments])

  useEffect(() => {
    setPinDraft(selectedResident.pin)
    setPhoneDraft(selectedResident.phone)
    setEditName(selectedResident.name)
    setEditPhone(selectedResident.phone)
    setEditEmail(selectedResident.email ?? '')
    setEditBuilding(selectedResident.building)
    setEditBuildingNumber(selectedResident.buildingNumber)
    setEditApartment(selectedResident.apartment)
    setEditFloor(String(selectedResident.floor))
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

    return (
      <div className="list">
        {sorted.map((r) => {
          const unit = unitCodeLabel(r)
          const active = r.id === selectedResidentId
          const title = apartmentDisplayTitle(r, lang)
          const vacant = !r.name.trim()
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
    )
  }

  return (
    <div className="portal">
      <aside className="sidebar">
        <div className="brand" style={{ color: '#f7faf8' }}>
          <BrandMark />
          MLIHrents
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
          <strong>{tr('buildingManager')}</strong>
          <span>{tr('palmOps')}</span>
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
            </header>
            <div className="grid-3">
              <section className="panel stat">
                <span className="value">
                  {adminStats.occupied}/{adminStats.units}
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
                {serviceDirectory.map((c) => (
                  <div className="list-row" key={c.id}>
                    <div>
                      <strong>
                        {c.role} · {c.name}
                      </strong>
                      <div className="meta">
                        {c.category} · {c.hours} · {c.notes}
                      </div>
                    </div>
                    <a className="btn btn-ghost btn-sm" href={`tel:${c.phone.replace(/\s/g, '')}`}>
                      {c.phone}
                    </a>
                  </div>
                ))}
              </div>
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
                      {selectedResident.floor ? ` · ${tr('floor')} ${selectedResident.floor}` : ''}
                    </p>
                  </div>
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
                    <label htmlFor="editBuildingNumber">{tr('building')} #</label>
                    <input
                      id="editBuildingNumber"
                      value={editBuildingNumber}
                      onChange={(e) => setEditBuildingNumber(e.target.value)}
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
                    <label htmlFor="editFloor">{tr('floor')}</label>
                    <input
                      id="editFloor"
                      type="number"
                      min={0}
                      value={editFloor}
                      onChange={(e) => setEditFloor(e.target.value)}
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
                      buildingNumber: editBuildingNumber,
                      apartment: editApartment,
                      floor: Number(editFloor) || 0,
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

                <h3 className="section-label">{tr('setLoginPin')}</h3>
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
                  <div className="list">
                    <div className="list-row">
                      <div>
                        <strong>
                          {lang === 'ar' ? 'لا توجد محادثة حية' : 'No live demo thread'}
                        </strong>
                        <div className="meta">
                          {lang === 'ar'
                            ? `آخر محادثة لـ ${selectedResident.name.split(' ')[0]}: تذكير إيجار · بدون تحويل`
                            : `${selectedResident.name.split(' ')[0]}’s last AI chat: rent reminder answered · no escalation`}
                        </div>
                      </div>
                      <Badge lang={lang} status="resolved" />
                    </div>
                  </div>
                )}

                <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    onClick={() =>
                      showToast(
                        lang === 'ar'
                          ? `تم تجهيز عقد ${selectedResident.name}`
                          : `Lease PDF queued for ${selectedResident.name}`,
                      )
                    }
                  >
                    {tr('downloadLease')}
                  </button>
                </div>
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
            </header>
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
                    onChange={(e) => setBankDraft((d) => ({ ...d, accountNumber: e.target.value }))}
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
                onClick={() => saveBankSettings(bankDraft)}
              >
                {tr('saveBankSettings')}
              </button>

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
              </h3>
              <p className="meta" style={{ marginTop: 0 }}>
                {tr('pendingPaymentsLead')}
              </p>
              <div className="list" style={{ marginBottom: '1.25rem' }}>
                {pendingPayments.map((p) => {
                  const draft = verifyDrafts[p.id] ?? String(p.amount)
                  const verified = Number(draft)
                  const exact = amountsMatch(verified, p.amount)
                  return (
                    <div className="list-row" key={p.id} style={{ alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <strong>
                          {formatMoney(p.amount)} · {p.residentName}
                        </strong>
                        <div className="meta">
                          {p.unit} · {p.invoiceId} · {p.paidAt}
                        </div>

                        {p.paymentRef && (
                          <div className="payment-ref-box">
                            <span className="meta">{tr('paymentRefLabel')}</span>
                            <code className="payment-ref-code">{p.paymentRef}</code>
                            <span className="meta">{tr('matchRefOnStatement')}</span>
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() => {
                                void navigator.clipboard?.writeText(p.paymentRef ?? '')
                                showToast(tr('paymentRefCopied'))
                              }}
                            >
                              {tr('paymentRefCopy')}
                            </button>
                          </div>
                        )}

                        <div className="meta" style={{ marginTop: '0.45rem' }}>
                          {tr('expectedInvoice')}: <strong>{formatMoney(p.amount)}</strong>
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
                        <div className="form-row" style={{ marginTop: '0.65rem', maxWidth: 220 }}>
                          <label htmlFor={`verify-${p.id}`}>{tr('verifiedAmount')}</label>
                          <input
                            id={`verify-${p.id}`}
                            type="number"
                            min={0}
                            step="0.01"
                            value={draft}
                            onChange={(e) =>
                              setVerifyDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))
                            }
                          />
                          {!exact && Number.isFinite(verified) && verified > 0 && (
                            <span className="meta">{tr('amountMismatch')}</span>
                          )}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '0.4rem',
                            marginTop: '0.5rem',
                          }}
                        >
                          <button
                            className="btn btn-primary btn-sm"
                            type="button"
                            disabled={!exact}
                            onClick={() => confirmBankPayment(p.id, verified, false)}
                          >
                            {tr('confirmExact')}
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            disabled={!Number.isFinite(verified) || verified <= 0 || exact}
                            onClick={() => confirmBankPayment(p.id, verified, true)}
                          >
                            {tr('confirmPartial')}
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            onClick={() => rejectBankPayment(p.id)}
                          >
                            {tr('rejectPayment')}
                          </button>
                        </div>
                      </div>
                      <Badge lang={lang} status="pending_review" />
                    </div>
                  )
                })}
                {pendingPayments.length === 0 && (
                  <p className="meta">{tr('noPendingPayments')}</p>
                )}
              </div>

              <h3 className="section-label">{tr('incomingPayments')}</h3>
              <div className="list">
                {payments.map((p) => (
                  <div className="list-row" key={p.id}>
                    <div>
                      <strong>
                        +{formatMoney(p.confirmedAmount ?? p.amount)} · {p.residentName}
                      </strong>
                        <div className="meta">
                          {p.unit} · {p.invoiceId} · {paymentMethodLabel(p.method)} · {p.paidAt}
                        </div>
                        {p.paymentRef && (
                          <div className="payment-ref-box" style={{ marginTop: '0.35rem' }}>
                            <span className="meta">{tr('paymentRefLabel')}</span>
                            <code className="payment-ref-code">{p.paymentRef}</code>
                          </div>
                        )}
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
                    </div>
                    <Badge lang={lang} status={p.status === 'settled' ? 'paid' : p.status} />
                  </div>
                ))}
                {payments.length === 0 && <p className="meta">{tr('noPaymentsYet')}</p>}
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
                      {selectedResident.floor ? ` · ${tr('floor')} ${selectedResident.floor}` : ''}
                    </p>
                  </div>
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

                <h3 className="section-label">{tr('paymentsInvoices')}</h3>
                <div className="list">
                  {adminResidentInvoices.map((inv) => {
                    const linkedPay = adminResidentPayments.find((p) => p.invoiceId === inv.id)
                    return (
                    <div className="list-row" key={inv.id}>
                      <div>
                        <strong>{inv.period}</strong>
                        <div className="meta">
                          {inv.id} · due {inv.dueDate} · {formatMoney(inv.amount)}
                          {(inv.extensionDays ?? 0) > 0
                            ? ` · ${tr('extendedLabel')} +${inv.extensionDays}d`
                            : ''}
                        </div>
                        {linkedPay?.paymentRef && (
                          <div className="payment-ref-box" style={{ marginTop: '0.45rem' }}>
                            <span className="meta">{tr('paymentRefLabel')}</span>
                            <code className="payment-ref-code">{linkedPay.paymentRef}</code>
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() => {
                                void navigator.clipboard?.writeText(linkedPay.paymentRef ?? '')
                                showToast(tr('paymentRefCopied'))
                              }}
                            >
                              {tr('paymentRefCopy')}
                            </button>
                          </div>
                        )}
                      </div>
                      <Badge
                        lang={lang}
                        status={
                          linkedPay?.status === 'pending_review'
                            ? 'pending_review'
                            : inv.status
                        }
                      />
                    </div>
                    )
                  })}
                  {adminResidentInvoices.length === 0 && (
                    <p className="meta">{tr('noInvoices')}</p>
                  )}
                </div>

                <h3 className="section-label">{tr('receivedAdmin')}</h3>
                <div className="list">
                  {adminResidentPayments.map((p) => (
                    <div className="list-row" key={p.id}>
                      <div>
                        <strong>+{formatMoney(p.confirmedAmount ?? p.amount)}</strong>
                        <div className="meta">
                          {paymentMethodLabel(p.method)}
                          {p.paymentRef ? ` · ${p.paymentRef}` : ''} · {p.paidAt}
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
                      </div>
                      <Badge lang={lang} status={p.status === 'settled' ? 'paid' : p.status} />
                    </div>
                  ))}
                  {adminResidentPayments.length === 0 && (
                    <p className="meta">{tr('noPaymentsYet')}</p>
                  )}
                </div>

                <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    onClick={() =>
                      showToast(
                        lang === 'ar'
                          ? `تم إرسال تذكير الإيجار إلى ${selectedResident.phone}`
                          : `Payment reminder sent to ${selectedResident.phone}`,
                      )
                    }
                  >
                    {tr('sendReminder')}
                  </button>
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
                        {apt.building} · {apt.buildingNumber}-{apt.apartment}
                      </strong>
                      <div className="meta">
                        {tr('floor')} {apt.floor} · {apt.bedrooms} {tr('bedrooms')} · {apt.bathrooms}{' '}
                        {tr('bathrooms')} · {apt.sizeSqm} {tr('sqm')} ·{' '}
                        {formatMoney(apt.rentMonthly, apt.currency)}
                        <br />
                        {lang === 'ar' ? apt.highlightAr : apt.highlight}
                      </div>
                    </div>
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
                  </div>
                ))}
                {availableListings.length === 0 && (
                  <p className="meta">{tr('adminAvailableLead')}</p>
                )}
              </div>
            </section>

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
                  <label htmlFor="listBuildingNumber">{tr('building')} #</label>
                  <input
                    id="listBuildingNumber"
                    value={listingForm.buildingNumber}
                    onChange={(e) =>
                      setListingForm((f) => ({ ...f, buildingNumber: e.target.value }))
                    }
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
                  <label htmlFor="listFloor">{tr('floor')}</label>
                  <input
                    id="listFloor"
                    type="number"
                    min={0}
                    value={listingForm.floor}
                    onChange={(e) => setListingForm((f) => ({ ...f, floor: e.target.value }))}
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
