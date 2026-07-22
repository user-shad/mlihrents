const API_TOKEN = (import.meta.env.VITE_SYNC_API_TOKEN as string | undefined)?.trim() ?? ''

function authHeaders(): HeadersInit {
  if (!API_TOKEN) return {}
  return { Authorization: `Bearer ${API_TOKEN}` }
}

export function isWhatsAppAutoConfigured(): boolean {
  return Boolean(API_TOKEN)
}

export async function sendWhatsAppAuto(phone: string, message: string): Promise<boolean> {
  if (!API_TOKEN || !phone.trim() || !message.trim()) return false
  try {
    const res = await fetch('/api/send-whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ phone: phone.trim(), message: message.trim() }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function runWhatsAppRentReminders(force = false): Promise<{
  ok: boolean
  run?: { sent: number; skipped: number; failed: number; errors: string[] }
  error?: string
}> {
  if (!API_TOKEN) {
    return { ok: false, error: 'whatsapp_not_configured' }
  }
  try {
    const res = await fetch('/api/whatsapp-reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ force }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      run?: { sent: number; skipped: number; failed: number; errors: string[] }
      error?: string
      hint?: string
    }
    if (!res.ok) {
      return { ok: false, error: data.error ?? data.hint ?? `http_${res.status}` }
    }
    return { ok: true, run: data.run }
  } catch {
    return { ok: false, error: 'network_error' }
  }
}
