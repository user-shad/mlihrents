import type { AccountRecord } from '../context/AuthContext'
import { prepareStoredAccounts } from './accountBootstrap'
import type { BankAccountSettings } from '../config/paymentSettings'
import type {
  AvailableApartment,
  Invoice,
  PaymentRecord,
  Resident,
  Ticket,
} from '../data'
import {
  availableApartments,
  defaultServiceDirectory,
  invoicesByResident,
  residents,
  seedPayments,
  ticketsByResident,
  type ServiceContact,
} from '../data'
import { defaultBankSettings } from '../config/paymentSettings'
import { isSupabaseConfigured, supabase } from './supabase'

export const ACCOUNTS_KEY = 'mlihrents_accounts_v3'
export const OPS_KEY = 'mlihrents_ops_v5'
const LEGACY_OPS_KEYS = ['mlihrents_ops_v4']
const SYNC_ROW_ID = 'main'
const LOCAL_SYNC_META_KEY = 'mlihrents_sync_meta'

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
  bankSettings: BankAccountSettings
  serviceDirectory: ServiceContact[]
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
let pollTimer: ReturnType<typeof setInterval> | null = null
let configPollTimer: ReturnType<typeof setInterval> | null = null
let suppressRemoteUntil = 0
let suppressCloudPush = 0
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

function touchLocalSyncMeta() {
  localStorage.setItem(
    LOCAL_SYNC_META_KEY,
    JSON.stringify({ updatedAt: new Date().toISOString() }),
  )
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
    return parsed && typeof parsed === 'object' ? parsed : null
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

function normalizeCloudOps(raw: unknown): PortalOps {
  if (!raw || typeof raw !== 'object') return createDefaultOps()
  const ops = raw as PortalOps
  return {
    residentList: ops.residentList ?? residents,
    listings: ops.listings ?? availableApartments,
    payments: ops.payments ?? seedPayments,
    invoiceMap: ops.invoiceMap ?? invoicesByResident,
    ticketMap: ops.ticketMap ?? ticketsByResident,
    invoiceExtensions: ops.invoiceExtensions ?? {},
    paidIds: ops.paidIds ?? [],
    bankSettings: ops.bankSettings ?? defaultBankSettings,
    serviceDirectory:
      Array.isArray(ops.serviceDirectory) && ops.serviceDirectory.length > 0
        ? ops.serviceDirectory
        : defaultServiceDirectory,
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
    lastSyncError = data.error ?? data.hint ?? `Save failed (${res.status})`
    return false
  } catch {
    lastSyncError = 'Could not save to cloud'
    return false
  }
}

async function saveCloudRow(accounts: AccountRecord[], ops: PortalOps) {
  suppressRemoteUntil = Date.now() + 3000

  // Never wipe real cloud data with an empty/default payload
  const existing = await loadCloudRowViaApi()
  if (
    existing &&
    (hasOpsData(existing.ops) || hasAccountsData(existing.accounts)) &&
    !hasOpsData(ops) &&
    !hasAccountsData(accounts)
  ) {
    lastSyncError = 'Skipped empty upload to protect cloud data'
    return
  }

  if (await saveCloudRowViaApi(accounts, ops)) return

  if (!supabase) return
  const preparedAccounts = prepareStoredAccounts(accounts)
  const slimOps = slimOpsForCloud(ops)
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

  let accounts = cloud?.accounts ?? []
  let ops = cloud?.ops ?? createDefaultOps()

  if (preferCloud) {
    accounts = cloud!.accounts
    ops = cloud!.ops
  } else {
    if (localHasAccounts && localAccounts) accounts = localAccounts
    if (localHasOps) ops = localOps
  }

  return { accounts: prepareStoredAccounts(accounts), ops }
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
  const merged = mergeBootstrap(cloud, localAccounts, localOps)

  if (syncMode === 'cloud') {
    await pushLocalToCloudIfNeeded(merged, cloud)
    startPolling()
    startRealtimeSync()
  } else {
    startConfigPolling()
  }

  return merged
}

function mergePaymentLists(
  remote: PortalOps['payments'],
  local: PortalOps['payments'] | undefined,
): PortalOps['payments'] {
  const map = new Map<string, PortalOps['payments'][number]>()
  for (const p of remote) map.set(p.id, p)
  for (const p of local ?? []) {
    const existing = map.get(p.id)
    if (!existing) {
      // Don't resurrect payments the other side soft-deleted; only keep in-flight pending
      if (p.status === 'pending_review') map.set(p.id, p)
      continue
    }
    if (existing.status === 'deleted' || p.status === 'deleted') {
      map.set(p.id, existing.status === 'deleted' ? existing : p)
      continue
    }
    const preferLocal =
      (p.transferProof?.dataUrl && !existing.transferProof?.dataUrl) ||
      (p.status === 'pending_review' && existing.status !== 'pending_review')
    if (preferLocal) map.set(p.id, p)
  }
  return [...map.values()].sort((a, b) => b.id.localeCompare(a.id))
}

function mergeOpsPreferringLocalProofs(remote: PortalOps, local: PortalOps | null): PortalOps {
  if (!local) return remote
  return {
    ...remote,
    payments: mergePaymentLists(remote.payments, local.payments),
  }
}

function applyRemoteRow(row: CloudRow) {
  const localOps = readLocalOps()
  const localAccounts = readLocalAccounts()
  const remoteEmpty = !hasOpsData(row.ops) && !hasAccountsData(row.accounts)
  const localHas =
    (localOps ? hasOpsData(localOps) : false) ||
    (localAccounts ? hasAccountsData(localAccounts) : false)
  if (remoteEmpty && localHas) return

  const mergedOps = mergeOpsPreferringLocalProofs(row.ops, localOps)

  suppressCloudPush++
  try {
    accountsListener?.(row.accounts)
    opsListener?.(mergedOps)
    lastCloudUpdatedAt = row.updated_at
  } finally {
    suppressCloudPush--
  }
}

function pullRemoteIfNewer() {
  if (Date.now() < suppressRemoteUntil) return
  void loadCloudRow().then((row) => {
    if (!row) return
    const remoteTime = cloudTimestamp(row)
    const localTime = localTimestamp()
    // Only apply when cloud is actually newer — never overwrite local with older remote
    if (remoteTime >= localTime) {
      applyRemoteRow(row)
    }
  })
}

function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return
    pullRemoteIfNewer()
  }, 4000)

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
        if (Date.now() < suppressRemoteUntil) return
        void loadCloudRow().then((row) => {
          if (row) applyRemoteRow(row)
        })
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

async function flushCloudSave() {
  const accounts = pendingAccounts ?? readLocalAccounts() ?? []
  const ops = pendingOps ?? readLocalOps() ?? createDefaultOps()
  pendingAccounts = undefined
  pendingOps = undefined
  await saveCloudRow(accounts, ops)
}

function scheduleCloudSave() {
  if (suppressCloudPush > 0) return
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushCloudSave()
  }, 700)
}

export function queueCloudAccounts(accounts: AccountRecord[]) {
  if (suppressCloudPush > 0) return
  pendingAccounts = accounts
  touchLocalSyncMeta()
  scheduleCloudSave()
}

export function queueCloudOps(ops: PortalOps) {
  if (suppressCloudPush > 0) return
  pendingOps = ops
  touchLocalSyncMeta()
  scheduleCloudSave()
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
    localStorage.setItem(OPS_KEY, JSON.stringify(ops))
  } catch {
    /* quota */
  }
}

export function isCloudSyncConfigured() {
  return isSupabaseConfigured() || syncMode === 'cloud'
}
