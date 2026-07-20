import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { LangProvider } from './context/LangContext'
import { DataProvider } from './context/DataContext'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <LangProvider>
        <DataProvider>
          <App />
        </DataProvider>
      </LangProvider>
    </AuthProvider>
  </StrictMode>,
)
