import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { LangProvider } from './context/LangContext'
import { DataProvider } from './context/DataContext'
import { bootstrapPortalData, type BootstrapData } from './lib/cloudSync'
import { isSupabaseConfigured } from './lib/supabase'
import './index.css'

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
