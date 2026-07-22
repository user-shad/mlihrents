import type { SyncPayload } from './syncProofStore.js'

export type PaymentLike = {
  id: string
  status?: string
  transferProof?: { name: string; dataUrl?: string }
}

export type InvoiceLike = {
  id: string
  status?: string
  extensionDays?: number
}

export type TicketLike = {
  id: string
  status?: string
}

function mergePaymentRecord<T extends PaymentLike>(existing: T, incoming: T): T {
  if (existing.status === 'deleted' || incoming.status === 'deleted') {
    return (existing.status === 'deleted' ? existing : incoming) as T
  }

  const preferIncoming =
    (incoming.transferProof?.dataUrl && !existing.transferProof?.dataUrl) ||
    (incoming.status === 'pending_review' && existing.status !== 'pending_review')
  const preferExisting =
    (existing.transferProof?.dataUrl && !incoming.transferProof?.dataUrl) ||
    (existing.status === 'pending_review' && incoming.status !== 'pending_review')

  let merged = preferIncoming ? { ...existing, ...incoming } : { ...incoming, ...existing }
  if (preferExisting && !preferIncoming) {
    merged = { ...incoming, ...existing }
  }

  const transferProof = incoming.transferProof?.dataUrl
    ? incoming.transferProof
    : existing.transferProof?.dataUrl
      ? existing.transferProof
      : incoming.transferProof ?? existing.transferProof

  return { ...merged, transferProof } as T
}

/** Merge payment rows without dropping pending submissions from another device. */
export function mergePaymentLists<T extends PaymentLike>(remote: T[], local: T[]): T[] {
  const map = new Map<string, T>()
  for (const payment of remote) map.set(payment.id, payment)
  for (const payment of local) {
    const existing = map.get(payment.id)
    if (!existing) {
      map.set(payment.id, payment)
      continue
    }
    map.set(payment.id, mergePaymentRecord(existing, payment))
  }
  return [...map.values()].sort((a, b) => b.id.localeCompare(a.id))
}

function mergeInvoiceRecord<T extends InvoiceLike>(existing: T, incoming: T): T {
  if (existing.status === 'paid') return existing
  if (incoming.status === 'paid') return incoming
  const extA = existing.extensionDays ?? 0
  const extB = incoming.extensionDays ?? 0
  return (extB >= extA ? { ...existing, ...incoming } : { ...incoming, ...existing }) as T
}

/** Merge invoice lists per unit without dropping rows from either device. */
export function mergeInvoiceLists<T extends InvoiceLike>(remote: T[], local: T[]): T[] {
  const map = new Map<string, T>()
  for (const invoice of remote) map.set(invoice.id, invoice)
  for (const invoice of local) {
    const existing = map.get(invoice.id)
    if (!existing) {
      map.set(invoice.id, invoice)
      continue
    }
    map.set(invoice.id, mergeInvoiceRecord(existing, invoice))
  }
  return [...map.values()].sort((a, b) => b.id.localeCompare(a.id))
}

export function mergeInvoiceMaps<T extends InvoiceLike>(
  remote: Record<string, T[]>,
  local: Record<string, T[]>,
): Record<string, T[]> {
  const ids = new Set([...Object.keys(remote), ...Object.keys(local)])
  const merged: Record<string, T[]> = {}
  for (const id of ids) {
    merged[id] = mergeInvoiceLists(remote[id] ?? [], local[id] ?? [])
  }
  return merged
}

const ticketRank: Record<string, number> = { open: 1, in_progress: 2, resolved: 3 }

function mergeTicketRecord<T extends TicketLike>(existing: T, incoming: T): T {
  const rankA = ticketRank[existing.status ?? 'open'] ?? 0
  const rankB = ticketRank[incoming.status ?? 'open'] ?? 0
  return (rankB >= rankA ? { ...existing, ...incoming } : { ...incoming, ...existing }) as T
}

export function mergeTicketLists<T extends TicketLike>(remote: T[], local: T[]): T[] {
  const map = new Map<string, T>()
  for (const ticket of remote) map.set(ticket.id, ticket)
  for (const ticket of local) {
    const existing = map.get(ticket.id)
    if (!existing) {
      map.set(ticket.id, ticket)
      continue
    }
    map.set(ticket.id, mergeTicketRecord(existing, ticket))
  }
  return [...map.values()].sort((a, b) => b.id.localeCompare(a.id))
}

export function mergeTicketMaps<T extends TicketLike>(
  remote: Record<string, T[]>,
  local: Record<string, T[]>,
): Record<string, T[]> {
  const ids = new Set([...Object.keys(remote), ...Object.keys(local)])
  const merged: Record<string, T[]> = {}
  for (const id of ids) {
    merged[id] = mergeTicketLists(remote[id] ?? [], local[id] ?? [])
  }
  return merged
}

export function mergePaidIds(remote: string[] | undefined, local: string[] | undefined): string[] {
  return [...new Set([...(remote ?? []), ...(local ?? [])])]
}

export function mergeInvoiceExtensions(
  remote: Record<string, number> | undefined,
  local: Record<string, number> | undefined,
): Record<string, number> {
  const merged: Record<string, number> = { ...(remote ?? {}) }
  for (const [id, days] of Object.entries(local ?? {})) {
    merged[id] = Math.max(merged[id] ?? 0, days)
  }
  return merged
}

function recordMap<T>(value: unknown): Record<string, T[]> {
  if (!value || typeof value !== 'object') return {}
  return value as Record<string, T[]>
}

function idList(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : []
}

function extensionMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {}
  return value as Record<string, number>
}

/** Merge portal ops from two devices or from cloud + local. */
export function mergePortalOps(
  remote: Record<string, unknown>,
  local: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...remote,
    ...local,
    payments: mergePaymentLists(
      Array.isArray(remote.payments) ? (remote.payments as PaymentLike[]) : [],
      Array.isArray(local.payments) ? (local.payments as PaymentLike[]) : [],
    ),
    invoiceMap: mergeInvoiceMaps(
      recordMap<InvoiceLike>(remote.invoiceMap),
      recordMap<InvoiceLike>(local.invoiceMap),
    ),
    ticketMap: mergeTicketMaps(
      recordMap<TicketLike>(remote.ticketMap),
      recordMap<TicketLike>(local.ticketMap),
    ),
    paidIds: mergePaidIds(idList(remote.paidIds), idList(local.paidIds)),
    invoiceExtensions: mergeInvoiceExtensions(
      extensionMap(remote.invoiceExtensions),
      extensionMap(local.invoiceExtensions),
    ),
  }
}

/** Merge incoming sync payload with existing cloud data before save. */
export function mergeSyncPayload(existing: SyncPayload | null, incoming: SyncPayload): SyncPayload {
  if (!existing?.ops || typeof existing.ops !== 'object') return incoming
  if (!incoming.ops || typeof incoming.ops !== 'object') return incoming

  const existingOps = existing.ops as Record<string, unknown>
  const incomingOps = incoming.ops as Record<string, unknown>

  const accounts = Array.isArray(incoming.accounts) && incoming.accounts.length > 0
    ? incoming.accounts
    : existing.accounts

  return {
    ...incoming,
    accounts,
    ops: mergePortalOps(existingOps, incomingOps),
    updated_at: incoming.updated_at ?? new Date().toISOString(),
  }
}
