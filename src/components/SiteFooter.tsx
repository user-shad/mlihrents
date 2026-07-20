import { Link } from 'react-router-dom'
import { siteLegal } from '../legal/siteLegal'
import { useLang } from '../context/LangContext'

export default function SiteFooter() {
  const { tr } = useLang()

  return (
    <footer className="site-footer">
      <div className="site-footer-grid">
        <div>
          <strong className="site-footer-brand">{siteLegal.brandName}</strong>
          <p className="meta">{siteLegal.legalName}</p>
          <p className="meta">
            {tr('tradeLicense')}: {siteLegal.tradeLicenseNumber}
          </p>
          <p className="meta">{siteLegal.licensedEmirate}</p>
        </div>
        <div>
          <h4>{tr('legal')}</h4>
          <Link to="/privacy">{tr('privacyPolicy')}</Link>
          <Link to="/terms">{tr('termsOfUse')}</Link>
          <Link to="/cookies">{tr('cookiePolicy')}</Link>
        </div>
        <div>
          <h4>{tr('contact')}</h4>
          <a href={`mailto:${siteLegal.supportEmail}`}>{siteLegal.supportEmail}</a>
          <a href={`mailto:${siteLegal.dataProtectionContact}`}>{siteLegal.dataProtectionContact}</a>
          <a href={`tel:${siteLegal.phone.replace(/\s/g, '')}`}>{siteLegal.phone}</a>
        </div>
        <div>
          <h4>{tr('portals')}</h4>
          <Link to="/login">{tr('residentPortalLink')}</Link>
          <Link to="/staff">{tr('staffPortalLink')}</Link>
        </div>
      </div>
      <p className="site-footer-note meta">
        {tr('uaeLawNotice')} · {tr('lastUpdated')}: {siteLegal.lastUpdated}
      </p>
    </footer>
  )
}
