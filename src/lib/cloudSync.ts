import type { AccountRecord } from '../context/AuthContext'
import { prepareStoredAccounts, syncLoginAccountsFromResidents } from './accountBootstrap'
import type { BankAccountSettings } from '../config/paymentSettings'
import type {
  AvailableApartment,
  Invoice,
  PaymentRecord,
  RentSchedule,
  Resident,
  Ticket,
} from '../data'
import {
  availableApartments,
  defaultServiceDirectory,
  invoicesByResident,
  residents,
  migrateResident,
  paymentsPerYearToIntervalMonths,
  seedPayments,
  ticketsByResident,
  type ServiceContact,
} from '../data'
import { defaultBankSettings } from '../config/paymentSettings'
import {
  attachProofsToOps,
  detachProofsFromOps,
  ingestRemoteProofs,
  persistLocalProofsFromOps,
  readLocalProofs,
  writeLocalProofs,
} from './localProofStore'
import {
  applyRemovedInvoices,
  mergeAccountLists,
  mergeInvoiceExtensions,
  mergeInvoiceMaps,
  mergePaidIds,
  mergePaymentLists,
  mergeRemovedInvoiceIds,
  mergeResidentLists,
  mergeRevokedResidentLogins,
  mergeTicketMaps,
} from '../../lib/syncMerge'
import { isBankConfigured } from '../config/paymentSettings'
import { isSupabaseConfigured, supabase } from './supabase'

export const ACCOUNTS_KEY = 'mlihrents_accounts_v3'
export const OPS_KEY = 'mlihrents_ops_v5'
const LEGACY_OPS_KEYS = ['mlihrents_ops_v4']
const SYNC_ROW_ID = 'main'
const LOCAL_SYNC_META_KEY = 'mlihrents_sync_meta'
const PAYMENT_RESET_ACK_KEY = 'mlihrents_payment_reset_ack'

function syncApiToken() {
  return (import.meta.env.VITE_SYNC_API_TOKEN as string | undefined)?.trim() ?? ''
}

function syncApiHeaders(): HeadersInit {
  const token = syncApiToken()
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

function syncApiAuthError(status: number): string | null {
  if (status === 401) {
    return 'Sync blocked — missing or invalid sync token (check VITE_SYNC_API_TOKEN on Vercel)'
  }
  if (status === 503) {
    return 'Sync token not configured on server — set SYNC_API_TOKEN on Vercel and redeploy'
  }
  return null
}

export type SyncMode = 'cloud' | 'local'

export interface PortalOps {
  residentList: Resident[]
  listings: AvailableApartment[]
  payments: PaymentRecord[]
  invoiceMap: Record<string, Invoice[]>
  ticketMap: Record<string, Ticket[]>
  invoiceExtensions: Record<string, number>
  paidIds: string[]
  /** Invoice ids admin removed — kept across sync so they are not recreated. */
  removedInvoiceIds?: string[]
  /** Resident ids whose login admin revoked — do not recreate from apartment phone/pin. */
  revokedResidentLogins?: string[]
  bankSettings: BankAccountSettings
  serviceDirectory: ServiceContact[]
  /** Set after rent schedule values were migrated to month intervals. */
  rentScheduleUsesIntervalMonths?: boolean
  /** When set, all devices clear local payment cache once this timestamp is seen. */
  paymentResetAt?: string
  /** Rent reminder send log: residentId:YYYY-MM → ISO timestamp. */
  whatsappReminderLog?: Record<string, string>
  whatsappReminderLastRun?: {
    at: string
    sent: number
    skipped: number
    failed: number
    errors: string[]
  }
}

export interface BootstrapData {
  accounts: AccountRecord[]
  ops: PortalOps
}

export interface SyncStatus {
  configured: boolean
  mode: SyncMode
  storage: string | null
  updatedAt: string | null
  hint: string | null
  lastError: string | null
  backends: {
    blob: boolean
    redis: boolean
    postgres: boolean
    supabase: boolean
    github?: boolean
  } | null
}

type AccountsListener = (accounts: AccountRecord[]) => void
type OpsListener = (ops: PortalOps) => void

type CloudRow = {
  accounts: AccountRecord[]
  ops: PortalOps
  updated_at: string | null
}

let bootstrapPromise: Promise<BootstrapData> | null = null
let pendingAccounts: AccountRecord[] | undefined
let pendingOps: PortalOps | undefined
let flushTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setTimeout> | null = null
let configPollTimer: ReturnType<typeof setInterval> | null = null
let suppressRemoteUntil = 0
let suppressCloudPush = 0
let suppressCloudPushUntil = 0
let accountsListener: AccountsListener | null = null
let opsListener: OpsListener | null = null
let realtimeStarted = false
let syncMode: SyncMode = 'local'
let lastSyncError: string | null = null
let lastCloudUpdatedAt: string | null = null
let lastBackendHealth: SyncStatus['backends'] = null

async function readJsonResponse<T>(res: Response): Promise<T | null> {
  const ct = res.headers.get('content-type') ?? ''
  if (!ct.includes('application/json')) {
    lastSyncError = 'Sync API not deployed — wait for Vercel redeploy'
    return null
  }
  return (await res.json()) as T
}

export async function fetchSyncHealth(): Promise<SyncStatus['backends'] | null> {
  try {
    const res = await fetch('/api/sync-health', { cache: 'no-store', headers: syncApiHeaders() })
    const authErr = syncApiAuthError(res.status)
    if (authErr) {
      lastSyncError = authErr
      return null
    }
    if (!res.ok) return null
    const data = await readJsonResponse<{
      configured?: boolean
      backends?: SyncStatus['backends']
    }>(res)
    if (!data?.backends) return null
    lastBackendHealth = data.backends
    if (data.configured) {
      syncMode = 'cloud'
      lastSyncError = null
    } else {
      const active = Object.entries(data.backends)
        .filter(([, v]) => v)
        .map(([k]) => k)
      if (active.length === 0) {
        lastSyncError =
          'No cloud storage linked — set GitHub gist sync env on Vercel, or connect Redis/Blob → Redeploy'
      }
    }
    return data.backends
  } catch {
    return null
  }
}

export function getSyncMode() {
  return syncMode
}

export function getSyncStatus(): SyncStatus {
  return {
    configured: syncMode === 'cloud',
    mode: syncMode,
    storage: syncMode === 'cloud' ? 'api' : null,
    updatedAt: lastCloudUpdatedAt,
    hint:
      syncMode === 'local'
        ? 'Cloud storage missing — redeploy after linking GitHub gist / Redis / Blob'
        : null,
    lastError: lastSyncError,
    backends: lastBackendHealth,
  }
}

export function createDefaultOps(): PortalOps {
  return {
    residentList: residents,
    listings: availableApartments,
    payments: seedPayments,
    invoiceMap: invoicesByResident,
    ticketMap: ticketsByResident,
    invoiceExtensions: {},
    paidIds: [],
    removedInvoiceIds: [],
    revokedResidentLogins: [],
    bankSettings: defaultBankSettings,
    serviceDirectory: defaultServiceDirectory,
  }
}

function readLocalSyncMeta(): { updatedAt: string } {
  try {
    const raw = localStorage.getItem(LOCAL_SYNC_META_KEY)
    if (!raw) return { updatedAt: '' }
    const parsed = JSON.parse(raw) as { updatedAt?: string }
    return { updatedAt: parsed.updatedAt ?? '' }
  } catch {
    return { updatedAt: '' }
  }
}

function readPaymentResetAck(): string {
  try {
    return localStorage.getItem(PAYMENT_RESET_ACK_KEY) ?? ''
  } catch {
    return ''
  }
}

function ackPaymentReset(at: string) {
  try {
    localStorage.setItem(PAYMENT_RESET_ACK_KEY, at)
  } catch {
    /* quota */
  }
}

function mergeResidentsAfterPaymentReset(
  remote: PortalOps['residentList'],
  local: PortalOps['residentList'] | undefined,
): PortalOps['residentList'] {
  if (!local?.length) return remote
  const localById = new Map(local.map((r) => [r.id, r]))
  return remote.map((remoteResident) => {
    const localResident = localById.get(remoteResident.id)
    if (!localResident) return remoteResident
    return {
      ...localResident,
      ...remoteResident,
      amountPaid: remoteResident.amountPaid,
      status: remoteResident.status,
      apartment: remoteResident.apartment,
      id: remoteResident.id,
    }
  })
}

/** Apply admin payment wipe to this device (admin + resident portals). */
function applyPaymentResetFromCloud(remote: PortalOps, local: PortalOps | null): PortalOps {
  const resetAt = remote.paymentResetAt?.trim()
  if (!resetAt) {
    return local ? mergeOpsPreferringLocalProofs(remote, local) : remote
  }

  const acked = readPaymentResetAck()
  if (acked && acked >= resetAt) {
    return local ? mergeOpsPreferringLocalProofs(remote, local) : remote
  }

  writeLocalProofs({})
  ackPaymentReset(resetAt)

  const base = local ? { ...local, ...remote } : remote
  return {
    ...base,
    payments: remote.payments ?? [],
    paidIds: remote.paidIds ?? [],
    invoiceMap: remote.invoiceMap ?? {},
    residentList: mergeResidentsAfterPaymentReset(remote.residentList ?? [], local?.residentList),
    paymentResetAt: resetAt,
  }
}

function touchLocalSyncMeta() {
  localStorage.setItem(
    LOCAL_SYNC_META_KEY,
    JSON.stringify({ updatedAt: new Date().toISOString() }),
  )
}

/** Call before local mutations so cloud pull cannot overwrite in-flight edits. */
export function markLocalMutation() {
  touchLocalSyncMeta()
  suppressRemoteUntil = Date.now() + 5000
}

function hasPendingLocalSave() {
  return Boolean(pendingOps || pendingAccounts || flushTimer)
}

function cloudPushBlocked() {
  return suppressCloudPush > 0 || Date.now() < suppressCloudPushUntil
}

function deferCloudPushAfterRemoteApply() {
  suppressCloudPushUntil = Date.now() + 2500
}

function readLocalAccounts(): AccountRecord[] | null {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AccountRecord[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null
  } catch {
    return null
  }
}

function readLocalOps(): PortalOps | null {
  try {
    let raw = localStorage.getItem(OPS_KEY)
    if (!raw) {
      for (const legacyKey of LEGACY_OPS_KEYS) {
        raw = localStorage.getItem(legacyKey)
        if (raw) break
      }
    }
    if (!raw) return null
    const parsed = JSON.parse(raw) as PortalOps
    if (!parsed || typeof parsed !== 'object') return null
    return attachProofsToOps(parsed, readLocalProofs())
  } catch {
    return null
  }
}

function hasOpsData(ops: PortalOps) {
  return (
    ops.residentList.some((r) => r.name.trim() || r.phone.trim()) ||
    ops.payments.length > 0 ||
    ops.listings.some((l) => l.highlight?.trim()) ||
    Object.values(ops.invoiceMap).some((list) => list.length > 0) ||
    isBankConfiguredOps(ops)
  )
}

function isBankConfiguredOps(ops: PortalOps) {
  const b = ops.bankSettings
  return Boolean(b?.iban?.trim() || b?.accountName?.trim())
}

function hasAccountsData(accounts: AccountRecord[]) {
  return accounts.some((a) => a.role === 'resident' && a.phone.trim())
}

function storedRentScheduleToInterval(value: unknown): RentSchedule {
  if (typeof value === 'string') {
    const legacyInterval: Record<string, RentSchedule> = {
      monthly: 1,
      quarterly: 3,
      semi_annual: 6,
      annual: 12,
      full_lease: 12,
    }
    const direct = legacyInterval[value.trim()]
    if (direct) return direct
    const n = Number(value)
    if (Number.isFinite(n)) return paymentsPerYearToIntervalMonths(n)
    return 1
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return paymentsPerYearToIntervalMonths(value)
  }
  return 1
}

function normalizeCloudOps(raw: unknown): PortalOps {
  if (!raw || typeof raw !== 'object') return createDefaultOps()
  const ops = raw as PortalOps
  const residentSource = ops.residentList ?? residents
  const residentList = ops.rentScheduleUsesIntervalMonths
    ? residentSource.map((r) => migrateResident(r))
    : residentSource.map((r) =>
        migrateResident({ ...r, rentSchedule: storedRentScheduleToInterval(r.rentSchedule) }),
      )
  return {
    residentList,
    listings: ops.listings ?? availableApartments,
    payments: Array.isArray(ops.payments) ? ops.payments : [],
    invoiceMap: ops.invoiceMap ?? invoicesByResident,
    ticketMap: ops.ticketMap ?? ticketsByResident,
    invoiceExtensions: ops.invoiceExtensions ?? {},
    paidIds: Array.isArray(ops.paidIds) ? ops.paidIds : [],
    removedInvoiceIds: Array.isArray(ops.removedInvoiceIds) ? ops.removedInvoiceIds : [],
    revokedResidentLogins: Array.isArray(ops.revokedResidentLogins) ? ops.revokedResidentLogins : [],
    bankSettings: ops.bankSettings ?? defaultBankSettings,
    serviceDirectory:
      Array.isArray(ops.serviceDirectory) && ops.serviceDirectory.length > 0
        ? ops.serviceDirectory
        : defaultServiceDirectory,
    rentScheduleUsesIntervalMonths: true,
    paymentResetAt: ops.paymentResetAt,
  }
}

/** Keep pending screenshots in cloud; strip heavy proofs from settled history. */
export function slimOpsForCloud(ops: PortalOps): PortalOps {
  return {
    ...ops,
    payments: ops.payments.map((p) => {
      if (p.status === 'pending_review' && p.transferProof?.dataUrl) {
        return p
      }
      return {
        ...p,
        transferProof: p.transferProof
          ? { name: p.transferProof.name, dataUrl: '' }
          : undefined,
      }
    }),
  }
}

function parseCloudResponse(data: {
  configured?: boolean
  accounts?: AccountRecord[]
  ops?: unknown
  updated_at?: string | null
  storage?: string | null
  hint?: string
  error?: string
}): CloudRow | null {
  if (!data.configured) {
    if (data.hint) lastSyncError = data.hint
    return null
  }
  syncMode = 'cloud'
  lastSyncError = null
  lastCloudUpdatedAt = data.updated_at ?? null

  // API says configured but returned nothing usable (failed blob read) — keep local data
  const opsObj = data.ops && typeof data.ops === 'object' ? (data.ops as Record<string, unknown>) : null
  const opsEmpty = !opsObj || Object.keys(opsObj).length === 0
  const accountsEmpty = !Array.isArray(data.accounts) || data.accounts.length === 0
  if (opsEmpty && accountsEmpty && !data.updated_at && !data.storage) {
    return null
  }

  return {
    accounts: data.accounts ?? [],
    ops: normalizeCloudOps(data.ops),
    updated_at: data.updated_at ?? null,
  }
}

function cloudRowHasData(row: CloudRow | null): boolean {
  if (!row) return false
  return hasOpsData(row.ops) || hasAccountsData(row.accounts)
}

async function loadCloudRowViaApi(): Promise<CloudRow | null> {
  try {
    void fetchSyncHealth()
    const res = await fetch('/api/portal-sync', { cache: 'no-store', headers: syncApiHeaders() })
    const authErr = syncApiAuthError(res.status)
    if (authErr) {
      lastSyncError = authErr
      return null
    }
    if (res.status === 503) {
      const data = await readJsonResponse<{ hint?: string }>(res)
      lastSyncError = data?.hint ?? 'Cloud storage not connected on Vercel'
      return null
    }
    if (!res.ok) {
      lastSyncError = `Sync API error (${res.status})`
      return null
    }
    const data = await readJsonResponse<Parameters<typeof parseCloudResponse>[0]>(res)
    if (!data) return null
    const parsed = parseCloudResponse(data)
    if (cloudRowHasData(parsed)) return parsed
    return null
  } catch {
    lastSyncError = 'Could not reach sync API'
    return null
  }
}

async function loadCloudRowDirect(): Promise<CloudRow | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('portal_sync')
    .select('accounts, ops, updated_at')
    .eq('id', SYNC_ROW_ID)
    .maybeSingle()
  if (error || !data) return null
  syncMode = 'cloud'
  lastSyncError = null
  lastCloudUpdatedAt = data.updated_at ?? null
  return {
    accounts: (data.accounts as AccountRecord[]) ?? [],
    ops: normalizeCloudOps(data.ops),
    updated_at: data.updated_at ?? null,
  }
}

async function loadCloudRow(): Promise<CloudRow | null> {
  const viaApi = await loadCloudRowViaApi()
  if (viaApi) return viaApi
  return loadCloudRowDirect()
}

async function saveCloudRowViaApi(accounts: AccountRecord[], ops: PortalOps) {
  const preparedAccounts = prepareStoredAccounts(accounts)
  const slimOps = slimOpsForCloud(ops)
  try {
    const res = await fetch('/api/portal-sync', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...syncApiHeaders() },
      body: JSON.stringify({ accounts: preparedAccounts, ops: slimOps }),
    })
    if (res.status === 401 || res.status === 503) {
      lastSyncError = syncApiAuthError(res.status) ?? `Save failed (${res.status})`
      return false
    }
    if (res.ok) {
      const data = (await res.json()) as { updated_at?: string; storage?: string }
      syncMode = 'cloud'
      lastSyncError = null
      lastCloudUpdatedAt = data.updated_at ?? new Date().toISOString()
      touchLocalSyncMeta()
      return true
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string; hint?: string }
    const err = data.error ?? data.hint ?? `Save failed (${res.status})`
    lastSyncError = err.includes('rate limit')
      ? 'Cloud save blocked — GitHub sync rate limit. Connect Vercel Blob or Redis in project Storage, then redeploy.'
      : err
    return false
  } catch {
    lastSyncError = 'Could not save to cloud'
    return false
  }
}

async function saveCloudRow(accounts: AccountRecord[], ops: PortalOps): Promise<boolean> {
  suppressRemoteUntil = Date.now() + 3000

  const existing = await loadCloudRowViaApi()
  if (
    existing &&
    (hasOpsData(existing.ops) || hasAccountsData(existing.accounts)) &&
    !hasOpsData(ops) &&
    !hasAccountsData(accounts)
  ) {
    lastSyncError = 'Skipped empty upload to protect cloud data'
    return false
  }

  const mergedOps =
    existing && hasOpsData(existing.ops) ? mergeOpsPreferringLocalProofs(existing.ops, ops) : ops
  const mergedAccounts =
    existing && hasAccountsData(existing.accounts)
      ? mergeAccountLists(existing.accounts, accounts)
      : accounts
  const syncedAccounts = prepareStoredAccounts(
    syncLoginAccountsFromResidents(
      mergedAccounts,
      mergedOps.residentList,
      mergedOps.revokedResidentLogins ?? [],
    ),
  )

  if (await saveCloudRowViaApi(syncedAccounts, mergedOps)) return true

  if (!supabase) return false
  const preparedAccounts = syncedAccounts
  const slimOps = slimOpsForCloud(mergedOps)
  const updated_at = new Date().toISOString()
  await supabase.from('portal_sync').upsert({
    id: SYNC_ROW_ID,
    accounts: preparedAccounts,
    ops: slimOps,
    updated_at,
  })
  syncMode = 'cloud'
  lastSyncError = null
  lastCloudUpdatedAt = updated_at
  touchLocalSyncMeta()
  return true
}

function cloudTimestamp(cloud: CloudRow | null) {
  if (!cloud?.updated_at) return 0
  const t = Date.parse(cloud.updated_at)
  return Number.isFinite(t) ? t : 0
}

function localTimestamp() {
  const t = Date.parse(readLocalSyncMeta().updatedAt)
  return Number.isFinite(t) ? t : 0
}

function mergeBootstrap(
  cloud: CloudRow | null,
  localAccounts: AccountRecord[] | null,
  localOps: PortalOps,
): BootstrapData {
  const cloudHasAccounts = cloud ? hasAccountsData(cloud.accounts) : false
  const cloudHasOps = cloud ? hasOpsData(cloud.ops) : false
  const localHasAccounts = localAccounts ? hasAccountsData(localAccounts) : false
  const localHasOps = hasOpsData(localOps)

  const cloudTime = cloudTimestamp(cloud)
  const localTime = localTimestamp()
  const preferCloud =
    cloud &&
    (cloudHasAccounts || cloudHasOps) &&
    (cloudTime >= localTime || (!localHasAccounts && !localHasOps))

  let accounts: AccountRecord[] = cloud?.accounts ?? []
  let ops = cloud?.ops ?? createDefaultOps()

  if (cloudHasAccounts && localHasAccounts && localAccounts) {
    accounts = mergeAccountsPreferringLocal(
      cloud!.accounts,
      localAccounts,
      localTime >= cloudTime,
    )
  } else if (preferCloud && cloudHasAccounts) {
    accounts = cloud!.accounts
  } else if (localHasAccounts && localAccounts) {
    accounts = localAccounts
  }

  if (cloudHasOps && localHasOps) {
    const preferLocalResidents = localTime >= cloudTime
    ops = mergeOpsPreferringLocalProofs(cloud!.ops, localOps, preferLocalResidents)
    if (cloud!.ops.paymentResetAt) {
      ops = applyPaymentResetFromCloud(ops, localOps)
    }
  } else if (preferCloud && cloudHasOps) {
    ops = applyPaymentResetFromCloud(cloud!.ops, localHasOps ? localOps : null)
  } else {
    if (localHasOps) ops = localOps
    if (cloud?.ops?.paymentResetAt) {
      ops = applyPaymentResetFromCloud(cloud.ops, localHasOps ? localOps : null)
    }
  }

  return { accounts: prepareStoredAccounts(syncLoginAccountsFromResidents(accounts, ops.residentList, ops.revokedResidentLogins ?? [])), ops }
}

async function pushLocalToCloudIfNeeded(data: BootstrapData, cloud: CloudRow | null) {
  const cloudHasAccounts = cloud ? hasAccountsData(cloud.accounts) : false
  const cloudHasOps = cloud ? hasOpsData(cloud.ops) : false
  const localHasAccounts = hasAccountsData(data.accounts)
  const localHasOps = hasOpsData(data.ops)

  if (!localHasAccounts && !localHasOps) return

  const cloudTime = cloudTimestamp(cloud)
  const localTime = localTimestamp()

  if (!cloud || (!cloudHasAccounts && !cloudHasOps) || localTime > cloudTime) {
    await saveCloudRow(data.accounts, data.ops)
  }
}

async function doBootstrap(): Promise<BootstrapData> {
  const localAccounts = readLocalAccounts()
  const localOps = readLocalOps() ?? createDefaultOps()

  const cloud = await loadCloudRow()
  let merged = mergeBootstrap(cloud, localAccounts, localOps)
  const residentAccountsBefore = merged.accounts.filter((a) => a.role === 'resident').length
  merged = {
    ...merged,
    accounts: prepareStoredAccounts(
      syncLoginAccountsFromResidents(
        merged.accounts,
        merged.ops.residentList,
        merged.ops.revokedResidentLogins ?? [],
      ),
    ),
  }

  if (syncMode === 'cloud') {
    const residentAccountsAfter = merged.accounts.filter((a) => a.role === 'resident').length
    if (residentAccountsAfter > residentAccountsBefore) {
      await saveCloudRow(merged.accounts, merged.ops)
    } else {
      await pushLocalToCloudIfNeeded(merged, cloud)
    }
    startPolling()
    startRealtimeSync()
  } else {
    startConfigPolling()
  }

  return merged
}

function mergeAccountsPreferringLocal(
  remote: AccountRecord[],
  local: AccountRecord[] | null,
  preferLocalResidents = true,
): AccountRecord[] {
  if (!local?.length) return remote
  return mergeAccountLists(remote, local, !preferLocalResidents)
}

function mergeOpsPreferringLocalProofs(
  remote: PortalOps,
  local: PortalOps | null,
  preferLocalResidents = true,
): PortalOps {
  if (!local) return remote
  const removedInvoiceIds = mergeRemovedInvoiceIds(
    remote.removedInvoiceIds,
    local.removedInvoiceIds,
  )
  const revokedResidentLogins = mergeRevokedResidentLogins(
    remote.revokedResidentLogins,
    local.revokedResidentLogins,
  )
  return {
    ...remote,
    ...local,
    residentList: mergeResidentLists(remote.residentList, local.residentList, preferLocalResidents),
    payments: mergePaymentLists(remote.payments, local.payments),
    invoiceMap: applyRemovedInvoices(
      mergeInvoiceMaps(remote.invoiceMap, local.invoiceMap),
      removedInvoiceIds,
    ),
    ticketMap: mergeTicketMaps(remote.ticketMap, local.ticketMap),
    paidIds: mergePaidIds(remote.paidIds, local.paidIds),
    removedInvoiceIds,
    revokedResidentLogins,
    invoiceExtensions: mergeInvoiceExtensions(remote.invoiceExtensions, local.invoiceExtensions),
    listings: local.listings?.length ? local.listings : remote.listings,
    serviceDirectory: local.serviceDirectory?.length ? local.serviceDirectory : remote.serviceDirectory,
    bankSettings: isBankConfigured(local.bankSettings) ? local.bankSettings : remote.bankSettings,
  }
}

function applyRemoteRow(row: CloudRow) {
  if (hasPendingLocalSave()) return

  const localOps = readLocalOps()
  const localAccounts = readLocalAccounts()
  const remoteEmpty = !hasOpsData(row.ops) && !hasAccountsData(row.accounts)
  const localHas =
    (localOps ? hasOpsData(localOps) : false) ||
    (localAccounts ? hasAccountsData(localAccounts) : false)
  if (remoteEmpty && localHas) return

  const preferLocalResidents = cloudTimestamp(row) <= localTimestamp()
  deferCloudPushAfterRemoteApply()

  if (row.ops.paymentResetAt && row.ops.paymentResetAt > readPaymentResetAck()) {
    const mergedOps = applyPaymentResetFromCloud(row.ops, localOps)
    let mergedAccounts = mergeAccountsPreferringLocal(
      row.accounts,
      localAccounts,
      preferLocalResidents,
    )
    mergedAccounts = prepareStoredAccounts(
      syncLoginAccountsFromResidents(
        mergedAccounts,
        mergedOps.residentList,
        mergedOps.revokedResidentLogins ?? [],
      ),
    )
    suppressCloudPush++
    try {
      accountsListener?.(prepareStoredAccounts(mergedAccounts))
      opsListener?.(mergedOps)
      lastCloudUpdatedAt = row.updated_at
    } finally {
      suppressCloudPush--
    }
    return
  }

  const mergedOps = localOps
    ? mergeOpsPreferringLocalProofs(row.ops, localOps, preferLocalResidents)
    : row.ops
  ingestRemoteProofs(mergedOps)
  let mergedAccounts = mergeAccountsPreferringLocal(
    row.accounts,
    localAccounts,
    preferLocalResidents,
  )
  mergedAccounts = prepareStoredAccounts(
    syncLoginAccountsFromResidents(
      mergedAccounts,
      mergedOps.residentList,
      mergedOps.revokedResidentLogins ?? [],
    ),
  )

  suppressCloudPush++
  try {
    accountsListener?.(prepareStoredAccounts(mergedAccounts))
    opsListener?.(mergedOps)
    lastCloudUpdatedAt = row.updated_at
  } finally {
    suppressCloudPush--
  }
}

function opsSyncFingerprint(ops: PortalOps): string {
  const paymentFp = ops.payments
    .map((p) => `${p.id}:${p.status}:${p.reviewedAt ?? ''}`)
    .sort()
    .join('|')
  const residentFp = ops.residentList
    .map((r) => `${r.id}:${r.amountPaid}:${r.contractTotal}:${r.nextDueDateIso ?? ''}`)
    .sort()
    .join('|')
  const removedFp = (ops.removedInvoiceIds ?? []).slice().sort().join('|')
  const revokedFp = (ops.revokedResidentLogins ?? []).slice().sort().join('|')
  return `${paymentFp}::${residentFp}::${removedFp}::${revokedFp}`
}

function pollIntervalMs() {
  const ops = readLocalOps()
  if (!ops) return 15000
  const active = ops.payments.some(
    (p) => p.status === 'pending_review' || p.status === 'partial',
  )
  return active ? 8000 : 15000
}

function schedulePoll() {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = setTimeout(() => {
    pollTimer = null
    if (typeof document === 'undefined' || !document.hidden) {
      pullRemoteIfNewer()
    }
    if (syncMode === 'cloud') schedulePoll()
  }, pollIntervalMs())
}
function pullRemoteIfNewer() {
  if (Date.now() < suppressRemoteUntil) return
  if (hasPendingLocalSave()) return
  void loadCloudRow().then((row) => {
    if (!row) return
    const localOps = readLocalOps()
    const timestampUnchanged =
      Boolean(row.updated_at && lastCloudUpdatedAt && row.updated_at <= lastCloudUpdatedAt)
    if (timestampUnchanged && localOps) {
      if (opsSyncFingerprint(row.ops) === opsSyncFingerprint(localOps)) return
    }
    applyRemoteRow(row)
  })
}

/** Force a cloud pull (e.g. resident waiting for admin approval). */
export function pullCloudNow() {
  if (syncMode !== 'cloud') return
  if (Date.now() < suppressRemoteUntil) return
  if (hasPendingLocalSave()) return
  void loadCloudRow().then((row) => {
    if (!row) return
    applyRemoteRow(row)
  })
}

function startPolling() {
  if (pollTimer) return
  schedulePoll()

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && syncMode === 'cloud') pullRemoteIfNewer()
    })
    window.addEventListener('focus', () => {
      if (syncMode === 'cloud') pullRemoteIfNewer()
    })
  }
}

function startConfigPolling() {
  if (configPollTimer) return
  configPollTimer = setInterval(() => {
    if (syncMode === 'cloud') {
      if (configPollTimer) clearInterval(configPollTimer)
      configPollTimer = null
      return
    }
    void loadCloudRow().then(async (row) => {
      if (syncMode !== 'cloud') return
      startPolling()
      startRealtimeSync()
      const localAccounts = readLocalAccounts()
      const localOps = readLocalOps() ?? createDefaultOps()
      const merged = mergeBootstrap(row, localAccounts, localOps)
      await pushLocalToCloudIfNeeded(merged, row)
      if (row) applyRemoteRow(row)
    })
  }, 15000)
}

function startRealtimeSync() {
  if (!supabase || realtimeStarted) return
  realtimeStarted = true

  supabase
    .channel('portal_sync_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'portal_sync', filter: `id=eq.${SYNC_ROW_ID}` },
      () => {
        pullRemoteIfNewer()
      },
    )
    .subscribe()
}

export function bootstrapPortalData(): Promise<BootstrapData> {
  if (!bootstrapPromise) {
    bootstrapPromise = doBootstrap()
  }
  return bootstrapPromise
}

export function onCloudAccounts(listener: AccountsListener) {
  accountsListener = listener
  return () => {
    if (accountsListener === listener) accountsListener = null
  }
}

export function onCloudOps(listener: OpsListener) {
  opsListener = listener
  return () => {
    if (opsListener === listener) opsListener = null
  }
}

async function flushCloudSave(explicitOps?: PortalOps): Promise<boolean> {
  const accounts = pendingAccounts ?? readLocalAccounts() ?? []
  const ops = attachProofsToOps(
    explicitOps ?? pendingOps ?? readLocalOps() ?? createDefaultOps(),
    readLocalProofs(),
  )
  pendingAccounts = undefined
  pendingOps = undefined
  return saveCloudRow(accounts, ops)
}

function scheduleCloudSave() {
  if (cloudPushBlocked()) return
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushCloudSave()
  }, 700)
}

export function queueCloudAccounts(accounts: AccountRecord[]) {
  if (cloudPushBlocked()) return
  pendingAccounts = accounts
  touchLocalSyncMeta()
  scheduleCloudSave()
}

export function queueCloudOps(ops: PortalOps) {
  if (cloudPushBlocked()) return
  pendingOps = ops
  touchLocalSyncMeta()
  scheduleCloudSave()
}

export async function flushCloudAccountsNow(accounts: AccountRecord[]): Promise<boolean> {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  pendingAccounts = undefined
  return saveCloudRow(accounts, readLocalOps() ?? createDefaultOps())
}

/** Push pending cloud changes immediately (e.g. after uploading a transfer screenshot). */
export async function flushCloudSaveNow(explicitOps?: PortalOps): Promise<boolean> {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  return flushCloudSave(explicitOps)
}

export async function forceSyncNow(): Promise<SyncStatus> {
  await fetchSyncHealth()
  const localAccounts = readLocalAccounts() ?? []
  const localOps = readLocalOps() ?? createDefaultOps()
  touchLocalSyncMeta()
  await saveCloudRow(localAccounts, localOps)
  const row = await loadCloudRow()
  if (row) applyRemoteRow(row)
  return getSyncStatus()
}

export function writeLocalAccounts(accounts: AccountRecord[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
}

export function writeLocalOps(ops: PortalOps) {
  try {
    persistLocalProofsFromOps(ops)
    const { ops: slimOps } = detachProofsFromOps(ops)
    localStorage.setItem(OPS_KEY, JSON.stringify(slimOps))
  } catch {
    /* quota */
  }
}

export function isCloudSyncConfigured() {
  return isSupabaseConfigured() || syncMode === 'cloud'
}
