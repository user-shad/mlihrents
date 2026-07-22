import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { LangProvider } from './context/LangContext'
import { DataProvider } from './context/DataContext'
import { bootstrapPortalData, type BootstrapData } from './lib/cloudSync'
import { isSupabaseConfigured } from './lib/supabase'
import { siteConfig } from './config/siteConfig'
import './index.css'

function applySiteDocumentMeta() {
  document.title = siteConfig.pageTitle
  const description = document.querySelector('meta[name="description"]')
  if (description) description.setAttribute('content', siteConfig.pageDescription)
  const canonical = document.querySelector('link[rel="canonical"]')
  if (canonical) canonical.setAttribute('href', `${siteConfig.legal.publicUrl}/`)
  const ogSite = document.querySelector('meta[property="og:site_name"]')
  if (ogSite) ogSite.setAttribute('content', siteConfig.legal.brandName)
  const ogTitle = document.querySelector('meta[property="og:title"]')
  if (ogTitle) ogTitle.setAttribute('content', siteConfig.pageTitle)
  const ogUrl = document.querySelector('meta[property="og:url"]')
  if (ogUrl) ogUrl.setAttribute('content', `${siteConfig.legal.publicUrl}/`)
}

applySiteDocumentMeta()

function SyncLoading() {
  return (
    <div className="auth-page">
      <div className="auth-panel" style={{ textAlign: 'center' }}>
        <p style={{ margin: 0, color: 'var(--muted)' }}>
          {isSupabaseConfigured() ? 'Syncing building data…' : 'Loading…'}
        </p>
      </div>
    </div>
  )
}

function Root() {
  const [boot, setBoot] = useState<BootstrapData | null>(null)

  useEffect(() => {
    void bootstrapPortalData().then(setBoot)
  }, [])

  if (!boot) return <SyncLoading />

  return (
    <AuthProvider initialAccounts={boot.accounts}>
      <LangProvider>
        <DataProvider initialOps={boot.ops}>
          <App />
        </DataProvider>
      </LangProvider>
    </AuthProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
