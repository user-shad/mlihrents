import type { PaymentRecord } from '../data'

export type LocalProofStore = Record<string, { name: string; dataUrl: string }>

export const PROOFS_KEY = 'mlihrents_proofs_v1'

type OpsWithPayments = { payments: PaymentRecord[] }

export function readLocalProofs(): LocalProofStore {
  try {
    const raw = localStorage.getItem(PROOFS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as LocalProofStore
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function writeLocalProofs(proofs: LocalProofStore) {
  try {
    localStorage.setItem(PROOFS_KEY, JSON.stringify(proofs))
  } catch {
    /* quota */
  }
}

export function mergeProofStores(
  existing: LocalProofStore,
  incoming: LocalProofStore,
  payments: PaymentRecord[],
): LocalProofStore {
  const pendingIds = new Set(
    payments.filter((payment) => payment.status === 'pending_review').map((payment) => payment.id),
  )
  const merged: LocalProofStore = {}

  for (const id of pendingIds) {
    const next = incoming[id]?.dataUrl ? incoming[id] : existing[id]
    if (next?.dataUrl) merged[id] = next
  }

  return merged
}

export function attachProofsToOps<T extends OpsWithPayments>(ops: T, proofs: LocalProofStore): T {
  if (Object.keys(proofs).length === 0) return ops
  return {
    ...ops,
    payments: ops.payments.map((payment) => {
      if (payment.status !== 'pending_review') return payment
      const stored = proofs[payment.id]
      if (!stored?.dataUrl) return payment
      return {
        ...payment,
        transferProof: {
          name: stored.name || payment.transferProof?.name || 'proof',
          dataUrl: stored.dataUrl,
        },
      }
    }),
  }
}

export function detachProofsFromOps<T extends OpsWithPayments>(ops: T): { ops: T; proofs: LocalProofStore } {
  const proofs: LocalProofStore = {}
  const payments = ops.payments.map((payment) => {
    const proof = payment.transferProof
    if (payment.status === 'pending_review' && proof?.dataUrl) {
      proofs[payment.id] = { name: proof.name, dataUrl: proof.dataUrl }
      return {
        ...payment,
        transferProof: { name: proof.name, dataUrl: '' },
      }
    }
    if (payment.status !== 'pending_review' && proof) {
      return { ...payment, transferProof: undefined }
    }
    return payment
  })

  return { ops: { ...ops, payments }, proofs }
}

export function persistLocalProofsFromOps<T extends OpsWithPayments>(ops: T) {
  const { proofs: incoming } = detachProofsFromOps(ops)
  const merged = mergeProofStores(readLocalProofs(), incoming, ops.payments)
  writeLocalProofs(merged)
}

/** Keep pending screenshots from a cloud pull in this browser's proof cache. */
export function ingestRemoteProofs<T extends OpsWithPayments>(ops: T) {
  const incoming: LocalProofStore = {}
  for (const payment of ops.payments) {
    if (payment.status !== 'pending_review') continue
    const proof = payment.transferProof
    if (!proof?.dataUrl) continue
    incoming[payment.id] = { name: proof.name || 'proof.jpg', dataUrl: proof.dataUrl }
  }
  if (Object.keys(incoming).length === 0) return
  writeLocalProofs(mergeProofStores(readLocalProofs(), incoming, ops.payments))
}
