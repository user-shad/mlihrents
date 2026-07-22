import { mergeSyncPayload } from './syncMerge.js'
import type { SyncPayload } from './syncProofStore.js'

function syncApiToken() {
  return process.env.SYNC_API_TOKEN?.trim() ?? ''
}

function portalSyncUrl() {
  const explicit = process.env.PORTAL_SYNC_URL?.trim()
  if (explicit) return explicit
  const vercel = process.env.VERCEL_URL?.trim()
  if (vercel) return `https://${vercel}/api/portal-sync`
  return 'https://www.mlihrent.com/api/portal-sync'
}

function headers() {
  const token = syncApiToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function loadPortalSync(): Promise<SyncPayload | null> {
  const res = await fetch(portalSyncUrl(), { cache: 'no-store', headers: headers() })
  if (!res.ok) return null
  const data = (await res.json()) as SyncPayload & { ops?: unknown }
  return {
    accounts: data.accounts ?? [],
    ops: data.ops ?? {},
    updated_at: data.updated_at ?? undefined,
  }
}

export async function savePortalSync(payload: SyncPayload): Promise<boolean> {
  const existing = await loadPortalSync()
  const merged = mergeSyncPayload(existing, payload)
  const res = await fetch(portalSyncUrl(), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers() },
    body: JSON.stringify(merged),
  })
  return res.ok
}
