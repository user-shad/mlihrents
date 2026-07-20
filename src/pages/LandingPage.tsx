import { Link } from 'react-router-dom'
import { formatMoney } from '../data'
import { useLang } from '../context/LangContext'
import { useData } from '../context/DataContext'
import { BrandMark, LanguageSwitch } from '../components/ui'
import SiteFooter from '../components/SiteFooter'

export default function LandingPage() {
  const { lang, tr } = useLang()
  const { toast, showToast, availableListings } = useData()

  return (
    <div className="app-shell landing">
      <header className="topnav">
        <Link className="brand" to="/">
          <BrandMark />
          MLIHrents
        </Link>
        <div className="nav-actions">
          <a className="nav-text-link" href="#available">
            {tr('availableNav')}
          </a>
          <LanguageSwitch />
          <Link className="btn btn-ghost" to="/login">
            {tr('signIn')}
          </Link>
          <Link className="btn btn-accent" to="/login">
            {tr('openDemo')}
          </Link>
        </div>
      </header>

      <section className="hero">
        <div className="hero-visual" aria-hidden />
        <div className="hero-content">
          <h1 className="hero-brand">
            MLIH<span>rents</span>
          </h1>
          <p>{tr('heroSub')}</p>
          <div className="hero-cta">
            <Link className="btn btn-accent" to="/login">
              {tr('tryResident')}
            </Link>
            <a
              className="btn btn-ghost"
              href="#available"
              style={{
                color: 'inherit',
                borderColor: 'color-mix(in srgb, currentColor 35%, transparent)',
                textDecoration: 'none',
              }}
            >
              {tr('availableTitle')}
            </a>
          </div>
        </div>
      </section>

      <section className="available-section" id="available">
        <div className="available-head">
          <div>
            <h2>{tr('availableTitle')}</h2>
            <p>{tr('availableLead')}</p>
          </div>
          <span className="available-count">
            {availableListings.length} {tr('units')}
          </span>
        </div>
        <div className="available-list">
          {availableListings.map((apt) => (
            <article key={apt.id} className="available-item">
              {apt.photoDataUrl ? (
                <img className="available-photo" src={apt.photoDataUrl} alt="" />
              ) : (
                <div className="available-visual" aria-hidden>
                  <span>
                    {apt.buildingNumber}-{apt.apartment}
                  </span>
                </div>
              )}
              <div className="available-body">
                <h3>
                  {apt.building} · {apt.buildingNumber}-{apt.apartment}
                </h3>
                <p className="meta">
                  {tr('floor')} {apt.floor} · {apt.bedrooms} {tr('bedrooms')} · {apt.bathrooms}{' '}
                  {tr('bathrooms')} · {apt.sizeSqm} {tr('sqm')}
                </p>
                <p className="available-highlight">{lang === 'ar' ? apt.highlightAr : apt.highlight}</p>
                <p className="meta">
                  {tr('availableFrom')}{' '}
                  {apt.availableFrom === 'Now' && lang === 'ar' ? 'الآن' : apt.availableFrom}
                  {' · '}
                  {apt.parking ? tr('parkingIncl') : tr('noParking')}
                </p>
              </div>
              <div className="available-aside">
                <div className="available-price">
                  {formatMoney(apt.rentMonthly, apt.currency)}
                  <span>{tr('perMonth')}</span>
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  type="button"
                  onClick={() => showToast(tr('inquireToast'))}
                >
                  {tr('inquire')}
                </button>
              </div>
            </article>
          ))}
          {availableListings.length === 0 && (
            <p className="meta">{tr('noListingsYet')}</p>
          )}
        </div>
      </section>

      <section className="landing-strip">
        <article>
          <h3>{tr('featurePay')}</h3>
          <p>{tr('featurePayBody')}</p>
        </article>
        <article>
          <h3>{tr('featureAi')}</h3>
          <p>{tr('featureAiBody')}</p>
        </article>
        <article>
          <h3>{tr('featureHuman')}</h3>
          <p>{tr('featureHumanBody')}</p>
        </article>
      </section>

      <SiteFooter />

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
