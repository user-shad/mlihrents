import { describe, expect, it } from 'vitest'
import {
  mergeAccountLists,
  mergeInvoiceMaps,
  mergePaidIds,
  mergePaymentLists,
  mergePortalOps,
  mergeResidentLists,
  mergeRevokedResidentLogins,
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

  it('prefers cleared local tenant fields over cloud when local is newer', () => {
    const remote = [
      {
        id: 'apt-a1',
        name: 'Old Tenant',
        phone: '0501111111',
        pin: '1234',
        contractTotal: 36_000,
        rentAmount: 3_000,
        amountPaid: 9_000,
      },
    ]
    const local = [
      {
        id: 'apt-a1',
        name: '',
        phone: '',
        pin: '',
        contractTotal: 0,
        rentAmount: 0,
        amountPaid: 0,
      },
    ]
    const merged = mergeResidentLists(remote, local, true, ['apt-a1'])
    expect(merged[0]?.name).toBe('')
    expect(merged[0]?.phone).toBe('')
    expect(merged[0]?.contractTotal).toBe(0)
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

  it('merges revoked resident logins from both devices', () => {
    expect(mergeRevokedResidentLogins(['apt-a1'], ['APT-A2']).sort()).toEqual(['apt-a1', 'apt-a2'])
    const merged = mergePortalOps(
      { revokedResidentLogins: ['apt-a1'] },
      { revokedResidentLogins: ['apt-a3'] },
    )
    expect((merged.revokedResidentLogins as string[]).sort()).toEqual(['apt-a1', 'apt-a3'])
  })

  it('keeps cleared apartment data removed when cloud still has old tenant', () => {
    const merged = mergePortalOps(
      {
        residentList: [
          {
            id: 'apt-a1',
            name: 'Old Tenant',
            phone: '0501111111',
            pin: '1234',
            contractTotal: 36_000,
            rentAmount: 3_000,
            amountPaid: 9_000,
          },
        ],
        invoiceMap: {
          'apt-a1': [{ id: 'INV-A1-202608', status: 'due' }],
        },
        payments: [{ id: 'PAY-1', residentId: 'apt-a1', status: 'settled' }],
        paidIds: ['INV-A1-202608'],
        ticketMap: { 'apt-a1': [{ id: 'T-1', status: 'open' }] },
      },
      {
        residentList: [
          {
            id: 'apt-a1',
            name: '',
            phone: '',
            pin: '',
            contractTotal: 0,
            rentAmount: 0,
            amountPaid: 0,
          },
        ],
        invoiceMap: {},
        payments: [],
        paidIds: [],
        ticketMap: {},
        removedInvoiceIds: ['INV-A1-202608'],
        revokedResidentLogins: ['apt-a1'],
      },
    )
    const resident = (merged.residentList as { id: string; name?: string; contractTotal?: number }[])[0]
    expect(resident?.name).toBe('')
    expect(resident?.contractTotal).toBe(0)
    expect((merged.invoiceMap as Record<string, unknown[]>)['apt-a1'] ?? []).toHaveLength(0)
    expect((merged.payments as { id: string }[]).some((p) => p.id === 'PAY-1')).toBe(false)
    expect((merged.paidIds as string[]).includes('INV-A1-202608')).toBe(false)
    expect((merged.ticketMap as Record<string, unknown[]>)['apt-a1'] ?? []).toHaveLength(0)
  })

  it('drops removed invoice ids from paidIds merge', () => {
    expect(mergePaidIds(['INV-1', 'INV-2'], ['INV-3'], ['INV-2']).sort()).toEqual(['INV-1', 'INV-3'])
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
