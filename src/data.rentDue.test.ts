import { describe, expect, it } from 'vitest'
import {
  applyDueDayToInvoices,
  blankResident,
  buildInstallmentInvoice,
  installmentDueDateIso,
  openInstallmentIndex,
} from './data'

describe('installment due dates', () => {
  const quarterly = {
    ...blankResident,
    id: 'apt-a1',
    apartment: 'A1',
    leaseStart: '01/11/2025',
    contractTotal: 28_800,
    amountPaid: 0,
    rentAmount: 7_200,
    rentDueDay: 5,
    rentSchedule: 3 as const,
  }

  it('spaces due dates every N months from lease start', () => {
    expect(installmentDueDateIso(quarterly, 0)).toBe('2025-11-05')
    expect(installmentDueDateIso(quarterly, 1)).toBe('2026-02-05')
    expect(installmentDueDateIso(quarterly, 2)).toBe('2026-05-05')
    expect(installmentDueDateIso(quarterly, 3)).toBe('2026-08-05')
  })

  it('advances open installment index after payments', () => {
    expect(openInstallmentIndex(quarterly)).toBe(0)
    expect(openInstallmentIndex({ ...quarterly, amountPaid: 7_200 })).toBe(1)
    expect(openInstallmentIndex({ ...quarterly, amountPaid: 14_400 })).toBe(2)
  })

  it('builds invoice on the current installment due date', () => {
    const inv = buildInstallmentInvoice(quarterly, 'en')
    expect(inv?.dueDateIso).toBe('2025-11-05')
    expect(inv?.amount).toBe(7_200)
  })

  it('applyDueDayToInvoices aligns unpaid invoices to schedule', () => {
    const paidOne = { ...quarterly, amountPaid: 7_200 }
    const invoices = [
      {
        id: 'INV-A1-202602',
        period: 'Feb 2026',
        amount: 7_200,
        dueDate: '1 Feb 2026',
        dueDateIso: '2026-02-01',
        status: 'due' as const,
      },
    ]
    const updated = applyDueDayToInvoices(invoices, paidOne, 'en')
    expect(updated[0].dueDateIso).toBe('2026-02-05')
  })
})
