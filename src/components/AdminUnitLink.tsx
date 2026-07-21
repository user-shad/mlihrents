import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { normalizeUnitCode } from '../data'
import { adminUnitHref, type AdminPortalTab } from '../lib/adminUnitLink'

type AdminUnitLinkProps = {
  unit: string
  tab?: AdminPortalTab
  className?: string
  children?: ReactNode
}

export default function AdminUnitLink({ unit, tab = 'info', className, children }: AdminUnitLinkProps) {
  const code = normalizeUnitCode(unit)
  if (!code) return <>{children ?? unit}</>

  return (
    <Link to={adminUnitHref(code, tab)} className={className ?? 'unit-link'}>
      {children ?? code}
    </Link>
  )
}
