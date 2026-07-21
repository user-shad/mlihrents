import { normalizeUnitCode } from '../data'

export type AdminPortalTab = 'info' | 'income' | 'payments' | 'available' | 'chat'

export function adminPortalHref(unitCode?: string, tab: AdminPortalTab = 'info') {
  const params = new URLSearchParams()
  const unit = unitCode ? normalizeUnitCode(unitCode) : ''
  if (unit) params.set('unit', unit)
  if (tab !== 'info') params.set('tab', tab)
  const qs = params.toString()
  return qs ? `/admin?${qs}` : '/admin'
}

export function adminUnitHref(unitCode: string, tab: AdminPortalTab = 'info') {
  return adminPortalHref(unitCode, tab)
}

export function parseAdminPortalTab(value: string | null): AdminPortalTab | null {
  if (
    value === 'info' ||
    value === 'income' ||
    value === 'payments' ||
    value === 'available' ||
    value === 'chat'
  ) {
    return value
  }
  return null
}
