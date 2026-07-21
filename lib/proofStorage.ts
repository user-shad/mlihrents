import { Redis } from '@upstash/redis'
import { sql } from '@vercel/postgres'
import type { ProofStore } from './syncProofStore.js'

export type PaymentProof = { name: string; dataUrl: string }

const REDIS_PROOFS_KEY = 'portal-sync-proofs'
const PROOFS_GIST_FILENAME = 'portal-sync-proofs.json'

function hasRedis() {
  return Boolean(
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
      (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
  )
}

function hasGithub() {
  return Boolean(
    (process.env.GITHUB_SYNC_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN) &&
      (process.env.GITHUB_SYNC_GIST_ID || process.env.GIST_ID),
  )
}

function hasPostgres() {
  return Boolean(
    process.env.POSTGRES_URL ||
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL_NON_POOLING,
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

let postgresReady = false

async function ensurePostgresTable() {
  if (postgresReady || !hasPostgres()) return
  await sql`
    CREATE TABLE IF NOT EXISTS portal_proofs (
      payment_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      data_url TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  postgresReady = true
}

async function readGistFileText(
  file: { content?: string; truncated?: boolean; raw_url?: string } | undefined,
  auth: string,
): Promise<string> {
  if (!file) return ''
  let text = file.content ?? ''
  if ((!text || file.truncated) && file.raw_url) {
    const raw = await fetch(file.raw_url, {
      headers: { Authorization: `Bearer ${auth}` },
      cache: 'no-store',
    })
    if (!raw.ok) throw new Error(`github_raw_${raw.status}`)
    text = await raw.text()
  }
  return text
}

async function loadFromGithub(): Promise<ProofStore> {
  if (!hasGithub()) return {}
  const auth = githubAuth()
  const res = await fetch(`https://api.github.com/gists/${githubGistId()}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${auth}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    cache: 'no-store',
  })
  if (!res.ok) return {}
  const gist = (await res.json()) as {
    files?: Record<string, { content?: string; truncated?: boolean; raw_url?: string }>
  }
  const proofsText = await readGistFileText(gist.files?.[PROOFS_GIST_FILENAME], auth)
  if (!proofsText) return {}
  try {
    return JSON.parse(proofsText) as ProofStore
  } catch {
    return {}
  }
}

async function saveToGithub(proofs: ProofStore) {
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
        [PROOFS_GIST_FILENAME]: { content: JSON.stringify(proofs) },
      },
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`github_save_${res.status}${detail ? `:${detail.slice(0, 120)}` : ''}`)
  }
}

async function loadFromRedis(): Promise<ProofStore> {
  const redis = getRedis()
  if (!redis) return {}
  return (await redis.get<ProofStore>(REDIS_PROOFS_KEY)) ?? {}
}

async function saveToRedis(proofs: ProofStore) {
  const redis = getRedis()
  if (!redis) throw new Error('redis_unavailable')
  await redis.set(REDIS_PROOFS_KEY, proofs)
}

async function loadFromPostgres(): Promise<ProofStore> {
  if (!hasPostgres()) return {}
  await ensurePostgresTable()
  const result = await sql`
    SELECT payment_id, name, data_url
    FROM portal_proofs
  `
  const proofs: ProofStore = {}
  for (const row of result.rows) {
    proofs[row.payment_id as string] = {
      name: row.name as string,
      dataUrl: row.data_url as string,
    }
  }
  return proofs
}

async function saveToPostgres(proofs: ProofStore) {
  await ensurePostgresTable()
  const result = await sql`SELECT payment_id FROM portal_proofs`
  for (const row of result.rows) {
    const paymentId = row.payment_id as string
    if (!proofs[paymentId]) {
      await sql`DELETE FROM portal_proofs WHERE payment_id = ${paymentId}`
    }
  }
  for (const [paymentId, proof] of Object.entries(proofs)) {
    await sql`
      INSERT INTO portal_proofs (payment_id, name, data_url)
      VALUES (${paymentId}, ${proof.name}, ${proof.dataUrl})
      ON CONFLICT (payment_id) DO UPDATE SET
        name = EXCLUDED.name,
        data_url = EXCLUDED.data_url,
        updated_at = NOW()
    `
  }
}

export async function loadAllProofs(): Promise<ProofStore> {
  if (hasRedis()) {
    const proofs = await loadFromRedis()
    if (Object.keys(proofs).length > 0) return proofs
  }
  if (hasGithub()) {
    const proofs = await loadFromGithub()
    if (Object.keys(proofs).length > 0) return proofs
  }
  if (hasPostgres()) return loadFromPostgres()
  return {}
}

async function saveAllProofs(proofs: ProofStore) {
  let lastError: unknown = null
  if (hasRedis()) {
    try {
      await saveToRedis(proofs)
      return
    } catch (err) {
      lastError = err
    }
  }
  if (hasGithub()) {
    try {
      await saveToGithub(proofs)
      return
    } catch (err) {
      lastError = err
    }
  }
  if (hasPostgres()) {
    try {
      await saveToPostgres(proofs)
      return
    } catch (err) {
      lastError = err
    }
  }
  throw lastError ?? new Error('no_proof_storage')
}

export async function getPaymentProof(paymentId: string): Promise<PaymentProof | null> {
  const key = paymentId.trim()
  if (!key) return null
  const proofs = await loadAllProofs()
  const proof = proofs[key]
  return proof?.dataUrl ? proof : null
}

export async function upsertPaymentProof(paymentId: string, proof: PaymentProof): Promise<void> {
  const key = paymentId.trim()
  if (!key || !proof.dataUrl) throw new Error('invalid_proof')
  const existing = await loadAllProofs()
  await saveAllProofs({
    ...existing,
    [key]: { name: proof.name || 'proof.jpg', dataUrl: proof.dataUrl },
  })
}

export function isProofStorageConfigured() {
  return hasRedis() || hasGithub() || hasPostgres()
}
