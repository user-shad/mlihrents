import { FormEvent, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { staffAccounts } from '../data'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { useData } from '../context/DataContext'
import { BrandMark, LanguageSwitch } from '../components/ui'

export default function StaffLoginPage() {
  const { session, loginAdmin } = useAuth()
  const { tr } = useLang()
  const { toast, showToast } = useData()
  const navigate = useNavigate()
  const [phone, setPhone] = useState(staffAccounts[0]?.phone ?? '')
  const [pin, setPin] = useState('')

  if (session?.role === 'admin') {
    return <Navigate to="/admin" replace />
  }
  if (session?.role === 'resident') {
    return <Navigate to="/app" replace />
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const error = loginAdmin(phone, pin)
    if (error) {
      showToast(tr(error))
      return
    }
    showToast(tr('staffWelcomeToast'))
    navigate('/admin')
  }

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <Link className="brand" to="/" style={{ textDecoration: 'none' }}>
            <BrandMark />
            MLIHrents
          </Link>
          <LanguageSwitch />
        </div>
        <form onSubmit={onSubmit}>
          <span className="demo-chip" style={{ marginBottom: '0.75rem', display: 'inline-block' }}>
            {tr('staffOnly')}
          </span>
          <h1>{tr('staffLogin')}</h1>
          <p className="lead">{tr('staffPinLead')}</p>
          <div className="field">
            <label htmlFor="staff-phone">{tr('mobileNumber')}</label>
            <input
              id="staff-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
            />
          </div>
          <div className="field">
            <label htmlFor="staff-pin">{tr('loginPin')}</label>
            <input
              id="staff-pin"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              autoComplete="current-password"
              maxLength={4}
              placeholder="••••"
            />
          </div>
          <button className="btn btn-primary btn-block" type="submit">
            {tr('signIn')}
          </button>
          <span className="demo-chip" style={{ marginTop: '0.75rem', display: 'inline-block' }}>
            {tr('demoStaffCreds')}
          </span>
          <p className="hint" style={{ marginTop: '0.75rem' }}>
            <Link to="/login">{tr('residentPortalLink')}</Link>
          </p>
          <Link
            className="btn btn-ghost btn-block"
            to="/"
            style={{ marginTop: '0.75rem', textAlign: 'center', textDecoration: 'none' }}
          >
            {tr('back')}
          </Link>
        </form>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
