import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import LandingPage from './pages/LandingPage'
import ResidentLoginPage from './pages/ResidentLoginPage'
import StaffLoginPage from './pages/StaffLoginPage'
import ResidentPortal from './pages/ResidentPortal'
import AdminPortal from './pages/AdminPortal'
import PrivacyPage from './pages/PrivacyPage'
import TermsPage from './pages/TermsPage'
import CookiesPage from './pages/CookiesPage'
import CookieConsent from './components/CookieConsent'
import SampleSiteBanner from './components/SampleSiteBanner'

function ProtectedResident({ children }: { children: React.ReactNode }) {
  const { session } = useAuth()
  if (!session) return <Navigate to="/login" replace />
  if (session.role === 'admin') return <Navigate to="/admin" replace />
  return <>{children}</>
}

function ProtectedAdmin({ children }: { children: React.ReactNode }) {
  const { session } = useAuth()
  if (!session) return <Navigate to="/staff" replace />
  if (session.role === 'resident') return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Router>
      <SampleSiteBanner />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/cookies" element={<CookiesPage />} />
        <Route path="/login" element={<ResidentLoginPage />} />
        <Route path="/staff" element={<StaffLoginPage />} />
        <Route
          path="/app/*"
          element={
            <ProtectedResident>
              <ResidentPortal />
            </ProtectedResident>
          }
        />
        <Route
          path="/admin/*"
          element={
            <ProtectedAdmin>
              <AdminPortal />
            </ProtectedAdmin>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <CookieConsent />
    </Router>
  )
}
