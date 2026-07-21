import type { VercelRequest, VercelResponse } from '@vercel/node'

export function getSyncApiToken() {
  return process.env.SYNC_API_TOKEN?.trim() ?? ''
}

function readRequestSyncToken(req: VercelRequest): string {
  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim()
  }
  const header = req.headers['x-sync-token']
  if (typeof header === 'string') return header.trim()
  if (Array.isArray(header)) return header[0]?.trim() ?? ''
  return ''
}

/** Returns false after sending 401/503. Call before handling sync routes. */
export function requireSyncAuth(req: VercelRequest, res: VercelResponse): boolean {
  const expected = getSyncApiToken()
  if (!expected) {
    res.status(503).json({
      configured: false,
      error: 'sync_token_not_configured',
      hint: 'Set SYNC_API_TOKEN on Vercel and VITE_SYNC_API_TOKEN for the frontend build, then redeploy.',
    })
    return false
  }

  const provided = readRequestSyncToken(req)
  if (!provided || provided !== expected) {
    res.status(401).json({
      error: 'unauthorized',
      hint: 'Missing or invalid sync token',
    })
    return false
  }

  return true
}
