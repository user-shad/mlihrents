import { describe, expect, it } from 'vitest'
import {
  aiReply,
  blankResident,
  defaultServiceDirectory,
  type PaymentRecord,
  type ResidentAiContext,
} from './data'

function samplePayment(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: 'pay-1',
    invoiceId: 'INV-001',
    residentId: 'r1',
    residentName: 'Sara Ali',
    unit: 'A-101',
    amount: 5000,
    method: 'bank',
    status: 'pending_review',
    paidAt: '1 Jan 2026',
    destination: 'Wio',
    ...overrides,
  }
}

function sampleContext(overrides: Partial<ResidentAiContext> = {}): ResidentAiContext {
  const resident = {
    ...blankResident,
    id: 'r1',
    name: 'Sara Ali',
    apartment: '101',
    building: 'Tower A',
    buildingNumber: '1',
    contractTotal: 120_000,
    amountPaid: 60_000,
    rentAmount: 10_000,
    currency: 'AED',
  }
  return {
    resident,
    invoices: [
      {
        id: 'INV-001',
        period: 'Feb 2026',
        amount: 10_000,
        dueDate: '1 Mar 2026',
        status: 'due',
      },
    ],
    tickets: [],
    payments: [],
    ...overrides,
  }
}

describe('aiReply with resident context', () => {
  it('returns remaining balance and current invoice', () => {
    const reply = aiReply('what do I owe?', 'en', defaultServiceDirectory, sampleContext())
    expect(reply.text).toContain('60,000')
    expect(reply.text).toContain('Feb 2026')
    expect(reply.text).toContain('10,000')
  })

  it('reports pending payment review status', () => {
    const ctx = sampleContext({
      payments: [samplePayment({ status: 'pending_review', amount: 10_000 })],
    })
    const reply = aiReply('payment status', 'en', defaultServiceDirectory, ctx)
    expect(reply.text.toLowerCase()).toContain('under review')
    expect(reply.text).toContain('10,000')
  })

  it('escalates to human when asked', () => {
    const reply = aiReply('talk to a person', 'en', defaultServiceDirectory, sampleContext())
    expect(reply.escalate).toBe(true)
  })

  it('suggests examples when input is unclear', () => {
    const reply = aiReply('xyzzy unknown phrase', 'en', defaultServiceDirectory, sampleContext())
    expect(reply.text.toLowerCase()).toContain('automated assistant')
    expect(reply.text).toContain('What do I owe?')
  })
})
