import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLang } from '../context/LangContext'

const COOKIE_KEY = 'mlihrents_cookie_consent'

export default function CookieConsent() {
  const { tr } = useLang()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(COOKIE_KEY)) setVisible(true)
    } catch {
      setVisible(true)
    }
  }, [])

  function accept() {
    localStorage.setItem(COOKIE_KEY, 'accepted')
    setVisible(false)
  }

  function essentialOnly() {
    localStorage.setItem(COOKIE_KEY, 'essential')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="cookie-banner" role="dialog" aria-label={tr('cookiePolicy')}>
      <p>
        {tr('cookieBannerText')}{' '}
        <Link to="/cookies">{tr('cookiePolicy')}</Link>
        {'. '}
        {tr('cookieBannerPdpl')}
      </p>
      <div className="cookie-banner-actions">
        <button className="btn btn-ghost btn-sm" type="button" onClick={essentialOnly}>
          {tr('cookiesEssential')}
        </button>
        <button className="btn btn-accent btn-sm" type="button" onClick={accept}>
          {tr('cookiesAccept')}
        </button>
      </div>
    </div>
  )
}
