import { LEGACY_STAFF_PHONES, normalizePhone, residents, staffAccounts } from '../data'

export interface BootstrapAccountRecord {
  phone: string
  pin: string
  role: 'resident' | 'admin'
  name: string
  residentId?: string
  staffTier?: 'admin' | 'staff'
}

function seedAccounts(): BootstrapAccountRecord[] {
  const fromResidents: BootstrapAccountRecord[] = residents.map((r) => ({
    phone: normalizePhone(r.phone),
    pin: r.pin,
    role: 'resident',
    name: r.name,
    residentId: r.id,
  }))
  const fromStaff: BootstrapAccountRecord[] = staffAccounts.map((s) => ({
    phone: normalizePhone(s.phone),
    pin: s.pin,
    role: 'admin',
    name: s.name,
    staffTier: s.tier,
  }))
  return [...fromResidents, ...fromStaff]
}

/** Always keep bootstrap staff accounts from data.ts available for login. */
export function ensureBootstrapStaff(list: BootstrapAccountRecord[]): BootstrapAccountRecord[] {
  const bootstrapPhones = new Set(staffAccounts.map((s) => normalizePhone(s.phone)))
  const legacyPhones = new Set(LEGACY_STAFF_PHONES.map(normalizePhone))
  let next = list.filter((a) => {
    if (a.role !== 'admin') return true
    const phone = normalizePhone(a.phone)
    if (legacyPhones.has(phone)) return false
    return bootstrapPhones.has(phone) || !legacyPhones.has(phone)
  })
  for (const s of staffAccounts) {
    const phone = normalizePhone(s.phone)
    if (!phone) continue
    const idx = next.findIndex((a) => a.role === 'admin' && normalizePhone(a.phone) === phone)
    if (idx >= 0) {
      next[idx] = { ...next[idx], phone, pin: s.pin, name: s.name, staffTier: s.tier }
    } else {
      next.push({ phone, pin: s.pin, role: 'admin', name: s.name, staffTier: s.tier })
    }
  }
  return next
}

function stripLegacyTestAccounts(list: BootstrapAccountRecord[]): BootstrapAccountRecord[] {
  return list.filter((account) => {
    if (account.role !== 'resident') return true
    const phone = normalizePhone(account.phone)
    const isTestName = account.name === 'Test Tenant A1'
    const isTestPhone = phone === '0501234567'
    const isTestUnit = account.residentId === 'apt-a1'
    return !(isTestName || (isTestUnit && isTestPhone) || (isTestName && isTestPhone))
  })
}

function ensureSeedResidents(list: BootstrapAccountRecord[]): BootstrapAccountRecord[] {
  let next = stripLegacyTestAccounts(list)
  for (const r of residents) {
    const phone = normalizePhone(r.phone)
    if (!phone || !r.id) continue
    const idx = next.findIndex(
      (a) => a.role === 'resident' && (a.residentId === r.id || normalizePhone(a.phone) === phone),
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

export function prepareStoredAccounts(raw: BootstrapAccountRecord[]): BootstrapAccountRecord[] {
  const base = raw.length > 0 ? raw : seedAccounts()
  return ensureSeedResidents(ensureBootstrapStaff(base))
}
