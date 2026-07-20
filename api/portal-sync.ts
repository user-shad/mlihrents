import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { get, put } from '@vercel/blob'
import { sql } from '@vercel/postgres'
import { Redis } from '@upstash/redis'

const SYNC_ID = 'main'
const BLOB_PATH = 'mlaihrent/portal-sync.json'
const REDIS_KEY = 'portal-sync'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
}

type SyncPayload = {
  accounts: unknown
  ops: unknown
  updated_at?: string
}

type StorageKind = 'redis' | 'postgres' | 'blob' | 'supabase'

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

function hasBlobStorage() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN)
}

function hasRedis() {
  return Boolean(
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
      (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
  )
}

function hasPostgres() {
  return Boolean(process.env.POSTGRES_URL)
}

function getRedis() {
  if (!hasRedis()) return null
  try {
    return Redis.fromEnv()
  } catch {
    return null
  }
}

function isConfigured() {
  return Boolean(getSupabase() || hasBlobStorage() || hasRedis() || hasPostgres())
}

function configuredBackends(): StorageKind[] {
  const list: StorageKind[] = []
  if (hasRedis()) list.push('redis')
  if (hasPostgres()) list.push('postgres')
  if (hasBlobStorage()) list.push('blob')
  if (getSupabase()) list.push('supabase')
  return list
}

let postgresReady = false

async function ensurePostgresTable() {
  if (postgresReady || !hasPostgres()) return
  await sql`
    CREATE TABLE IF NOT EXISTS portal_sync (
      id TEXT PRIMARY KEY,
      accounts JSONB NOT NULL DEFAULT '[]'::jsonb,
      ops JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  postgresReady = true
}

async function loadFromRedis(): Promise<SyncPayload | null> {
  const redis = getRedis()
  if (!redis) return null
  return (await redis.get<SyncPayload>(REDIS_KEY)) ?? null
}

async function saveToRedis(payload: SyncPayload) {
  const redis = getRedis()
  if (!redis) throw new Error('redis_unavailable')
  await redis.set(REDIS_KEY, payload)
}

async function loadFromPostgres(): Promise<SyncPayload | null> {
  if (!hasPostgres()) return null
  await ensurePostgresTable()
  const result = await sql`
    SELECT accounts, ops, updated_at
    FROM portal_sync
    WHERE id = ${SYNC_ID}
    LIMIT 1
  `
  const row = result.rows[0]
  if (!row) return null
  return {
    accounts: row.accounts,
    ops: row.ops,
    updated_at: row.updated_at ? new Date(row.updated_at as string).toISOString() : undefined,
  }
}

async function saveToPostgres(payload: SyncPayload) {
  if (!hasPostgres()) throw new Error('postgres_unavailable')
  await ensurePostgresTable()
  await sql`
    INSERT INTO portal_sync (id, accounts, ops, updated_at)
    VALUES (
      ${SYNC_ID},
      ${JSON.stringify(payload.accounts)}::jsonb,
      ${JSON.stringify(payload.ops)}::jsonb,
      ${payload.updated_at ?? new Date().toISOString()}
    )
    ON CONFLICT (id) DO UPDATE SET
      accounts = EXCLUDED.accounts,
      ops = EXCLUDED.ops,
      updated_at = EXCLUDED.updated_at
  `
}

async function loadFromBlob(): Promise<SyncPayload | null> {
  try {
    const result = await get(BLOB_PATH, { access: 'private', useCache: false })
    if (!result || result.statusCode === 404 || !result.stream) return null
    const text = await new Response(result.stream).text()
    return JSON.parse(text) as SyncPayload
  } catch {
    return null
  }
}

async function saveToBlob(payload: SyncPayload) {
  await put(BLOB_PATH, JSON.stringify(payload), {
    access: 'private',
    allowOverwrite: true,
    contentType: 'application/json',
  })
}

async function loadFromSupabase(): Promise<SyncPayload | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('portal_sync')
    .select('accounts, ops, updated_at')
    .eq('id', SYNC_ID)
    .maybeSingle()
  if (error || !data) return null
  return {
    accounts: data.accounts,
    ops: data.ops,
    updated_at: data.updated_at ?? undefined,
  }
}

async function saveToSupabase(payload: SyncPayload) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('supabase_unavailable')
  const { error } = await supabase.from('portal_sync').upsert({
    id: SYNC_ID,
    accounts: payload.accounts,
    ops: payload.ops,
    updated_at: payload.updated_at,
  })
  if (error) throw error
}

async function loadFrom(kind: StorageKind): Promise<SyncPayload | null> {
  switch (kind) {
    case 'redis':
      return loadFromRedis()
    case 'postgres':
      return loadFromPostgres()
    case 'blob':
      return loadFromBlob()
    case 'supabase':
      return loadFromSupabase()
  }
}

async function saveTo(kind: StorageKind, payload: SyncPayload) {
  switch (kind) {
    case 'redis':
      await saveToRedis(payload)
      return
    case 'postgres':
      await saveToPostgres(payload)
      return
    case 'blob':
      await saveToBlob(payload)
      return
    case 'supabase':
      await saveToSupabase(payload)
      return
  }
}

function payloadHasData(payload: SyncPayload | null) {
  if (!payload) return false
  const accounts = payload.accounts
  const ops = payload.ops
  const hasAccounts = Array.isArray(accounts) && accounts.length > 0
  const hasOps =
    ops &&
    typeof ops === 'object' &&
    (Object.keys(ops as object).length > 0 ||
      (Array.isArray((ops as { residentList?: unknown[] }).residentList) &&
        (ops as { residentList: unknown[] }).residentList.length > 0))
  return hasAccounts || hasOps
}

async function loadBest(): Promise<{ payload: SyncPayload | null; storage: StorageKind | null }> {
  const backends = configuredBackends()
  let best: SyncPayload | null = null
  let bestStorage: StorageKind | null = null
  let bestTime = 0

  for (const kind of backends) {
    try {
      const payload = await loadFrom(kind)
      if (!payload) continue
      const time = payload.updated_at ? Date.parse(payload.updated_at) : 0
      if (!best || time >= bestTime || (time === bestTime && payloadHasData(payload))) {
        best = payload
        bestStorage = kind
        bestTime = time
      }
    } catch {
      /* try next backend */
    }
  }

  return { payload: best, storage: bestStorage }
}

async function saveBest(payload: SyncPayload): Promise<StorageKind> {
  const backends = configuredBackends()
  let lastError: unknown = null
  for (const kind of backends) {
    try {
      await saveTo(kind, payload)
      return kind
    } catch (err) {
      lastError = err
    }
  }
  throw lastError ?? new Error('no_storage_backend')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')

  if (!isConfigured()) {
    res.status(503).json({
      configured: false,
      hint: 'Open Vercel → Storage → create Blob or Redis → Connect → Redeploy',
    })
    return
  }

  if (req.method === 'GET') {
    const { payload, storage } = await loadBest()
    res.status(200).json({
      configured: true,
      storage,
      accounts: payload?.accounts ?? [],
      ops: payload?.ops ?? {},
      updated_at: payload?.updated_at ?? null,
    })
    return
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    const body = (req.body ?? {}) as SyncPayload
    const payload: SyncPayload = {
      accounts: body.accounts ?? [],
      ops: body.ops ?? {},
      updated_at: new Date().toISOString(),
    }

    try {
      const storage = await saveBest(payload)
      res.status(200).json({ configured: true, storage, ok: true, updated_at: payload.updated_at })
      return
    } catch (err) {
      const message = err instanceof Error ? err.message : 'save_failed'
      res.status(500).json({ configured: true, ok: false, error: message })
      return
    }
  }

  res.status(405).json({ error: 'method_not_allowed' })
}
