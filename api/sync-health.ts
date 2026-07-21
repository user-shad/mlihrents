import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireSyncAuth } from './syncAuth'

function hasBlob() {
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

function hasSupabase() {
  return Boolean(
    (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_ANON_KEY ||
        process.env.VITE_SUPABASE_ANON_KEY),
  )
}

function hasGithub() {
  return Boolean(
    (process.env.GITHUB_SYNC_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN) &&
      (process.env.GITHUB_SYNC_GIST_ID || process.env.GIST_ID),
  )
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (!requireSyncAuth(req, res)) return
  const blob = hasBlob()
  const redis = hasRedis()
  const postgres = hasPostgres()
  const supabase = hasSupabase()
  const github = hasGithub()
  res.status(200).json({
    ok: true,
    backends: { blob, redis, postgres, supabase, github },
    configured: blob || redis || postgres || supabase || github,
  })
}
