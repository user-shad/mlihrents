import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { get, put } from '@vercel/blob'

const SYNC_ID = 'main'
const BLOB_PATH = 'mlaihrent/portal-sync.json'

type SyncPayload = {
  accounts: unknown
  ops: unknown
  updated_at?: string
}

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

function isConfigured() {
  return Boolean(getSupabase() || hasBlobStorage())
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')

  if (!isConfigured()) {
    res.status(503).json({ configured: false })
    return
  }

  if (req.method === 'GET') {
    const supabase = getSupabase()
    if (supabase) {
      const { data, error } = await supabase
        .from('portal_sync')
        .select('accounts, ops, updated_at')
        .eq('id', SYNC_ID)
        .maybeSingle()

      if (!error) {
        res.status(200).json({
          configured: true,
          storage: 'supabase',
          accounts: data?.accounts ?? [],
          ops: data?.ops ?? {},
          updated_at: data?.updated_at ?? null,
        })
        return
      }
    }

    if (hasBlobStorage()) {
      const blob = await loadFromBlob()
      res.status(200).json({
        configured: true,
        storage: 'blob',
        accounts: blob?.accounts ?? [],
        ops: blob?.ops ?? {},
        updated_at: blob?.updated_at ?? null,
      })
      return
    }

    res.status(503).json({ configured: false })
    return
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    const body = (req.body ?? {}) as SyncPayload
    const payload: SyncPayload = {
      accounts: body.accounts ?? [],
      ops: body.ops ?? {},
      updated_at: new Date().toISOString(),
    }

    const supabase = getSupabase()
    if (supabase) {
      const { error } = await supabase.from('portal_sync').upsert({
        id: SYNC_ID,
        accounts: payload.accounts,
        ops: payload.ops,
        updated_at: payload.updated_at,
      })
      if (!error) {
        res.status(200).json({ configured: true, storage: 'supabase', ok: true })
        return
      }
    }

    if (hasBlobStorage()) {
      await saveToBlob(payload)
      res.status(200).json({ configured: true, storage: 'blob', ok: true })
      return
    }

    res.status(503).json({ configured: false })
    return
  }

  res.status(405).json({ error: 'method_not_allowed' })
}
