import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    ok: true,
    backends: {
      blob: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      redis: Boolean(
        (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
          (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
      ),
      postgres: Boolean(
        process.env.POSTGRES_URL ||
          process.env.DATABASE_URL ||
          process.env.POSTGRES_URL_NON_POOLING,
      ),
      supabase: Boolean(
        (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) &&
          (process.env.SUPABASE_SERVICE_ROLE_KEY ||
            process.env.SUPABASE_ANON_KEY ||
            process.env.VITE_SUPABASE_ANON_KEY),
      ),
    },
    configured: Boolean(
      process.env.BLOB_READ_WRITE_TOKEN ||
        (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
        (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) ||
        process.env.POSTGRES_URL ||
        ((process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) &&
          (process.env.SUPABASE_SERVICE_ROLE_KEY ||
            process.env.SUPABASE_ANON_KEY ||
            process.env.VITE_SUPABASE_ANON_KEY)),
    ),
  })
}
