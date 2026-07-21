import { describe, expect, it } from 'vitest'
import { type PaymentRecord } from '../data'
import { formatScreenshotAnalysis, parseTransferScreenshotText } from './transferProofOcr'

describe('transferProofOcr', () => {
  it('extracts bank reference from screenshot text', () => {
    const ocr = parseTransferScreenshotText(
      'Transfer successful\nReference number\n1422869093\nAmount AED 2,400.00',
      2400,
    )
    expect(ocr.extractedBankRef).toBe('1422869093')
  })

  it('extracts alphanumeric bank reference from screenshot text', () => {
    const ocr = parseTransferScreenshotText(
      'Transfer successful\nReference number\nREF123456789\nAmount AED 2,400.00',
      2400,
    )
    expect(ocr.extractedBankRef).toBe('REF123456789')
  })

  it('reports when reference is present and matches resident input', () => {
    const payment: PaymentRecord = {
      id: 'PAY-1',
      invoiceId: 'INV-A0-202607',
      residentId: 'apt-a0',
      residentName: 'Test Tenant',
      unit: 'A0',
      amount: 2400,
      method: 'bank',
      status: 'pending_review',
      paidAt: '21 Jul 2026',
      destination: 'Wio',
      bankReference: '1422869093',
    }
    const ocr = parseTransferScreenshotText('Reference number: 1422869093\nAED 2,400.00', 2400)
    const text = formatScreenshotAnalysis(ocr, payment, 'en')
    expect(text).toContain('Reference found in screenshot: 1422869093')
    expect(text).toContain('Match')
  })

  it('reports when reference is missing from screenshot', () => {
    const payment: PaymentRecord = {
      id: 'PAY-2',
      invoiceId: 'INV-A1-202607',
      residentId: 'apt-a1',
      residentName: 'Other',
      unit: 'A1',
      amount: 2500,
      method: 'bank',
      status: 'pending_review',
      paidAt: '21 Jul 2026',
      destination: 'Wio',
      bankReference: '9999999999',
    }
    const ocr = parseTransferScreenshotText('Transfer complete\nAmount AED 2,500', 2500)
    const text = formatScreenshotAnalysis(ocr, payment, 'en')
    expect(text).toContain('Reference not found in screenshot')
  })
})
