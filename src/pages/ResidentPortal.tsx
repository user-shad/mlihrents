import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  buildPaymentDueAnnouncements,
  buildPaymentRef,
  formatDueDateFromDay,
  formatMoney,
  paymentMethodLabel,
  remainingBalance,
  rentScheduleLabel,
  serviceDirectory,
  unitCodeLabel,
} from '../data'
import { siteLegal } from '../legal/siteLegal'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { useData } from '../context/DataContext'
import { Badge, BrandMark, LanguageSwitch, NavIcon, RentBalanceCard } from '../components/ui'

type Tab = 'home' | 'pay' | 'tickets' | 'chat' | 'profile'

export default function ResidentPortal() {
  const navigate = useNavigate()
  const { logout, session } = useAuth()
  const { lang, tr } = useLang()
  const {
    tickets,
    payments,
    paidIds,
    messages,
    humanMode,
    liveResident,
    visibleInvoices,
    dueInvoice,
    checkoutInvoice,
    ticketTitle,
    setTicketTitle,
    ticketCategory,
    setTicketCategory,
    ticketNote,
    setTicketNote,
    bankProof,
    setBankProofFromFile,
    clearBankProof,
    paying,
    bankSettings,
    bankConfigured,
    invoiceHasPendingPayment,
    toast,
    chatInput,
    setChatInput,
    chatEndRef,
    showToast,
    openCheckout,
    closeCheckout,
    extendInvoiceDueDate,
    completePayment,
    createTicket,
    escalateToHuman,
    sendChat,
    resetHumanMode,
  } = useData()

  const residentName = liveResident.name || session?.name || ''
  const residentFirstName = residentName.split(' ')[0] || residentName || 'there'

  const [searchParams] = useSearchParams()
  const initialTab = searchParams.get('tab')
  const [tab, setTab] = useState<Tab>(
    initialTab === 'pay' || initialTab === 'tickets' || initialTab === 'chat' || initialTab === 'profile'
      ? initialTab
      : 'home',
  )
  const paymentNotices = buildPaymentDueAnnouncements(visibleInvoices, lang)

  function handleLogout() {
    resetHumanMode()
    logout()
    navigate('/')
  }

  const navItems: { id: Tab; labelKey: string }[] = [
    { id: 'home', labelKey: 'home' },
    { id: 'pay', labelKey: 'pay' },
    { id: 'tickets', labelKey: 'tickets' },
    { id: 'chat', labelKey: 'chat' },
    { id: 'profile', labelKey: 'profile' },
  ]

  return (
    <div className="portal">
      <aside className="sidebar">
        <div className="brand" style={{ color: '#f7faf8' }}>
          <BrandMark />
          {siteLegal.brandName}
        </div>

        <LanguageSwitch />

        <nav className="side-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`side-link ${tab === item.id ? 'active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              {tr(item.labelKey)}
            </button>
          ))}
        </nav>

        <div className="user-card">
          <strong>{residentName}</strong>
          <span>
            {liveResident.building} · {liveResident.apartment}
          </span>
        </div>

        <div className="side-footer">
          <button className="btn btn-ghost btn-sm logout-btn" type="button" onClick={handleLogout}>
            {tr('signOut')}
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="portal-topbar">
          <span className="meta">{tr('resident')}</span>
          <button className="btn btn-ghost btn-sm" type="button" onClick={handleLogout}>
            {tr('signOut')}
          </button>
        </div>
        {tab === 'home' && (
          <>
            <header className="page-head">
              <div>
                <h1>
                  {tr('goodEvening')}
                  {lang === 'ar' ? '، ' : ', '}
                  {residentFirstName}
                </h1>
                <p>
                  {liveResident.building} · {tr('apartment')} {liveResident.apartment}
                </p>
              </div>
              <button className="btn btn-primary" type="button" onClick={() => setTab('chat')}>
                {tr('askShade')}
              </button>
            </header>

            <div className="grid-2">
              <section className="panel rent-hero">
                <p className="muted" style={{ margin: 0 }}>
                  {tr('nextRent')}
                </p>
                <div className="rent-amount">
                  {dueInvoice ? formatMoney(dueInvoice.amount) : tr('allClear')}
                </div>
                <p className="muted" style={{ margin: '0 0 1rem' }}>
                  {dueInvoice
                    ? `${dueInvoice.period} · ${tr('due')} ${dueInvoice.dueDate}`
                    : tr('noOutstanding')}
                </p>
                {dueInvoice && (
                  <button
                    className="btn btn-accent"
                    type="button"
                    onClick={() => {
                      setTab('pay')
                      openCheckout(dueInvoice.id)
                    }}
                  >
                    {tr('payNow')}
                  </button>
                )}
              </section>

              <section className="panel">
                <h2>{tr('yourUnit')}</h2>
                <div className="list">
                  <div className="list-row">
                    <div>
                      <strong>
                        {tr('apartment')} {liveResident.apartment}
                      </strong>
                      <div className="meta">{liveResident.building}</div>
                    </div>
                  </div>
                  <div className="list-row">
                    <div>
                      <strong>
                        {tr('parking')} {liveResident.parking || '—'}
                      </strong>
                    </div>
                  </div>
                  <div className="list-row">
                    <div>
                      <strong>{tr('leaseEnds')}</strong>
                      <div className="meta">{liveResident.leaseEnd}</div>
                    </div>
                  </div>
                  <div className="list-row">
                    <div>
                      <strong>{tr('rentDueDay')}</strong>
                      <div className="meta">
                        {formatDueDateFromDay(liveResident.rentDueDay, 'Jul 2026', lang)}
                        {lang === 'ar' ? ' · كل شهر' : ' · every month'}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <RentBalanceCard resident={liveResident} lang={lang} tr={tr} />
            </div>

            <div className="grid-2" style={{ marginTop: '1rem' }}>
              <section className="panel">
                <h2>{tr('announcements')}</h2>
                <div className="list">
                  {paymentNotices.map((a) => (
                    <div className="list-row" key={a.id}>
                      <div>
                        <strong>{a.title}</strong>
                        <div className="meta">{a.body}</div>
                      </div>
                      <span className="meta">{a.date}</span>
                    </div>
                  ))}
                  {paymentNotices.length === 0 && (
                    <p className="meta">{tr('noPaymentDue')}</p>
                  )}
                </div>
              </section>
              <section className="panel">
                <h2>{tr('openTickets')}</h2>
                <div className="list">
                  {tickets
                    .filter((tkt) => tkt.status !== 'resolved')
                    .map((tkt) => (
                      <div className="list-row" key={tkt.id}>
                        <div>
                          <strong>{tkt.title}</strong>
                          <div className="meta">
                            {tkt.id} · {tkt.note}
                          </div>
                        </div>
                        <Badge lang={lang} status={tkt.status} />
                      </div>
                    ))}
                  {tickets.every((tkt) => tkt.status === 'resolved') && (
                    <p className="meta">{tr('noOpenTickets')}</p>
                  )}
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  style={{ marginTop: '0.75rem' }}
                  onClick={() => setTab('tickets')}
                >
                  {tr('newTicket')}
                </button>
              </section>
            </div>
          </>
        )}

        {tab === 'pay' && (
          <>
            <header className="page-head">
              <div>
                <h1>{tr('rentPayments')}</h1>
                <p>{tr('payLead')}</p>
              </div>
            </header>
            {paidIds.length > 0 && !checkoutInvoice && (
              <div className="success-flash">
                {tr('paymentSubmittedReview')}. {tr('receiptSaved')}
              </div>
            )}

            {!checkoutInvoice && (
              <div style={{ marginBottom: '1rem' }}>
                <RentBalanceCard resident={liveResident} lang={lang} tr={tr} />
              </div>
            )}

            {checkoutInvoice ? (
              <section className="panel checkout-panel">
                <div className="file-head">
                  <div>
                    <h2 style={{ marginBottom: '0.25rem' }}>{tr('checkout')}</h2>
                    <p className="meta" style={{ margin: 0 }}>
                      {checkoutInvoice.period} · {checkoutInvoice.id} · {tr('due')}{' '}
                      {checkoutInvoice.dueDate}
                    </p>
                  </div>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={closeCheckout}>
                    {tr('cancel')}
                  </button>
                </div>

                <div className="rent-amount" style={{ fontSize: '2.2rem', margin: '0.75rem 0 1rem' }}>
                  {formatMoney(checkoutInvoice.amount)}
                </div>

                <p className="meta" style={{ marginTop: 0 }}>
                  {tr('payingFrom')} {residentName || tr('tenant')} · {unitCodeLabel(liveResident)}
                </p>

                <h3
                  className="section-label"
                  style={{ borderTop: 'none', paddingTop: 0, marginTop: '0.5rem' }}
                >
                  {tr('bankPay')}
                </h3>

                {!bankConfigured && (
                  <div className="bank-link-box" style={{ marginBottom: '1rem' }}>
                    <strong>{tr('bankNotConfiguredResident')}</strong>
                    <span className="meta">{tr('bankNotConfiguredResidentHelp')}</span>
                  </div>
                )}

                {bankConfigured && (
                  <>
                    <h3
                      className="section-label"
                      style={{ borderTop: 'none', paddingTop: 0, marginTop: '0.5rem' }}
                    >
                      {tr('bankTransferDetails')}
                    </h3>
                    <div className="bank-transfer-block">
                      <div className="bank-link-box">
                        <span className="meta">{tr('accountHolder')}</span>
                        <strong>{bankSettings.accountName}</strong>
                      </div>
                      <div className="bank-link-box">
                        <span className="meta">{tr('bankName')}</span>
                        <strong>{bankSettings.bankName}</strong>
                      </div>
                      <div className="bank-link-box">
                        <span className="meta">{tr('iban')}</span>
                        <code>{bankSettings.iban}</code>
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          style={{ marginTop: '0.35rem', justifySelf: 'start' }}
                          onClick={() => {
                            void navigator.clipboard?.writeText(bankSettings.iban)
                            showToast(tr('ibanCopied'))
                          }}
                        >
                          {tr('ibanCopy')}
                        </button>
                      </div>
                      {bankSettings.accountNumber && (
                        <div className="bank-link-box">
                          <span className="meta">{tr('accountNumber')}</span>
                          <code>{bankSettings.accountNumber}</code>
                        </div>
                      )}
                      {bankSettings.swift && (
                        <div className="bank-link-box">
                          <span className="meta">{tr('swift')}</span>
                          <code>{bankSettings.swift}</code>
                        </div>
                      )}
                      {bankSettings.bankAddress && (
                        <div className="bank-link-box">
                          <span className="meta">{tr('bankAddress')}</span>
                          <strong>{bankSettings.bankAddress}</strong>
                        </div>
                      )}
                      <div className="bank-link-box">
                        <span className="meta">{tr('transferAmount')}</span>
                        <strong>{formatMoney(checkoutInvoice.amount)}</strong>
                      </div>
                      <div className="bank-link-box">
                        <strong>{tr('paymentRefLabel')}</strong>
                        <code>
                          {buildPaymentRef(unitCodeLabel(liveResident), checkoutInvoice.id)}
                        </code>
                        <span className="meta">{tr('paymentRefHint')}</span>
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          style={{ marginTop: '0.35rem', justifySelf: 'start' }}
                          onClick={() => {
                            const ref = buildPaymentRef(
                              unitCodeLabel(liveResident),
                              checkoutInvoice.id,
                            )
                            void navigator.clipboard?.writeText(ref)
                            showToast(tr('paymentRefCopied'))
                          }}
                        >
                          {tr('paymentRefCopy')}
                        </button>
                      </div>

                      <p className="hint" style={{ margin: '0 0 0.75rem' }}>
                        {tr('bankReviewHint')}
                      </p>

                      <div className="transfer-proof">
                        <label className="transfer-proof-label" htmlFor="bankProof">
                          {tr('transferProofLabel')}
                        </label>
                        <p className="meta" style={{ margin: '0 0 0.65rem' }}>
                          {tr('transferProofHint')}
                        </p>
                        <input
                          id="bankProof"
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="transfer-proof-input"
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null
                            setBankProofFromFile(file)
                            e.target.value = ''
                          }}
                        />
                        {bankProof ? (
                          <div className="transfer-proof-preview">
                            <img src={bankProof.dataUrl} alt={bankProof.name} />
                            <div className="transfer-proof-meta">
                              <strong>{tr('transferProofAttached')}</strong>
                              <span className="meta">{bankProof.name}</span>
                              <div className="transfer-proof-actions">
                                <label htmlFor="bankProof" className="btn btn-ghost btn-sm">
                                  {tr('transferProofChange')}
                                </label>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  type="button"
                                  onClick={clearBankProof}
                                >
                                  {tr('transferProofRemove')}
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <label htmlFor="bankProof" className="transfer-proof-drop">
                            <span>{tr('transferProofChoose')}</span>
                            <span className="meta">PNG, JPG, HEIC · max 8 MB</span>
                          </label>
                        )}
                      </div>
                    </div>
                    <form onSubmit={completePayment}>
                      <button
                        className="btn btn-accent btn-block"
                        type="submit"
                        disabled={paying || !bankProof}
                      >
                        {paying
                          ? tr('processing')
                          : `${tr('submitTransferProof')} · ${formatMoney(checkoutInvoice.amount)}`}
                      </button>
                    </form>
                  </>
                )}
              </section>
            ) : (
              <>
                <section className="panel">
                  <h2>{tr('invoices')}</h2>
                  <div className="list">
                    {visibleInvoices.map((inv) => {
                      const pending = invoiceHasPendingPayment(inv.id)
                      return (
                      <div className="list-row" key={inv.id}>
                        <div>
                          <strong>{inv.period}</strong>
                          <div className="meta">
                            {inv.id} · {tr('due')} {inv.dueDate} · {formatMoney(inv.amount)}
                            {(inv.extensionDays ?? 0) > 0
                              ? ` · ${tr('extendedLabel')} +${inv.extensionDays}d`
                              : ''}
                          </div>
                          {inv.status === 'overdue' && !pending && (
                            <div className="meta" style={{ marginTop: '0.35rem' }}>
                              {tr('extensionNote')}
                            </div>
                          )}
                          {pending && (
                            <div className="meta" style={{ marginTop: '0.35rem' }}>
                              {tr('underReview')}
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.65rem',
                            flexWrap: 'wrap',
                            justifyContent: 'flex-end',
                          }}
                        >
                          <Badge lang={lang} status={pending ? 'pending_review' : inv.status} />
                          {inv.status === 'overdue' && !pending && (
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() => extendInvoiceDueDate(inv.id, 7)}
                            >
                              {tr('extendBy7')}
                            </button>
                          )}
                          {inv.status !== 'paid' && !pending && (
                            <button
                              className="btn btn-primary btn-sm"
                              type="button"
                              onClick={() => openCheckout(inv.id)}
                            >
                              {tr('pay')}
                            </button>
                          )}
                        </div>
                      </div>
                      )
                    })}
                    {visibleInvoices.length === 0 && (
                      <p className="meta">{tr('noInvoices')}</p>
                    )}
                  </div>
                </section>

                <section className="panel" style={{ marginTop: '1rem' }}>
                  <h2>{tr('paymentHistory')}</h2>
                  <div className="list">
                    {payments
                      .filter((p) => p.residentId === liveResident.id)
                      .map((p) => (
                        <div className="list-row" key={p.id}>
                          <div>
                            <strong>{formatMoney(p.confirmedAmount ?? p.amount)}</strong>
                            <div className="meta">
                              {p.id} · {paymentMethodLabel(p.method)} · {p.paidAt}
                              {p.paymentRef ? ` · ${p.paymentRef}` : ''}
                              <br />
                              {tr('sentTo')} {p.destination}
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
                    {payments.filter((p) => p.residentId === liveResident.id).length === 0 && (
                      <p className="meta">{tr('noPaymentsYet')}</p>
                    )}
                  </div>
                </section>
              </>
            )}
          </>
        )}

        {tab === 'tickets' && (
          <>
            <header className="page-head">
              <div>
                <h1>{tr('maintenance')}</h1>
                <p>
                  {tr('ticketsAuto')} {tr('apartment')}{' '}
                  {liveResident.apartment}
                </p>
              </div>
            </header>
            <div className="grid-2">
              <section className="panel">
                <h2>{tr('reportIssue')}</h2>
                <form onSubmit={createTicket}>
                  <div className="form-row">
                    <label htmlFor="title">{tr('title')}</label>
                    <input
                      id="title"
                      value={ticketTitle}
                      onChange={(e) => setTicketTitle(e.target.value)}
                      placeholder={lang === 'ar' ? 'مثال: صوت من السخان' : 'e.g. Water heater noise'}
                    />
                  </div>
                  <div className="form-row">
                    <label htmlFor="category">{tr('category')}</label>
                    <select
                      id="category"
                      value={ticketCategory}
                      onChange={(e) => setTicketCategory(e.target.value)}
                    >
                      <option value="Plumbing">{tr('plumbing')}</option>
                      <option value="HVAC">{tr('hvac')}</option>
                      <option value="Electrical">{tr('electrical')}</option>
                      <option value="Appliance">{tr('appliance')}</option>
                      <option value="Other">{tr('other')}</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <label htmlFor="note">{tr('details')}</label>
                    <textarea
                      id="note"
                      value={ticketNote}
                      onChange={(e) => setTicketNote(e.target.value)}
                      placeholder={
                        lang === 'ar'
                          ? 'متى بدأت، أوقات الدخول…'
                          : 'When it started, access times, photos later…'
                      }
                    />
                  </div>
                  <button className="btn btn-primary" type="submit">
                    {tr('submitTicket')}
                  </button>
                </form>
              </section>
              <section className="panel">
                <h2>{tr('yourTickets')}</h2>
                <div className="list">
                  {tickets.map((t) => (
                    <div className="list-row" key={t.id}>
                      <div>
                        <strong>{t.title}</strong>
                        <div className="meta">
                          {t.id} · {t.category} · {t.created}
                          <br />
                          {t.note}
                        </div>
                      </div>
                      <Badge lang={lang} status={t.status} />
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </>
        )}

        {tab === 'chat' && (
          <>
            <header className="page-head">
              <div>
                <h1>{tr('askShadeTitle')}</h1>
                <p>{tr('chatLeadAi')}</p>
              </div>
            </header>
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
                      : `${tr('linkedTo')} ${liveResident.apartment}`}
                  </span>
                </div>
                {!humanMode && (
                  <button className="btn btn-accent btn-sm" type="button" onClick={escalateToHuman}>
                    {tr('talkToPerson')}
                  </button>
                )}
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
              {!humanMode && (
                <div className="quick-prompts">
                  {[tr('promptAc'), tr('promptNumbers'), tr('promptHuman')].map((q) => (
                    <button key={q} className="chip" type="button" onClick={() => sendChat(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              )}
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

        {tab === 'profile' && (
          <>
            <header className="page-head">
              <div>
                <h1>{tr('aptProfile')}</h1>
                <p>{tr('profileLead')}</p>
              </div>
            </header>
            <section className="panel">
              <div className="profile-grid">
                <div className="profile-item">
                  <span className="k">{tr('fullName')}</span>
                  <span className="v">{residentName}</span>
                </div>
                <div className="profile-item">
                  <span className="k">{tr('phone')}</span>
                  <span className="v">{liveResident.phone}</span>
                </div>
                <div className="profile-item">
                  <span className="k">{tr('building')}</span>
                  <span className="v">{liveResident.building}</span>
                </div>
                <div className="profile-item">
                  <span className="k">{tr('apartment')}</span>
                  <span className="v">{liveResident.apartment}</span>
                </div>
                <div className="profile-item">
                  <span className="k">{tr('parking')}</span>
                  <span className="v">{liveResident.parking}</span>
                </div>
                <div className="profile-item">
                  <span className="k">{tr('monthlyRent')}</span>
                  <span className="v">{formatMoney(liveResident.rentAmount)}</span>
                </div>
                <div className="profile-item">
                  <span className="k">{tr('leaseEnd')}</span>
                  <span className="v">{liveResident.leaseEnd}</span>
                </div>
                <div className="profile-item">
                  <span className="k">{tr('rentDueDay')}</span>
                  <span className="v">
                    {lang === 'ar'
                      ? `يوم ${liveResident.rentDueDay} من كل شهر`
                      : `Day ${liveResident.rentDueDay} each month`}
                  </span>
                </div>
                <div className="profile-item">
                  <span className="k">{tr('nextDueDate')}</span>
                  <span className="v">
                    {formatDueDateFromDay(liveResident.rentDueDay, 'Jul 2026', lang)}
                  </span>
                </div>
                <div className="profile-item">
                  <span className="k">{tr('rentSchedule')}</span>
                  <span className="v">{rentScheduleLabel(liveResident.rentSchedule, lang)}</span>
                </div>
                <div className="profile-item">
                  <span className="k">{tr('amountRemaining')}</span>
                  <span className="v">
                    {remainingBalance(liveResident) <= 0
                      ? tr('fullyPaid')
                      : formatMoney(remainingBalance(liveResident), liveResident.currency)}
                  </span>
                </div>
              </div>
              <div style={{ marginTop: '1rem' }}>
                <RentBalanceCard resident={liveResident} lang={lang} tr={tr} />
              </div>
              <a
                className="btn btn-ghost"
                style={{ marginTop: '1rem', display: 'inline-block', textDecoration: 'none' }}
                href={`tel:${serviceDirectory.find((c) => c.id === 'c-security')?.phone.replace(/\s/g, '') ?? siteLegal.phone.replace(/\s/g, '')}`}
              >
                {tr('visitorPass')}
              </a>
              <button
                className="btn btn-primary"
                type="button"
                style={{ marginTop: '0.75rem', marginInlineStart: '0.5rem' }}
                onClick={handleLogout}
              >
                {tr('signOut')}
              </button>
            </section>
            <section className="panel" style={{ marginTop: '1rem' }}>
              <h2>{tr('serviceNumbers')}</h2>
              <p className="meta" style={{ marginTop: 0 }}>
                {tr('serviceNumbersLead')}
              </p>
              <div className="list">
                {serviceDirectory.map((c) => (
                  <div className="list-row" key={c.id}>
                    <div>
                      <strong>{c.role}</strong>
                      <div className="meta">
                        {c.name}
                      </div>
                    </div>
                    <a className="btn btn-primary btn-sm" href={`tel:${c.phone.replace(/\s/g, '')}`}>
                      {c.phone}
                    </a>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      <nav className="mobile-nav" aria-label="Primary">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'active' : ''}
            onClick={() => setTab(item.id)}
          >
            <NavIcon id={item.id} />
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
