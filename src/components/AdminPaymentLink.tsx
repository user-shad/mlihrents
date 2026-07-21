import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { adminPaymentHref, type AdminPortalTab } from '../lib/adminUnitLink'

type AdminPaymentLinkProps = {
  paymentId: string
  tab?: AdminPortalTab
  className?: string
  children?: ReactNode
}

export default function AdminPaymentLink({
  paymentId,
  tab = 'income',
  className,
  children,
}: AdminPaymentLinkProps) {
  const id = paymentId.trim()
  if (!id) return <>{children ?? paymentId}</>

  return (
    <Link to={adminPaymentHref(id, tab)} className={className ?? 'unit-link'}>
      {children ?? id}
    </Link>
  )
}
