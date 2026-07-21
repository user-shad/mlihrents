import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPaymentProof, isProofStorageConfigured, upsertPaymentProof } from '../lib/proofStorage.js'
import { requireSyncAuth } from '../lib/syncAuth.js'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')

  if (!requireSyncAuth(req, res)) return

  if (!isProofStorageConfigured()) {
    res.status(503).json({
      configured: false,
      hint: 'Proof storage not configured on server',
    })
    return
  }

  if (req.method === 'GET') {
    const paymentId = String(req.query.paymentId ?? '').trim()
    if (!paymentId) {
      res.status(400).json({ error: 'payment_id_required' })
      return
    }
    const proof = await getPaymentProof(paymentId)
    if (!proof) {
      res.status(404).json({ error: 'proof_not_found' })
      return
    }
    res.status(200).json({ paymentId, ...proof })
    return
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    const body = (req.body ?? {}) as { paymentId?: string; name?: string; dataUrl?: string }
    const paymentId = String(body.paymentId ?? '').trim()
    const dataUrl = String(body.dataUrl ?? '').trim()
    const name = String(body.name ?? 'proof.jpg').trim() || 'proof.jpg'
    if (!paymentId || !dataUrl.startsWith('data:image/')) {
      res.status(400).json({ error: 'invalid_proof_payload' })
      return
    }
    try {
      await upsertPaymentProof(paymentId, { name, dataUrl })
      res.status(200).json({ ok: true, paymentId })
      return
    } catch (err) {
      const message = err instanceof Error ? err.message : 'proof_save_failed'
      res.status(500).json({ ok: false, error: message })
      return
    }
  }

  res.status(405).json({ error: 'method_not_allowed' })
}
