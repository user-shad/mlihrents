import { residents } from '../data'
import { Lang, statusLabel } from '../i18n'
import { remainingBalance, paidPercent, rentScheduleLabel, formatMoney, hasRentPlan } from '../data'
import { useLang } from '../context/LangContext'

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M4 18V10l8-5 8 5v8H4z" stroke="currentColor" strokeWidth="2" />
        <path d="M10 18v-5h4v5" stroke="currentColor" strokeWidth="2" />
      </svg>
    </span>
  )
}

export function LanguageSwitch() {
  const { lang, setLang } = useLang()
  return (
    <div className="lang-switch" role="group" aria-label="Language">
      <button type="button" className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>
        EN
      </button>
      <button type="button" className={lang === 'ar' ? 'active' : ''} onClick={() => setLang('ar')}>
        ع
      </button>
    </div>
  )
}

export function Badge({ status, lang }: { status: string; lang: Lang }) {
  const map: Record<string, string> = {
    due: 'badge-due',
    paid: 'badge-paid',
    settled: 'badge-paid',
    overdue: 'badge-overdue',
    arrears: 'badge-overdue',
    open: 'badge-open',
    in_progress: 'badge-progress',
    pending_review: 'badge-progress',
    partial: 'badge-due',
    rejected: 'badge-overdue',
    resolved: 'badge-resolved',
    notice: 'badge-due',
  }
  return <span className={`badge ${map[status] ?? 'badge-open'}`}>{statusLabel(lang, status)}</span>
}

export function RentBalanceCard({
  resident,
  lang,
  tr,
}: {
  resident: (typeof residents)[number]
  lang: Lang
  tr: (key: string) => string
}) {
  const remaining = remainingBalance(resident)
  const percent = paidPercent(resident)
  const planned = hasRentPlan(resident)
  const done = planned && remaining <= 0
  return (
    <section className="panel balance-panel">
      <h2>{tr('paymentProgress')}</h2>
      {!planned ? (
        <p className="meta" style={{ margin: 0 }}>
          {tr('noRentPlan')}
        </p>
      ) : (
        <>
      <div className="balance-grid">
        <div>
          <span className="k">{tr('rentSchedule')}</span>
          <strong>{rentScheduleLabel(resident.rentSchedule, lang)}</strong>
        </div>
        <div>
          <span className="k">{tr('installment')}</span>
          <strong>{formatMoney(resident.rentAmount, resident.currency)}</strong>
        </div>
        <div>
          <span className="k">{tr('contractTotal')}</span>
          <strong>{formatMoney(resident.contractTotal, resident.currency)}</strong>
        </div>
        <div>
          <span className="k">{tr('amountPaid')}</span>
          <strong>{formatMoney(resident.amountPaid, resident.currency)}</strong>
        </div>
      </div>
      <div className="remaining-row">
        <div>
          <span className="k">{tr('amountRemaining')}</span>
          <div className={`remaining-value ${done ? 'done' : ''}`}>
            {done ? tr('fullyPaid') : formatMoney(remaining, resident.currency)}
          </div>
        </div>
        <span className="percent-pill">{percent}%</span>
      </div>
      <div className="progress-track" aria-hidden>
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
        </>
      )}
    </section>
  )
}

export type NavTab =
  | 'home'
  | 'pay'
  | 'tickets'
  | 'chat'
  | 'profile'
  | 'admin'
  | 'ops'
  | 'inbox'
  | 'info'
  | 'income'
  | 'payments'
  | 'available'

export function NavIcon({ id }: { id: NavTab }) {
  const props = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }
  switch (id) {
    case 'home':
      return (
        <svg {...props}>
          <path d="M4 20V10l8-6 8 6v10H4z" />
        </svg>
      )
    case 'pay':
    case 'payments':
      return (
        <svg {...props}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M3 10h18" />
        </svg>
      )
    case 'income':
      return (
        <svg {...props}>
          <path d="M4 20V10l4-2 4 2 4-3 4 3v10" />
          <path d="M4 20h16" />
        </svg>
      )
    case 'tickets':
      return (
        <svg {...props}>
          <path d="M14 4H6a2 2 0 00-2 2v12l4-2 4 2 4-2 4 2V10" />
          <path d="M14 4l6 6h-4a2 2 0 01-2-2V4z" />
        </svg>
      )
    case 'chat':
    case 'inbox':
      return (
        <svg {...props}>
          <path d="M5 19l2.5-2.5H18a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v12z" />
        </svg>
      )
    case 'profile':
    case 'info':
      return (
        <svg {...props}>
          <circle cx="12" cy="9" r="3.5" />
          <path d="M5 19c1.5-3 4-4.5 7-4.5S17.5 16 19 19" />
        </svg>
      )
    case 'available':
      return (
        <svg {...props}>
          <path d="M3 21h18" />
          <path d="M5 21V8l7-5 7 5v13" />
          <path d="M9 21v-6h6v6" />
          <path d="M9 10h.01M15 10h.01M9 14h.01M15 14h.01" />
        </svg>
      )
    default:
      return (
        <svg {...props}>
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      )
  }
}
