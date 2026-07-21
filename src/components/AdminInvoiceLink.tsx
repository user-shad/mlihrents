import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { adminInvoiceHref, type AdminPortalTab } from '../lib/adminUnitLink'

type AdminInvoiceLinkProps = {
  invoiceId: string
  unit?: string
  tab?: AdminPortalTab
  className?: string
  children?: ReactNode
}

export default function AdminInvoiceLink({
  invoiceId,
  unit,
  tab = 'payments',
  className,
  children,
}: AdminInvoiceLinkProps) {
  const id = invoiceId.trim()
  if (!id) return <>{children ?? invoiceId}</>

  return (
    <Link to={adminInvoiceHref(id, unit, tab)} className={className ?? 'unit-link'}>
      {children ?? id}
    </Link>
  )
}
