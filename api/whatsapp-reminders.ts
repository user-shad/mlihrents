import type { VercelRequest, VercelResponse } from '@vercel/node'
import { loadPortalSync, savePortalSync } from '../lib/portalSyncClient.js'
import { requireSyncAuth } from '../lib/syncAuth.js'
import { isWhatsAppConfigured, sendWhatsAppText } from '../lib/whatsappCloud.js'
import { runRentReminders, type PortalOpsLike } from '../lib/whatsappReminders.js'

function requireCronOrSyncAuth(req: VercelRequest, res: VercelResponse): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim()
  const authHeader = req.headers.authorization
  const bearer =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : ''
  if (cronSecret && bearer === cronSecret) return true
  return requireSyncAuth(req, res)
}

import { serverPublicSiteUrl } from '../lib/publicSiteUrl.js'

function portalUrl() {
  return serverPublicSiteUrl()
}

function brandName() {
  return process.env.WHATSAPP_BRAND_NAME?.trim() || 'MLIH Rents'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  if (!requireCronOrSyncAuth(req, res)) return

  if (!isWhatsAppConfigured()) {
    res.status(503).json({
      configured: false,
      error: 'whatsapp_not_configured',
      hint: 'Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID on Vercel. See SETUP-WHATSAPP.md.',
    })
    return
  }

  const force = req.method === 'POST' && String((req.body as { force?: boolean })?.force ?? '') === 'true'

  const payload = await loadPortalSync()
  if (!payload) {
    res.status(503).json({ error: 'could_not_load_portal_data' })
    return
  }

  const result = await runRentReminders((payload.ops ?? {}) as PortalOpsLike, {
    portalUrl: `${portalUrl()}/resident`,
    brandName: brandName(),
    force,
  })

  const saved = await savePortalSync({
    accounts: payload.accounts ?? [],
    ops: result.ops,
    updated_at: new Date().toISOString(),
  })

  res.status(200).json({
    ok: true,
    saved,
    run: result.run,
    whatsappConfigured: true,
  })
}
