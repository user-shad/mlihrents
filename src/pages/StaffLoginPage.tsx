import { FormEvent, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { useData } from '../context/DataContext'
import { BrandMark, LanguageSwitch } from '../components/ui'
import { siteLegal } from '../legal/siteLegal'
import {
  clearSavedLogin,
  readSavedLogin,
  STAFF_LOGIN_SAVE_KEY,
  writeSavedLogin,
} from '../lib/savedLogin'

export default function StaffLoginPage() {
  const { session, loginAdmin } = useAuth()
  const { tr } = useLang()
  const { toast, showToast } = useData()
  const navigate = useNavigate()
  const saved = readSavedLogin(STAFF_LOGIN_SAVE_KEY)
  const [phone, setPhone] = useState(saved?.phone ?? '')
  const [pin, setPin] = useState('')
  const [rememberLogin, setRememberLogin] = useState(Boolean(saved))

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
    if (rememberLogin) {
      writeSavedLogin(STAFF_LOGIN_SAVE_KEY, { phone })
    } else {
      clearSavedLogin(STAFF_LOGIN_SAVE_KEY)
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
            {siteLegal.brandName}
          </Link>
          <LanguageSwitch />
        </div>
        <form onSubmit={onSubmit}>
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
          <label className="remember-login">
            <input
              type="checkbox"
              checked={rememberLogin}
              onChange={(e) => setRememberLogin(e.target.checked)}
            />
            <span>{tr('rememberLoginInfo')}</span>
          </label>
          <button className="btn btn-primary btn-block" type="submit">
            {tr('signIn')}
          </button>
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
