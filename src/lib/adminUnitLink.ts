import { normalizeUnitCode } from '../data'

export type AdminPortalTab = 'info' | 'income' | 'payments' | 'available' | 'chat'

export type AdminPortalQuery = {
  unit?: string
  tab?: AdminPortalTab
  payment?: string
  invoice?: string
}

export function adminPortalHref(query?: string | AdminPortalQuery, tab: AdminPortalTab = 'info') {
  const q: AdminPortalQuery =
    typeof query === 'string' || query === undefined ? { unit: query, tab } : { tab, ...query }

  const params = new URLSearchParams()
  const unit = q.unit ? normalizeUnitCode(q.unit) : ''
  if (unit) params.set('unit', unit)
  const resolvedTab = q.tab ?? tab
  if (resolvedTab !== 'info') params.set('tab', resolvedTab)
  if (q.payment?.trim()) params.set('payment', q.payment.trim())
  if (q.invoice?.trim()) params.set('invoice', q.invoice.trim())
  const qs = params.toString()
  return qs ? `/admin?${qs}` : '/admin'
}

export function adminUnitHref(unitCode: string, tab: AdminPortalTab = 'info') {
  return adminPortalHref({ unit: unitCode, tab })
}

export function adminPaymentHref(paymentId: string, tab: AdminPortalTab = 'income') {
  return adminPortalHref({ payment: paymentId, tab })
}

export function adminInvoiceHref(invoiceId: string, unitCode?: string, tab: AdminPortalTab = 'payments') {
  return adminPortalHref({ invoice: invoiceId, unit: unitCode, tab })
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
