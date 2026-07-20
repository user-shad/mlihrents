import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { get, head, list, put } from '@vercel/blob'
import { sql } from '@vercel/postgres'
import { Redis } from '@upstash/redis'

const SYNC_ID = 'main'
const BLOB_PATH = 'portal-sync.json'
const REDIS_KEY = 'portal-sync'
const GIST_FILENAME = 'portal-sync.json'

/**
 * Public Blob base URL for this project.
 * Vercel serverless fetch via head()/OIDC was unreliable; direct public GET works.
 */
function blobPublicBase() {
  if (process.env.BLOB_PUBLIC_BASE_URL) {
    return process.env.BLOB_PUBLIC_BASE_URL.replace(/\/$/, '')
  }
  const raw = process.env.BLOB_STORE_ID
  if (raw) {
    const id = raw.replace(/^store_/i, '').toLowerCase()
    if (id) return `https://${id}.public.blob.vercel-storage.com`
  }
  return ''
}

function publicBlobObjectUrl(pathname: string) {
  return `${blobPublicBase()}/${pathname.replace(/^\//, '')}`
}

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

type StorageKind = 'redis' | 'github' | 'postgres' | 'supabase' | 'blob'

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
  // STORE_ID alone (OIDC) is not enough when the store is suspended — require a RW token
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN)
}

function hasRedis() {
  return Boolean(
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
      (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
  )
}

function hasPostgres() {
  return Boolean(
    process.env.POSTGRES_URL ||
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL_NON_POOLING,
  )
}

function hasGithub() {
  return Boolean(
    (process.env.GITHUB_SYNC_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN) &&
      (process.env.GITHUB_SYNC_GIST_ID || process.env.GIST_ID),
  )
}

function githubAuth() {
  return process.env.GITHUB_SYNC_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''
}

function githubGistId() {
  return process.env.GITHUB_SYNC_GIST_ID || process.env.GIST_ID || ''
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
  return Boolean(getSupabase() || hasBlobStorage() || hasRedis() || hasPostgres() || hasGithub())
}

function configuredBackends(): StorageKind[] {
  // Prefer Redis/GitHub over Blob (Blob store for this project is often suspended)
  const list: StorageKind[] = []
  if (hasRedis()) list.push('redis')
  if (hasGithub()) list.push('github')
  if (hasPostgres()) list.push('postgres')
  if (getSupabase()) list.push('supabase')
  if (hasBlobStorage()) list.push('blob')
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
  const updatedAt = payload.updated_at ?? new Date().toISOString()
  await sql`
    INSERT INTO portal_sync (id, accounts, ops, updated_at)
    VALUES (
      ${SYNC_ID},
      ${payload.accounts as never},
      ${payload.ops as never},
      ${updatedAt}
    )
    ON CONFLICT (id) DO UPDATE SET
      accounts = EXCLUDED.accounts,
      ops = EXCLUDED.ops,
      updated_at = EXCLUDED.updated_at
  `
}

let lastBlobDebug: string | null = null

async function fetchJsonPayload(url: string, label: string): Promise<SyncPayload | null> {
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    lastBlobDebug = `${label}:${res.status}:${url}`
    if (!res.ok) return null
    const text = await res.text()
    if (!text) return null
    return JSON.parse(text) as SyncPayload
  } catch (err) {
    lastBlobDebug = `${label}_err:${err instanceof Error ? err.message : String(err)}:${url}`
    return null
  }
}

async function loadFromBlob(): Promise<SyncPayload | null> {
  const publicUrl = publicBlobObjectUrl(BLOB_PATH)
  const fromPublic = await fetchJsonPayload(publicUrl, 'public')
  if (fromPublic) return fromPublic

  try {
    const meta = await head(BLOB_PATH)
    const fromHead = await fetchJsonPayload(meta.url, 'head')
    if (fromHead) return fromHead
  } catch (err) {
    lastBlobDebug = `head_err:${err instanceof Error ? err.message : String(err)}`
  }

  for (const access of ['public', 'private'] as const) {
    try {
      const result = await get(BLOB_PATH, { access, useCache: false })
      if (result?.stream) {
        const text = await new Response(result.stream).text()
        if (text) {
          lastBlobDebug = `get_${access}:ok`
          return JSON.parse(text) as SyncPayload
        }
      }
      lastBlobDebug = `get_${access}:${result?.statusCode ?? 'empty'}`
    } catch (err) {
      lastBlobDebug = `get_${access}_err:${err instanceof Error ? err.message : String(err)}`
    }
  }

  try {
    const { blobs } = await list({ limit: 100 })
    const match =
      blobs.find((b) => b.pathname === BLOB_PATH) ??
      blobs.find((b) => b.pathname.endsWith('portal-sync.json')) ??
      blobs.find((b) => b.pathname.includes('portal-sync'))
    if (match) {
      const fromList = await fetchJsonPayload(match.url, 'list')
      if (fromList) return fromList
    } else {
      lastBlobDebug = `list:0`
    }
  } catch (err) {
    lastBlobDebug = `list_err:${err instanceof Error ? err.message : String(err)}`
  }

  return null
}

async function saveToBlob(payload: SyncPayload) {
  const body = JSON.stringify(payload)
  const errors: string[] = []
  for (const access of ['public', 'private'] as const) {
    try {
      const blob = await put(BLOB_PATH, body, {
        access,
        allowOverwrite: true,
        contentType: 'application/json',
        addRandomSuffix: false,
      })
      lastBlobDebug = `saved:${access}:${blob.url}`
      // Verify readable via public URL
      const check = await fetchJsonPayload(publicBlobObjectUrl(BLOB_PATH), 'verify')
      if (!check) {
        // also try the returned URL
        await fetchJsonPayload(blob.url, 'verify_put_url')
      }
      return
    } catch (err) {
      errors.push(`${access}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  throw new Error(`blob_save_failed (${errors.join('; ')})`)
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

async function loadFromGithub(): Promise<SyncPayload | null> {
  if (!hasGithub()) return null
  const res = await fetch(`https://api.github.com/gists/${githubGistId()}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${githubAuth()}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`github_load_${res.status}`)
  const gist = (await res.json()) as {
    files?: Record<string, { content?: string; truncated?: boolean; raw_url?: string }>
  }
  const file = gist.files?.[GIST_FILENAME] ?? Object.values(gist.files ?? {})[0]
  if (!file) return null
  let text = file.content ?? ''
  if ((!text || file.truncated) && file.raw_url) {
    const raw = await fetch(file.raw_url, {
      headers: { Authorization: `Bearer ${githubAuth()}` },
      cache: 'no-store',
    })
    if (!raw.ok) throw new Error(`github_raw_${raw.status}`)
    text = await raw.text()
  }
  if (!text) return null
  return JSON.parse(text) as SyncPayload
}

async function saveToGithub(payload: SyncPayload) {
  if (!hasGithub()) throw new Error('github_unavailable')
  const res = await fetch(`https://api.github.com/gists/${githubGistId()}`, {
    method: 'PATCH',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${githubAuth()}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      files: {
        [GIST_FILENAME]: { content: JSON.stringify(payload) },
      },
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`github_save_${res.status}${detail ? `:${detail.slice(0, 120)}` : ''}`)
  }
}

async function loadFrom(kind: StorageKind): Promise<SyncPayload | null> {
  switch (kind) {
    case 'redis':
      return loadFromRedis()
    case 'github':
      return loadFromGithub()
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
    case 'github':
      await saveToGithub(payload)
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
      if (!best || time >= bestTime) {
        best = payload
        bestStorage = kind
        bestTime = time
      }
    } catch {
      /* try next */
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
      hint: 'Set GITHUB_SYNC_GIST_ID + GITHUB_SYNC_TOKEN on Vercel, or connect Redis/Blob → Redeploy',
    })
    return
  }

  if (req.method === 'GET') {
    const { payload, storage } = await loadBest()
    const blobBase = blobPublicBase()
    res.status(200).json({
      configured: true,
      storage,
      accounts: payload?.accounts ?? [],
      ops: payload?.ops ?? {},
      updated_at: payload?.updated_at ?? null,
      blob_url: blobBase ? publicBlobObjectUrl(BLOB_PATH) : null,
      blob_debug: lastBlobDebug,
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
      res.status(200).json({
        configured: true,
        storage,
        ok: true,
        updated_at: payload.updated_at,
        blob_debug: lastBlobDebug,
      })
      return
    } catch (err) {
      const message = err instanceof Error ? err.message : 'save_failed'
      res.status(500).json({
        configured: true,
        ok: false,
        error: message,
        blob_debug: lastBlobDebug,
      })
      return
    }
  }

  res.status(405).json({ error: 'method_not_allowed' })
}
