export type ProofStore = Record<string, { name: string; dataUrl: string }>

export type SyncPayload = {
  accounts: unknown
  ops: unknown
  updated_at?: string
}

type PaymentLike = {
  id: string
  status?: string
  transferProof?: { name: string; dataUrl?: string }
}

function paymentsFromOps(ops: unknown): PaymentLike[] {
  if (!ops || typeof ops !== 'object') return []
  const list = (ops as { payments?: unknown }).payments
  return Array.isArray(list) ? (list as PaymentLike[]) : []
}

/** Move pending proof images out of the main sync blob. */
export function detachProofsFromPayload(payload: SyncPayload): {
  payload: SyncPayload
  proofs: ProofStore
} {
  const proofs: ProofStore = {}
  if (!payload.ops || typeof payload.ops !== 'object') {
    return { payload, proofs }
  }

  const ops = payload.ops as Record<string, unknown>
  const payments = paymentsFromOps(ops)
  if (payments.length === 0) return { payload, proofs }

  const nextPayments = payments.map((payment) => {
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

  return {
    payload: { ...payload, ops: { ...ops, payments: nextPayments } },
    proofs,
  }
}

/** Restore pending proof images after loading the main sync blob. */
export function attachProofsToPayload(payload: SyncPayload, proofs: ProofStore): SyncPayload {
  if (!payload.ops || typeof payload.ops !== 'object') return payload
  if (Object.keys(proofs).length === 0) return payload

  const ops = payload.ops as Record<string, unknown>
  const payments = paymentsFromOps(ops)
  if (payments.length === 0) return payload

  const nextPayments = payments.map((payment) => {
    if (payment.status !== 'pending_review') return payment
    const stored = proofs[payment.id]
    if (!stored?.dataUrl) return payment
    return {
      ...payment,
      transferProof: { name: stored.name || payment.transferProof?.name || 'proof', dataUrl: stored.dataUrl },
    }
  })

  return { ...payload, ops: { ...ops, payments: nextPayments } }
}

/** Legacy payloads may still embed proof data URLs — extract on read. */
export function normalizeLoadedPayload(payload: SyncPayload, externalProofs: ProofStore = {}): SyncPayload {
  const { payload: stripped, proofs: inlineProofs } = detachProofsFromPayload(payload)
  const mergedProofs = { ...inlineProofs, ...externalProofs }
  return attachProofsToPayload(stripped, mergedProofs)
}
