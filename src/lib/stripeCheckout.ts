export function isStripeConfigured() {
  return Boolean(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim())
}

const PROCESSED_KEY = 'mlihrents_stripe_sessions'

export function wasStripeSessionProcessed(sessionId: string) {
  try {
    const list = JSON.parse(localStorage.getItem(PROCESSED_KEY) || '[]') as string[]
    return list.includes(sessionId)
  } catch {
    return false
  }
}

export function markStripeSessionProcessed(sessionId: string) {
  try {
    const list = JSON.parse(localStorage.getItem(PROCESSED_KEY) || '[]') as string[]
    if (!list.includes(sessionId)) {
      localStorage.setItem(PROCESSED_KEY, JSON.stringify([...list, sessionId]))
    }
  } catch {
    /* ignore */
  }
}

export interface CheckoutSessionPayload {
  amount: number
  invoiceId: string
  residentId: string
  residentName: string
  unit: string
  period: string
}

export async function createCheckoutSession(payload: CheckoutSessionPayload) {
  const res = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
  if (!res.ok) {
    throw new Error(data.error || 'Could not start checkout')
  }
  if (!data.url) throw new Error('Missing checkout URL')
  return data.url
}

export interface VerifiedCheckoutSession {
  paid: boolean
  payment_status: string
  amount: number
  currency: string
  invoiceId: string
  residentId: string
  residentName: string
  unit: string
  period: string
  stripeSessionId: string
}

export async function verifyCheckoutSession(sessionId: string) {
  const res = await fetch(`/api/verify-checkout-session?session_id=${encodeURIComponent(sessionId)}`)
  const data = (await res.json().catch(() => ({}))) as VerifiedCheckoutSession & { error?: string }
  if (!res.ok) {
    throw new Error(data.error || 'Could not verify payment')
  }
  return data
}
