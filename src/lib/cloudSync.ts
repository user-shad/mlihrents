import type { AccountRecord } from '../context/AuthContext'
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
  invoicesByResident,
  residents,
  seedPayments,
  ticketsByResident,
} from '../data'
import { defaultBankSettings } from '../config/paymentSettings'
import { isSupabaseConfigured, supabase } from './supabase'

export const ACCOUNTS_KEY = 'mlihrents_accounts_v3'
export const OPS_KEY = 'mlihrents_ops_v5'
const LEGACY_OPS_KEYS = ['mlihrents_ops_v4']
const SYNC_ROW_ID = 'main'

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
}

export interface BootstrapData {
  accounts: AccountRecord[]
  ops: PortalOps
}

type AccountsListener = (accounts: AccountRecord[]) => void
type OpsListener = (ops: PortalOps) => void

let bootstrapPromise: Promise<BootstrapData> | null = null
let pendingAccounts: AccountRecord[] | undefined
let pendingOps: PortalOps | undefined
let flushTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let suppressRemoteUntil = 0
let accountsListener: AccountsListener | null = null
let opsListener: OpsListener | null = null
let realtimeStarted = false
let syncMode: SyncMode = 'local'

export function getSyncMode() {
  return syncMode
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
  }
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
    ops.listings.length > 0 ||
    Object.keys(ops.invoiceMap).length > 0
  )
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
  }
}

async function loadCloudRowViaApi(): Promise<{ accounts: AccountRecord[]; ops: PortalOps } | null> {
  try {
    const res = await fetch('/api/portal-sync', { cache: 'no-store' })
    if (res.status === 503) return null
    if (!res.ok) return null
    const data = (await res.json()) as {
      configured?: boolean
      accounts?: AccountRecord[]
      ops?: unknown
    }
    if (!data.configured) return null
    syncMode = 'cloud'
    return {
      accounts: data.accounts ?? [],
      ops: normalizeCloudOps(data.ops),
    }
  } catch {
    return null
  }
}

async function loadCloudRowDirect(): Promise<{ accounts: AccountRecord[]; ops: PortalOps } | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('portal_sync')
    .select('accounts, ops')
    .eq('id', SYNC_ROW_ID)
    .maybeSingle()
  if (error || !data) return null
  syncMode = 'cloud'
  return {
    accounts: (data.accounts as AccountRecord[]) ?? [],
    ops: normalizeCloudOps(data.ops),
  }
}

async function loadCloudRow(): Promise<{ accounts: AccountRecord[]; ops: PortalOps } | null> {
  const viaApi = await loadCloudRowViaApi()
  if (viaApi) return viaApi
  return loadCloudRowDirect()
}

async function saveCloudRowViaApi(accounts: AccountRecord[], ops: PortalOps) {
  const res = await fetch('/api/portal-sync', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accounts, ops }),
  })
  if (res.ok) {
    syncMode = 'cloud'
    return true
  }
  return false
}

async function saveCloudRow(accounts: AccountRecord[], ops: PortalOps) {
  suppressRemoteUntil = Date.now() + 2500

  if (await saveCloudRowViaApi(accounts, ops)) return

  if (!supabase) return
  await supabase.from('portal_sync').upsert({
    id: SYNC_ROW_ID,
    accounts,
    ops,
    updated_at: new Date().toISOString(),
  })
  syncMode = 'cloud'
}

async function doBootstrap(): Promise<BootstrapData> {
  const localAccounts = readLocalAccounts()
  const localOps = readLocalOps() ?? createDefaultOps()

  const cloud = await loadCloudRow()
  const cloudHasAccounts = cloud ? hasAccountsData(cloud.accounts) : false
  const cloudHasOps = cloud ? hasOpsData(cloud.ops) : false
  const localHasAccounts = localAccounts ? hasAccountsData(localAccounts) : false
  const localHasOps = hasOpsData(localOps)

  let accounts = cloud?.accounts ?? []
  let ops = cloud?.ops ?? createDefaultOps()

  if (!cloudHasAccounts && localHasAccounts && localAccounts) {
    accounts = localAccounts
  }
  if (!cloudHasOps && localHasOps) {
    ops = localOps
  }

  if (syncMode === 'cloud') {
    if (!cloudHasAccounts && !cloudHasOps && (localHasAccounts || localHasOps)) {
      await saveCloudRow(accounts, ops)
    } else if (cloud && (!cloudHasAccounts || !cloudHasOps) && (localHasAccounts || localHasOps)) {
      await saveCloudRow(
        cloudHasAccounts ? cloud.accounts : accounts,
        cloudHasOps ? cloud.ops : ops,
      )
    }
    startPolling()
    startRealtimeSync()
  }

  return { accounts, ops }
}

function applyRemoteRow(row: { accounts: AccountRecord[]; ops: PortalOps }) {
  accountsListener?.(row.accounts)
  opsListener?.(row.ops)
}

function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return
    if (Date.now() < suppressRemoteUntil) return
    void loadCloudRow().then((row) => {
      if (row) applyRemoteRow(row)
    })
  }, 12000)
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
  const current = await loadCloudRow()
  const accounts = pendingAccounts ?? current?.accounts ?? []
  const ops = pendingOps ?? current?.ops ?? createDefaultOps()
  pendingAccounts = undefined
  pendingOps = undefined
  await saveCloudRow(accounts, ops)
}

function scheduleCloudSave() {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushCloudSave()
  }, 900)
}

export function queueCloudAccounts(accounts: AccountRecord[]) {
  pendingAccounts = accounts
  scheduleCloudSave()
}

export function queueCloudOps(ops: PortalOps) {
  pendingOps = ops
  scheduleCloudSave()
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
