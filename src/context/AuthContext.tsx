import { createContext, ReactNode, useContext, useEffect, useState } from 'react'
import {
  isValidPin,
  normalizePhone,
  residents,
  staffAccounts,
  StaffTier,
} from '../data'

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
  changeStaffPassword: (currentPin: string, newPin: string) => string | null
  registerResidentAccount: (input: {
    name: string
    phone: string
    pin: string
    residentId: string
  }) => string | null
  logout: () => void
}

const SESSION_KEY = 'mlihrents_session'
const ACCOUNTS_KEY = 'mlihrents_accounts_v3'

const AuthContext = createContext<AuthContextValue | null>(null)

function seedAccounts(): AccountRecord[] {
  const fromResidents: AccountRecord[] = residents.map((r) => ({
    phone: normalizePhone(r.phone),
    pin: r.pin,
    role: 'resident',
    name: r.name,
    residentId: r.id,
  }))
  const fromStaff: AccountRecord[] = staffAccounts.map((s) => ({
    phone: normalizePhone(s.phone),
    pin: s.pin,
    role: 'admin',
    name: s.name,
    staffTier: s.tier,
  }))
  return [...fromResidents, ...fromStaff]
}

/** Always keep bootstrap staff accounts from data.ts available for login. */
function ensureBootstrapStaff(list: AccountRecord[]): AccountRecord[] {
  let next = [...list]
  for (const s of staffAccounts) {
    const phone = normalizePhone(s.phone)
    if (!phone) continue
    const idx = next.findIndex((a) => a.role === 'admin' && a.phone === phone)
    if (idx >= 0) {
      next[idx] = { ...next[idx], name: s.name, staffTier: s.tier }
    } else {
      next.push({ phone, pin: s.pin, role: 'admin', name: s.name, staffTier: s.tier })
    }
  }
  return next
}

/** Remove demo A1 login saved in older builds. */
function stripLegacyTestAccounts(list: AccountRecord[]): AccountRecord[] {
  return list.filter((account) => {
    if (account.role !== 'resident') return true
    const phone = normalizePhone(account.phone)
    const isTestName = account.name === 'Test Tenant A1'
    const isTestPhone = phone === '0501234567'
    const isTestUnit = account.residentId === 'apt-a1'
    return !(isTestName || (isTestUnit && isTestPhone) || (isTestName && isTestPhone))
  })
}

/** Ensure sample / seed residents from data.ts exist as login accounts. */
function ensureSeedResidents(list: AccountRecord[]): AccountRecord[] {
  let next = stripLegacyTestAccounts(list)
  for (const r of residents) {
    const phone = normalizePhone(r.phone)
    if (!phone || !r.id) continue
    const idx = next.findIndex(
      (a) => a.role === 'resident' && (a.residentId === r.id || a.phone === phone),
    )
    if (idx >= 0) {
      next[idx] = {
        ...next[idx],
        phone,
        pin: r.pin,
        name: r.name,
        residentId: r.id,
      }
    } else {
      next.push({
        phone,
        pin: r.pin,
        role: 'resident',
        name: r.name,
        residentId: r.id,
      })
    }
  }
  return next
}

function readAccounts(): AccountRecord[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY)
    if (raw) {
      const parsed = stripLegacyTestAccounts(JSON.parse(raw) as AccountRecord[])
      if (Array.isArray(parsed) && parsed.length > 0) {
        return ensureSeedResidents(ensureBootstrapStaff(parsed))
      }
    }
  } catch {
    /* ignore */
  }
  const seeded = seedAccounts()
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(seeded))
  return seeded
}

function enrichSession(session: Session, accounts: AccountRecord[]): Session {
  if (session.role !== 'admin' || session.staffTier) return session
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<AccountRecord[]>(() => readAccounts())
  const [session, setSession] = useState<Session | null>(() =>
    readStoredSession(readAccounts()),
  )

  useEffect(() => {
    setAccounts((prev) => ensureSeedResidents(ensureBootstrapStaff(prev)))
  }, [])

  useEffect(() => {
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } else {
      localStorage.removeItem(SESSION_KEY)
    }
  }, [session])

  useEffect(() => {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
  }, [accounts])

  function loginResident(phone: string, pin: string): string | null {
    if (!isValidPin(pin)) return 'pinInvalid'
    const key = normalizePhone(phone)
    if (!key) return 'phoneRequired'
    const account = accounts.find((a) => a.role === 'resident' && a.phone === key)
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
      (a) => a.role === 'admin' && a.phone === key,
    )
    if (!account) return 'staffNotFound'
    if (account.pin !== pin) return 'wrongPin'
    // Persist bootstrap staff if it was missing from state
    setAccounts((prev) => ensureBootstrapStaff(prev))
    setSession({
      role: 'admin',
      phone: account.phone,
      name: account.name,
      staffTier: account.staffTier ?? 'admin',
    })
    return null
  }

  function changeStaffPassword(currentPin: string, newPin: string): string | null {
    if (!session || session.role !== 'admin') return 'staffNotFound'
    if (!isValidPin(newPin)) return 'pinInvalid'
    const account = accounts.find((a) => a.role === 'admin' && a.phone === session.phone)
    if (!account) return 'staffNotFound'
    if (account.pin !== currentPin) return 'wrongPin'
    setAccounts((prev) =>
      prev.map((a) =>
        a.role === 'admin' && a.phone === session.phone ? { ...a, pin: newPin } : a,
      ),
    )
    return null
  }

  function setResidentPin(residentId: string, phone: string, pin: string, name: string): string | null {
    if (!isValidPin(pin)) return 'pinInvalid'
    const key = normalizePhone(phone)
    if (!key) return 'phoneRequired'
    setAccounts((prev) => {
      const withoutDupPhone = prev.filter(
        (a) => !(a.role === 'resident' && (a.residentId === residentId || a.phone === key)),
      )
      return [
        ...withoutDupPhone,
        { phone: key, pin, role: 'resident', name, residentId },
      ]
    })
    return null
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
        changeStaffPassword,
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
