import { describe, expect, it } from 'vitest'
import {
  mergeAccountLists,
  mergeInvoiceMaps,
  mergePaidIds,
  mergePaymentLists,
  mergePortalOps,
  mergeResidentLists,
  mergeSyncPayload,
} from '../../lib/syncMerge'

describe('syncMerge', () => {
  it('drops local-only resident login when cloud removed it', () => {
    const remote = [{ phone: '0501111111', pin: '1234', role: 'admin', name: 'Admin' }]
    const local = [
      { phone: '0501111111', pin: '1234', role: 'admin', name: 'Admin' },
      { phone: '0502222222', pin: '5678', role: 'resident', name: 'Tenant', residentId: 'apt-a3' },
    ]
    const merged = mergeAccountLists(remote, local, true)
    expect(merged.some((a) => a.role === 'resident' && (a as { residentId?: string }).residentId === 'apt-a3')).toBe(
      false,
    )
  })

  it('prefers settled payment over stale pending_review from another device', () => {
    const remote = [{ id: 'PAY-1', status: 'settled', confirmedAmount: 5000 }]
    const local = [{ id: 'PAY-1', status: 'pending_review' }]
    const merged = mergePaymentLists(remote, local)
    expect(merged[0]?.status).toBe('settled')
  })

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

  it('prefers remote amountPaid when admin lowered balance on another device', () => {
    const remote = [
      {
        id: 'apt-a1',
        contractTotal: 36_000,
        amountPaid: 9,
        rentAmount: 3_000,
        amountPaidManual: true,
      },
    ]
    const local = [{ id: 'apt-a1', contractTotal: 36_000, amountPaid: 92, rentAmount: 3_000 }]
    const merged = mergeResidentLists(remote, local, false)
    expect(merged[0]?.amountPaid).toBe(9)
  })

  it('prefers lower local amountPaid when local is newer after invoice removal', () => {
    const remote = [{ id: 'apt-a1', contractTotal: 36_000, amountPaid: 9_000, rentAmount: 3_000 }]
    const local = [
      {
        id: 'apt-a1',
        contractTotal: 36_000,
        amountPaid: 0,
        rentAmount: 3_000,
        amountPaidManual: true,
      },
    ]
    const merged = mergeResidentLists(remote, local, true)
    expect(merged[0]?.amountPaid).toBe(0)
  })

  it('keeps contract total when cloud sync is newer but local has rent plan', () => {
    const remote = [
      {
        id: 'apt-a1',
        contractTotal: 0,
        amountPaid: 0,
        rentAmount: 0,
      },
    ]
    const local = [
      {
        id: 'apt-a1',
        contractTotal: 36_000,
        amountPaid: 9_000,
        rentAmount: 3_000,
        amountPaidManual: true,
      },
    ]
    const merged = mergeResidentLists(remote, local, false)
    expect(merged[0]?.contractTotal).toBe(36_000)
    expect(merged[0]?.rentAmount).toBe(3_000)
    expect(merged[0]?.amountPaid).toBe(9_000)
  })

  it('keeps removed invoices out after cloud merge', () => {
    const merged = mergePortalOps(
      {
        invoiceMap: {
          'apt-a1': [{ id: 'INV-A1-202608', status: 'due' }],
        },
      },
      {
        invoiceMap: {},
        removedInvoiceIds: ['INV-A1-202608'],
      },
    )
    expect((merged.invoiceMap as Record<string, { id: string }[]>)['apt-a1'] ?? []).toHaveLength(0)
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
