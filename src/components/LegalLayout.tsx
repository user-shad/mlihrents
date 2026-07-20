import { Link } from 'react-router-dom'
import { siteLegal } from '../legal/siteLegal'
import { useLang } from '../context/LangContext'
import { BrandMark, LanguageSwitch } from './ui'
import SiteFooter from './SiteFooter'

export default function LegalLayout({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  const { tr } = useLang()

  return (
    <div className="app-shell legal-page">
      <header className="topnav">
        <Link className="brand" to="/">
          <BrandMark />
          {siteLegal.brandName}
        </Link>
        <div className="nav-actions">
          <LanguageSwitch />
          <Link className="btn btn-ghost" to="/">
            {tr('back')}
          </Link>
        </div>
      </header>
      <article className="legal-article panel">
        <p className="meta">
          {siteLegal.legalName} · {tr('lastUpdated')}: {siteLegal.lastUpdated}
        </p>
        <h1>{title}</h1>
        {children}
      </article>
      <SiteFooter />
    </div>
  )
}
