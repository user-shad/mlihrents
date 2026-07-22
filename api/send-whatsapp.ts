import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireSyncAuth } from '../lib/syncAuth.js'
import { isWhatsAppConfigured, sendWhatsAppText } from '../lib/whatsappCloud.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  if (!requireSyncAuth(req, res)) return

  if (!isWhatsAppConfigured()) {
    res.status(503).json({
      configured: false,
      error: 'whatsapp_not_configured',
      hint: 'Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID on Vercel. See SETUP-WHATSAPP.md.',
    })
    return
  }

  const body = (req.body ?? {}) as { phone?: string; message?: string }
  const phone = String(body.phone ?? '').trim()
  const message = String(body.message ?? '').trim()

  if (!phone || !message) {
    res.status(400).json({ error: 'phone_and_message_required' })
    return
  }

  const result = await sendWhatsAppText(phone, message)
  if (!result.ok) {
    res.status(502).json({ ok: false, error: result.error ?? 'send_failed' })
    return
  }

  res.status(200).json({ ok: true, messageId: result.messageId })
}
