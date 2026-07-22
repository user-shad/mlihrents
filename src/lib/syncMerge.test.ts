import { describe, expect, it } from 'vitest'
import {
  mergeInvoiceMaps,
  mergePaidIds,
  mergePaymentLists,
  mergeSyncPayload,
} from '../../lib/syncMerge'

describe('syncMerge', () => {
  it('keeps pending payments from cloud when client save omits them', () => {
    const remote = [
      { id: 'PAY-100', status: 'pending_review', transferProof: { name: 'proof.jpg' } },
      { id: 'PAY-99', status: 'settled' },
    ]
    const local = [{ id: 'PAY-99', status: 'settled' }]
    const merged = mergePaymentLists(remote, local)
    expect(merged.some((p) => p.id === 'PAY-100')).toBe(true)
  })

  it('merges invoice maps from both devices', () => {
    const merged = mergeInvoiceMaps(
      {
        'apt-a1': [{ id: 'INV-A1-202607', status: 'paid' }],
      },
      {
        'apt-a1': [{ id: 'INV-A1-202608', status: 'due' }],
        'apt-a2': [{ id: 'INV-A2-202608', status: 'due' }],
      },
    )
    expect(merged['apt-a1']).toHaveLength(2)
    expect(merged['apt-a2']).toHaveLength(1)
  })

  it('merges paid invoice ids from both devices', () => {
    expect(mergePaidIds(['INV-1'], ['INV-2', 'INV-1']).sort()).toEqual(['INV-1', 'INV-2'])
  })

  it('merges sync payloads without dropping pending payments', () => {
    const existing = {
      accounts: [{ id: 'admin' }],
      ops: {
        payments: [{ id: 'PAY-100', status: 'pending_review' }],
      },
      updated_at: '2026-07-21T10:00:00.000Z',
    }
    const incoming = {
      accounts: [{ id: 'admin' }],
      ops: {
        payments: [{ id: 'PAY-99', status: 'settled' }],
      },
      updated_at: '2026-07-21T11:00:00.000Z',
    }
    const merged = mergeSyncPayload(existing, incoming)
    const payments = (merged.ops as { payments: { id: string }[] }).payments
    expect(payments.some((p) => p.id === 'PAY-100')).toBe(true)
    expect(payments.some((p) => p.id === 'PAY-99')).toBe(true)
  })
})
