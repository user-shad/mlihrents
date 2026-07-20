import { createClient } from '@supabase/supabase-js'

const SYNC_ID = 'main'

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export default async function handler(
  request: {
    method?: string
    body?: { accounts?: unknown; ops?: unknown }
  },
  response: {
    setHeader: (name: string, value: string) => void
    status: (code: number) => { json: (body: unknown) => void }
  },
) {
  response.setHeader('Cache-Control', 'no-store')

  if (request.method === 'GET' && !getSupabase()) {
    response.status(503).json({ configured: false })
    return
  }

  const supabase = getSupabase()
  if (!supabase) {
    response.status(503).json({ configured: false })
    return
  }

  if (request.method === 'GET') {
    const { data, error } = await supabase
      .from('portal_sync')
      .select('accounts, ops, updated_at')
      .eq('id', SYNC_ID)
      .maybeSingle()

    if (error) {
      response.status(500).json({ configured: true, error: error.message })
      return
    }

    response.status(200).json({
      configured: true,
      accounts: data?.accounts ?? [],
      ops: data?.ops ?? {},
      updated_at: data?.updated_at ?? null,
    })
    return
  }

  if (request.method === 'PUT' || request.method === 'POST') {
    const body = request.body ?? {}
    const { error } = await supabase.from('portal_sync').upsert({
      id: SYNC_ID,
      accounts: body.accounts ?? [],
      ops: body.ops ?? {},
      updated_at: new Date().toISOString(),
    })

    if (error) {
      response.status(500).json({ configured: true, error: error.message })
      return
    }

    response.status(200).json({ configured: true, ok: true })
    return
  }

  response.status(405).json({ error: 'method_not_allowed' })
}
