/** Normalize UAE/local phone to WhatsApp Cloud API format (digits, 971…). */
export function whatsappApiPhone(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('0')) digits = `971${digits.slice(1)}`
  if (digits.length === 9 && digits.startsWith('5')) digits = `971${digits}`
  return digits
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN?.trim() && process.env.WHATSAPP_PHONE_NUMBER_ID?.trim(),
  )
}

export type WhatsAppSendResult = {
  ok: boolean
  error?: string
  messageId?: string
}

/** Send a WhatsApp text message via Meta Cloud API. */
export async function sendWhatsAppText(to: string, body: string): Promise<WhatsAppSendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim()
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
  if (!token || !phoneNumberId) {
    return { ok: false, error: 'whatsapp_not_configured' }
  }

  const recipient = whatsappApiPhone(to)
  if (!recipient) return { ok: false, error: 'invalid_phone' }

  const apiVersion = process.env.WHATSAPP_API_VERSION?.trim() || 'v21.0'
  const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'text',
      text: { preview_url: true, body: body.slice(0, 4096) },
    }),
  })

  const data = (await res.json().catch(() => ({}))) as {
    messages?: { id: string }[]
    error?: { message?: string; error_user_msg?: string }
  }

  if (!res.ok) {
    return {
      ok: false,
      error: data.error?.error_user_msg ?? data.error?.message ?? `http_${res.status}`,
    }
  }

  return { ok: true, messageId: data.messages?.[0]?.id }
}
