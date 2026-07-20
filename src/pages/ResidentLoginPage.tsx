import { FormEvent, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { useData } from '../context/DataContext'
import { BrandMark, LanguageSwitch } from '../components/ui'

export default function ResidentLoginPage() {
  const { session, loginResident } = useAuth()
  const { tr } = useLang()
  const { toast, showToast } = useData()
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')

  if (session?.role === 'resident') {
    return <Navigate to="/app" replace />
  }
  if (session?.role === 'admin') {
    return <Navigate to="/admin" replace />
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const error = loginResident(phone, pin)
    if (error) {
      showToast(tr(error))
      return
    }
    showToast(tr('welcomeToast'))
    navigate('/app')
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
          <h1>{tr('residentLogin')}</h1>
          <p className="lead">{tr('pinLoginLead')}</p>
          <div className="field">
            <label htmlFor="phone">{tr('mobileNumber')}</label>
            <input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
            />
          </div>
          <div className="field">
            <label htmlFor="pin">{tr('loginPin')}</label>
            <input
              id="pin"
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
          <p className="hint">{tr('pinLoginHint')}</p>
          <p className="hint" style={{ marginTop: '0.75rem' }}>
            <Link to="/staff">{tr('staffPortalLink')}</Link>
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
