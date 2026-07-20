import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'

function siteOrigin(req: VercelRequest) {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host
  if (host) return `${proto}://${host}`
  return process.env.SITE_URL || 'https://mlihrents.vercel.app'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) {
    return res.status(503).json({ error: 'Stripe is not configured on the server' })
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const amount = Number(body?.amount)
  const invoiceId = String(body?.invoiceId || '')
  const residentId = String(body?.residentId || '')
  const residentName = String(body?.residentName || '')
  const unit = String(body?.unit || '')
  const period = String(body?.period || 'Rent payment')

  if (!amount || amount <= 0 || !invoiceId || !residentId) {
    return res.status(400).json({ error: 'Invalid checkout payload' })
  }

  const stripe = new Stripe(secret)
  const origin = siteOrigin(req)

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'aed',
            unit_amount: Math.round(amount * 100),
            product_data: {
              name: period,
              description: `${unit} · ${invoiceId}`,
            },
          },
        },
      ],
      success_url: `${origin}/app?tab=pay&stripe_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/app?tab=pay&pay_cancelled=1`,
      metadata: {
        invoiceId,
        residentId,
        residentName,
        unit,
        period,
      },
    })

    if (!session.url) {
      return res.status(500).json({ error: 'Could not create checkout session' })
    }

    return res.status(200).json({ url: session.url, sessionId: session.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe error'
    return res.status(500).json({ error: message })
  }
}
