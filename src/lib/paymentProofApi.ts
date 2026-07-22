import { readLocalProofs, writeLocalProofs, type LocalProofStore } from './localProofStore'

function syncApiToken() {
  return (import.meta.env.VITE_SYNC_API_TOKEN as string | undefined)?.trim() ?? ''
}

function syncApiHeaders(): HeadersInit {
  const token = syncApiToken()
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

export async function uploadPaymentProof(
  paymentId: string,
  proof: { name: string; dataUrl: string },
): Promise<boolean> {
  const key = paymentId.trim()
  if (!key || !proof.dataUrl) return false

  const next: LocalProofStore = { ...readLocalProofs(), [key]: proof }
  writeLocalProofs(next)

  if (!syncApiToken()) return false

  try {
    const res = await fetch('/api/payment-proof', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...syncApiHeaders() },
      body: JSON.stringify({ paymentId: key, name: proof.name, dataUrl: proof.dataUrl }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function fetchPaymentProof(
  paymentId: string,
): Promise<{ name: string; dataUrl: string } | null> {
  const key = paymentId.trim()
  if (!key) return null

  const local = readLocalProofs()[key]
  if (local?.dataUrl) return local

  if (!syncApiToken()) return null

  try {
    const res = await fetch(`/api/payment-proof?paymentId=${encodeURIComponent(key)}`, {
      cache: 'no-store',
      headers: syncApiHeaders(),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { name?: string; dataUrl?: string }
    if (!data.dataUrl) return null
    const proof = { name: data.name || 'proof.jpg', dataUrl: data.dataUrl }
    writeLocalProofs({ ...readLocalProofs(), [key]: proof })
    return proof
  } catch {
    return null
  }
}
