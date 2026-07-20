import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) {
    return res.status(503).json({ error: 'Stripe is not configured on the server' })
  }

  const sessionId = String(req.query.session_id || '')
  if (!sessionId) {
    return res.status(400).json({ error: 'Missing session_id' })
  }

  const stripe = new Stripe(secret)

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    const paid = session.payment_status === 'paid'

    return res.status(200).json({
      paid,
      payment_status: session.payment_status,
      amount: (session.amount_total ?? 0) / 100,
      currency: (session.currency || 'aed').toUpperCase(),
      invoiceId: session.metadata?.invoiceId || '',
      residentId: session.metadata?.residentId || '',
      residentName: session.metadata?.residentName || '',
      unit: session.metadata?.unit || '',
      period: session.metadata?.period || '',
      stripeSessionId: session.id,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe error'
    return res.status(500).json({ error: message })
  }
}
