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

export type ResidentLike = {
  id: string
  name?: string
  phone?: string
  pin?: string
  apartment?: string
  buildingNumber?: string
  amountPaid?: number
  contractTotal?: number
  rentAmount?: number
  rentSchedule?: unknown
  rentDueDay?: number
  nextDueDateIso?: string
  amountPaidManual?: boolean
}

export type AccountLike = {
  phone: string
  pin: string
  role: string
  name: string
  residentId?: string
  staffTier?: string
}

function normalizePhoneDigits(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('971') && digits.length >= 12) {
    digits = `0${digits.slice(3)}`
  }
  if (digits.length === 9 && digits.startsWith('5')) {
    digits = `0${digits}`
  }
  return digits
}

/** Merge login accounts without dropping residents registered on another device. */
export function mergeAccountLists<T extends AccountLike>(remote: T[], local: T[]): T[] {
  if (!local.length) return remote
  if (!remote.length) return local

  const localByResident = new Map(
    local
      .filter((a) => a.role === 'resident' && a.residentId)
      .map((a) => [a.residentId!, a]),
  )
  const localByPhone = new Map(
    local
      .filter((a) => a.role === 'resident')
      .map((a) => [normalizePhoneDigits(a.phone), a]),
  )

  const merged = remote.map((remoteAccount) => {
    if (remoteAccount.role !== 'resident') return remoteAccount
    const localAccount =
      (remoteAccount.residentId ? localByResident.get(remoteAccount.residentId) : undefined) ??
      localByPhone.get(normalizePhoneDigits(remoteAccount.phone))
    if (!localAccount) return remoteAccount
    if (localAccount.phone !== remoteAccount.phone || localAccount.pin !== remoteAccount.pin) {
      return {
        ...remoteAccount,
        ...localAccount,
        phone: normalizePhoneDigits(localAccount.phone),
      } as T
    }
    return remoteAccount
  })

  for (const localAccount of local) {
    if (localAccount.role !== 'resident') continue
    const phoneKey = normalizePhoneDigits(localAccount.phone)
    if (!phoneKey && !localAccount.residentId) continue
    const alreadyMerged = merged.some(
      (a) =>
        a.role === 'resident' &&
        ((localAccount.residentId && a.residentId === localAccount.residentId) ||
          (phoneKey && normalizePhoneDigits(a.phone) === phoneKey)),
    )
    if (!alreadyMerged) {
      merged.push({ ...localAccount, phone: phoneKey || localAccount.phone } as T)
    }
  }

  return merged
}

function residentRentFieldsDiffer<T extends ResidentLike>(a: T, b: T): boolean {
  const localPhone = (a.phone ?? '').trim()
  const remotePhone = (b.phone ?? '').trim()
  return (
    (localPhone && localPhone !== remotePhone) ||
    ((a.name ?? '').trim() && (a.name ?? '').trim() !== (b.name ?? '').trim()) ||
    (Boolean(a.pin) && a.pin !== b.pin) ||
    a.amountPaid !== b.amountPaid ||
    a.contractTotal !== b.contractTotal ||
    a.rentAmount !== b.rentAmount ||
    a.rentSchedule !== b.rentSchedule ||
    a.rentDueDay !== b.rentDueDay ||
    a.nextDueDateIso !== b.nextDueDateIso ||
    Boolean(a.amountPaidManual) !== Boolean(b.amountPaidManual)
  )
}

function mergeResidentRecord<T extends ResidentLike>(
  remote: T,
  local: T,
  preferLocal: boolean,
): T {
  const remoteTotal = Number(remote.contractTotal) || 0
  const localTotal = Number(local.contractTotal) || 0
  const remoteRent = Number(remote.rentAmount) || 0
  const localRent = Number(local.rentAmount) || 0
  const remotePaid = Number(remote.amountPaid) || 0
  const localPaid = Number(local.amountPaid) || 0
  const base = preferLocal ? { ...remote, ...local } : { ...local, ...remote }
  const amountPaid =
    preferLocal
      ? localPaid
      : local.amountPaidManual
        ? localPaid
        : Math.max(remotePaid, localPaid)

  return {
    ...base,
    contractTotal: Math.max(remoteTotal, localTotal),
    rentAmount: Math.max(remoteRent, localRent),
    amountPaid,
    amountPaidManual: Boolean(local.amountPaidManual || remote.amountPaidManual),
    rentSchedule:
      localRent > 0 && remoteRent === 0
        ? local.rentSchedule
        : remoteRent > 0 && localRent === 0
          ? remote.rentSchedule
          : preferLocal
            ? (local.rentSchedule ?? remote.rentSchedule)
            : (remote.rentSchedule ?? local.rentSchedule),
    rentDueDay:
      Math.max(Number(local.rentDueDay) || 0, Number(remote.rentDueDay) || 0) ||
      remote.rentDueDay ||
      local.rentDueDay,
    nextDueDateIso: preferLocal
      ? local.nextDueDateIso || remote.nextDueDateIso
      : remote.nextDueDateIso || local.nextDueDateIso,
    phone: (local.phone ?? '').trim() || remote.phone,
    pin: local.pin || remote.pin,
    name: (local.name ?? '').trim() || remote.name,
    apartment: remote.apartment,
    id: remote.id,
    buildingNumber: (local.buildingNumber ?? '').trim()
      ? local.buildingNumber
      : remote.buildingNumber,
  } as T
}

/** Merge residents field-wise; preferIncoming=false applies fresher cloud data on pull. */
export function mergeResidentLists<T extends ResidentLike>(
  remote: T[],
  local: T[],
  preferIncoming = true,
): T[] {
  if (!local.length) return remote
  const localById = new Map(local.map((r) => [r.id, r]))
  const merged = remote.map((remoteResident) => {
    const localResident = localById.get(remoteResident.id)
    if (!localResident) return remoteResident
    if (!residentRentFieldsDiffer(localResident, remoteResident)) return remoteResident
    return mergeResidentRecord(remoteResident, localResident, preferIncoming)
  })
  for (const localResident of local) {
    if (!merged.some((r) => r.id === localResident.id)) merged.push(localResident)
  }
  return merged
}

function paymentStatusRank(status?: string): number {
  switch (status) {
    case 'pending_review':
      return 1
    case 'partial':
      return 2
    case 'rejected':
      return 3
    case 'settled':
      return 4
    case 'deleted':
      return 5
    default:
      return 0
  }
}

function mergePaymentRecord<T extends PaymentLike>(existing: T, incoming: T): T {
  if (existing.status === 'deleted' || incoming.status === 'deleted') {
    return (existing.status === 'deleted' ? existing : incoming) as T
  }

  const rankA = paymentStatusRank(existing.status)
  const rankB = paymentStatusRank(incoming.status)
  let merged: T
  if (rankB > rankA) {
    merged = { ...existing, ...incoming } as T
  } else if (rankA > rankB) {
    merged = { ...incoming, ...existing } as T
  } else {
    const preferIncoming =
      (incoming.transferProof?.dataUrl && !existing.transferProof?.dataUrl) ||
      (Boolean((incoming as { reviewedAt?: string }).reviewedAt) &&
        !(existing as { reviewedAt?: string }).reviewedAt)
    merged = (preferIncoming ? { ...existing, ...incoming } : { ...incoming, ...existing }) as T
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

function invoiceIdKey(id: string) {
  return id.trim().toUpperCase()
}

export function mergeRemovedInvoiceIds(
  remote: string[] | undefined,
  local: string[] | undefined,
): string[] {
  return [...new Set([...(remote ?? []), ...(local ?? [])].map(invoiceIdKey))]
}

export function applyRemovedInvoices<T extends InvoiceLike>(
  map: Record<string, T[]>,
  removedIds: string[] | undefined,
): Record<string, T[]> {
  if (!removedIds?.length) return map
  const removed = new Set(removedIds.map(invoiceIdKey))
  const next: Record<string, T[]> = {}
  for (const [residentId, invoices] of Object.entries(map)) {
    const kept = invoices.filter((inv) => !removed.has(invoiceIdKey(inv.id)))
    if (kept.length > 0) next[residentId] = kept
  }
  return next
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

function residentList(value: unknown): ResidentLike[] {
  return Array.isArray(value) ? (value as ResidentLike[]) : []
}

/** Merge portal ops from two devices or from cloud + local. */
export function mergePortalOps(
  remote: Record<string, unknown>,
  local: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...remote,
    ...local,
    residentList: mergeResidentLists(residentList(remote.residentList), residentList(local.residentList), true),
    payments: mergePaymentLists(
      Array.isArray(remote.payments) ? (remote.payments as PaymentLike[]) : [],
      Array.isArray(local.payments) ? (local.payments as PaymentLike[]) : [],
    ),
    removedInvoiceIds: mergeRemovedInvoiceIds(
      idList(remote.removedInvoiceIds),
      idList(local.removedInvoiceIds),
    ),
    invoiceMap: applyRemovedInvoices(
      mergeInvoiceMaps(
        recordMap<InvoiceLike>(remote.invoiceMap),
        recordMap<InvoiceLike>(local.invoiceMap),
      ),
      mergeRemovedInvoiceIds(idList(remote.removedInvoiceIds), idList(local.removedInvoiceIds)),
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

  const existingAccounts = Array.isArray(existing.accounts)
    ? (existing.accounts as AccountLike[])
    : []
  const incomingAccounts = Array.isArray(incoming.accounts)
    ? (incoming.accounts as AccountLike[])
    : []
  const accounts =
    incomingAccounts.length > 0
      ? mergeAccountLists(existingAccounts, incomingAccounts)
      : existing.accounts

  return {
    ...incoming,
    accounts,
    ops: mergePortalOps(existingOps, incomingOps),
    updated_at: incoming.updated_at ?? new Date().toISOString(),
  }
}
