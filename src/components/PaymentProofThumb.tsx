import { useEffect, useState } from 'react'
import type { PaymentRecord } from '../data'
import { fetchPaymentProof } from '../lib/paymentProofApi'
import { useLang } from '../context/LangContext'

export function PaymentProofThumb({
  payment,
  className,
  style,
  showMissing = false,
}: {
  payment: PaymentRecord
  className?: string
  style?: React.CSSProperties
  showMissing?: boolean
}) {
  const { tr } = useLang()
  const [dataUrl, setDataUrl] = useState(payment.transferProof?.dataUrl ?? '')
  const [loading, setLoading] = useState(!payment.transferProof?.dataUrl)

  useEffect(() => {
    let cancelled = false
    const localUrl = payment.transferProof?.dataUrl ?? ''
    if (localUrl) {
      setDataUrl(localUrl)
      setLoading(false)
      return
    }
    if (payment.status !== 'pending_review' && !payment.transferProof?.name) {
      setLoading(false)
      return
    }
    setLoading(true)
    void fetchPaymentProof(payment.id).then((proof) => {
      if (cancelled) return
      if (proof?.dataUrl) {
        setDataUrl(proof.dataUrl)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [payment.id, payment.status, payment.transferProof?.dataUrl, payment.transferProof?.name])

  if (loading) {
    return (
      <p className="meta" style={{ marginTop: '0.5rem', ...(style ?? {}) }}>
        {tr('loadingProof')}
      </p>
    )
  }

  if (!dataUrl) {
    if (showMissing) return <PaymentProofMissing style={style} />
    return null
  }

  const name = payment.transferProof?.name || 'proof.jpg'

  return (
    <a
      className={className ?? 'proof-thumb'}
      href={dataUrl}
      target="_blank"
      rel="noreferrer"
      style={style}
    >
      <img src={dataUrl} alt={name} />
      <span>{tr('viewProof')}</span>
    </a>
  )
}

export function PaymentProofMissing({ style }: { style?: React.CSSProperties }) {
  const { tr } = useLang()
  return (
    <p className="meta" style={{ marginTop: '0.5rem', ...(style ?? {}) }}>
      {tr('noTransferProof')}
    </p>
  )
}
