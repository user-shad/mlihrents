import { createContext, ReactNode, useContext, useEffect, useState } from 'react'
import {
  isValidPin,
  normalizePhone,
  StaffTier,
} from '../data'
import { ensureBootstrapStaff, prepareStoredAccounts } from '../lib/accountBootstrap'
import {
  flushCloudAccountsNow,
  onCloudAccounts,
  queueCloudAccounts,
  writeLocalAccounts,
} from '../lib/cloudSync'
export type SessionRole = 'resident' | 'admin'

export interface Session {
  role: SessionRole
  phone: string
  name: string
  residentId?: string
  staffTier?: StaffTier
}

export interface AccountRecord {
  phone: string
  pin: string
  role: SessionRole
  name: string
  residentId?: string
  staffTier?: StaffTier
}

interface AuthContextValue {
  session: Session | null
  accounts: AccountRecord[]
  /** Returns error message key or null on success */
  loginResident: (phone: string, pin: string) => string | null
  loginAdmin: (phone: string, pin: string) => string | null
  setResidentPin: (residentId: string, phone: string, pin: string, name: string) => string | null
  clearResidentCredentials: (residentId: string) => void
  registerResidentAccount: (input: {
    name: string
    phone: string
    pin: string
    residentId: string
  }) => string | null
  logout: () => void
}

const SESSION_KEY = 'mlihrents_session'

const AuthContext = createContext<AuthContextValue | null>(null)

function enrichSession(session: Session, accounts: AccountRecord[]): Session {  if (session.role !== 'admin' || session.staffTier) return session
  const account = accounts.find((a) => a.role === 'admin' && a.phone === session.phone)
  return { ...session, staffTier: account?.staffTier ?? 'admin' }
}

function readStoredSession(accounts: AccountRecord[]): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Session
    if (parsed?.role === 'resident' || parsed?.role === 'admin') {
      return enrichSession(parsed, accounts)
    }
  } catch {
    /* ignore */
  }
  return null
}

export function AuthProvider({
  children,
  initialAccounts,
}: {
  children: ReactNode
  initialAccounts: AccountRecord[]
}) {
  const [accounts, setAccounts] = useState<AccountRecord[]>(() => prepareStoredAccounts(initialAccounts))
  const [session, setSession] = useState<Session | null>(() =>
    readStoredSession(prepareStoredAccounts(initialAccounts)),
  )

  useEffect(() => {
    return onCloudAccounts((remote) => {
      setAccounts(prepareStoredAccounts(remote))
    })
  }, [])
  useEffect(() => {
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } else {
      localStorage.removeItem(SESSION_KEY)
    }
  }, [session])

  useEffect(() => {
    writeLocalAccounts(accounts)
    queueCloudAccounts(accounts)
  }, [accounts])

  function loginResident(phone: string, pin: string): string | null {
    if (!isValidPin(pin)) return 'pinInvalid'
    const key = normalizePhone(phone)
    if (!key) return 'phoneRequired'
    const account = accounts.find(
      (a) => a.role === 'resident' && normalizePhone(a.phone) === key,
    )
    if (!account) return 'accountNotFound'
    if (account.pin !== pin) return 'wrongPin'
    if (!account.residentId) return 'accountNotFound'
    setSession({
      role: 'resident',
      phone: account.phone,
      name: account.name,
      residentId: account.residentId,
    })
    return null
  }

  function loginAdmin(phone: string, pin: string): string | null {
    if (!isValidPin(pin)) return 'pinInvalid'
    const key = normalizePhone(phone.trim())
    if (!key) return 'phoneRequired'
    const account = ensureBootstrapStaff(accounts).find(
      (a) => a.role === 'admin' && normalizePhone(a.phone) === key,
    )
    if (!account) return 'staffNotFound'
    if (account.pin !== pin) return 'wrongPin'
    setAccounts((prev) => ensureBootstrapStaff(prev))
    setSession({
      role: 'admin',
      phone: account.phone,
      name: account.name,
      staffTier: account.staffTier ?? 'admin',
    })
    return null
  }

  function setResidentPin(residentId: string, phone: string, pin: string, name: string): string | null {
    if (!isValidPin(pin)) return 'pinInvalid'
    const key = normalizePhone(phone)
    if (!key) return 'phoneRequired'
    setAccounts((prev) => {
      const withoutDupPhone = prev.filter(
        (a) =>
          !(
            a.role === 'resident' &&
            (a.residentId === residentId || normalizePhone(a.phone) === key)
          ),
      )
      const next: AccountRecord[] = [
        ...withoutDupPhone,
        { phone: key, pin, role: 'resident', name, residentId },
      ]
      void flushCloudAccountsNow(next)
      return next
    })
    return null
  }

  function clearResidentCredentials(residentId: string) {
    setAccounts((prev) => prev.filter((a) => !(a.role === 'resident' && a.residentId === residentId)))
  }

  function registerResidentAccount(input: {
    name: string
    phone: string
    pin: string
    residentId: string
  }): string | null {
    return setResidentPin(input.residentId, input.phone, input.pin, input.name)
  }

  function logout() {
    setSession(null)
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        accounts,
        loginResident,
        loginAdmin,
        setResidentPin,
        clearResidentCredentials,
        registerResidentAccount,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
