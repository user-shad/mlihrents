import type { Session } from '../context/AuthContext'

export type StaffCapability =
  | 'bank_settings'
  | 'clear_apartment'
  | 'delete_payment'
  | 'manage_listings'

export function isStaffSession(session: Session | null) {
  return session?.role === 'admin'
}

export function isBuildingAdmin(session: Session | null) {
  return isStaffSession(session) && (session?.staffTier ?? 'admin') === 'admin'
}

/** Building admin: full access. Operations manager: day-to-day ops only. */
export function staffCan(session: Session | null, capability: StaffCapability) {
  if (!isStaffSession(session)) return false
  if (isBuildingAdmin(session)) return true
  switch (capability) {
    default:
      return false
  }
}
