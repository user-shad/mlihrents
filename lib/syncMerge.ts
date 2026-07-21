import type { SyncPayload } from './syncProofStore.js'

export type PaymentLike = {
  id: string
  status?: string
  transferProof?: { name: string; dataUrl?: string }
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

/** Merge incoming sync payload with existing cloud data before save. */
export function mergeSyncPayload(existing: SyncPayload | null, incoming: SyncPayload): SyncPayload {
  if (!existing?.ops || typeof existing.ops !== 'object') return incoming
  if (!incoming.ops || typeof incoming.ops !== 'object') return incoming

  const existingOps = existing.ops as Record<string, unknown>
  const incomingOps = incoming.ops as Record<string, unknown>
  const existingPayments = Array.isArray(existingOps.payments)
    ? (existingOps.payments as PaymentLike[])
    : []
  const incomingPayments = Array.isArray(incomingOps.payments)
    ? (incomingOps.payments as PaymentLike[])
    : []

  const accounts = Array.isArray(incoming.accounts) && incoming.accounts.length > 0
    ? incoming.accounts
    : existing.accounts

  return {
    ...incoming,
    accounts,
    ops: {
      ...existingOps,
      ...incomingOps,
      payments: mergePaymentLists(existingPayments, incomingPayments),
    },
    updated_at: incoming.updated_at ?? new Date().toISOString(),
  }
}
