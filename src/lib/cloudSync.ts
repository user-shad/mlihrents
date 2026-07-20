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
let suppressRemoteUntil = 0
let accountsListener: AccountsListener | null = null
let opsListener: OpsListener | null = null
let realtimeStarted = false

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

async function loadCloudRow(): Promise<{ accounts: AccountRecord[]; ops: PortalOps } | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('portal_sync')
    .select('accounts, ops')
    .eq('id', SYNC_ROW_ID)
    .maybeSingle()
  if (error || !data) return null
  return {
    accounts: (data.accounts as AccountRecord[]) ?? [],
    ops: (data.ops as PortalOps) ?? createDefaultOps(),
  }
}

async function saveCloudRow(accounts: AccountRecord[], ops: PortalOps) {
  if (!supabase) return
  suppressRemoteUntil = Date.now() + 2500
  await supabase.from('portal_sync').upsert({
    id: SYNC_ROW_ID,
    accounts,
    ops,
    updated_at: new Date().toISOString(),
  })
}

async function doBootstrap(): Promise<BootstrapData> {
  const localAccounts = readLocalAccounts()
  const localOps = readLocalOps() ?? createDefaultOps()

  if (!isSupabaseConfigured()) {
    return {
      accounts: localAccounts ?? [],
      ops: localOps,
    }
  }

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

  if (!cloudHasAccounts && !cloudHasOps && (localHasAccounts || localHasOps)) {
    await saveCloudRow(accounts, ops)
  } else if (cloud && (!cloudHasAccounts || !cloudHasOps) && (localHasAccounts || localHasOps)) {
    await saveCloudRow(
      cloudHasAccounts ? cloud.accounts : accounts,
      cloudHasOps ? cloud.ops : ops,
    )
  }

  startRealtimeSync()

  return { accounts, ops }
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
          if (!row) return
          accountsListener?.(row.accounts)
          opsListener?.(row.ops)
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
  if (!supabase) return
  const current = await loadCloudRow()
  const accounts = pendingAccounts ?? current?.accounts ?? []
  const ops = pendingOps ?? current?.ops ?? createDefaultOps()
  pendingAccounts = undefined
  pendingOps = undefined
  await saveCloudRow(accounts, ops)
}

function scheduleCloudSave() {
  if (!isSupabaseConfigured()) return
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
