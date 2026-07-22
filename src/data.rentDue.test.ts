import { describe, expect, it } from 'vitest'
import {
  advanceDueDateByMonths,
  applyDueDayToInvoices,
  blankResident,
  buildInstallmentInvoice,
  formatNextDueDate,
  residentAfterInstallmentPaid,
  resolveNextDueDateIso,
} from './data'

describe('custom next due date', () => {
  const resident = {
    ...blankResident,
    id: 'apt-a1',
    apartment: 'A1',
    contractTotal: 28_800,
    amountPaid: 0,
    rentAmount: 7_200,
    rentDueDay: 5,
    rentSchedule: 3 as const,
    nextDueDateIso: '2026-08-15',
  }

  it('uses the admin-set next due date', () => {
    expect(resolveNextDueDateIso(resident)).toBe('2026-08-15')
    expect(formatNextDueDate(resident, 'en')).toMatch(/15 Aug 2026/)
  })

  it('builds invoice on the custom due date', () => {
    const inv = buildInstallmentInvoice(resident, 'en')
    expect(inv?.dueDateIso).toBe('2026-08-15')
  })

  it('advances due date by the schedule interval after payment', () => {
    const next = residentAfterInstallmentPaid(resident)
    expect(next.nextDueDateIso).toBe('2026-11-15')
    expect(next.rentDueDay).toBe(15)
  })

  it('applies custom due date to open invoices', () => {
    const invoices = [
      {
        id: 'INV-A1-202608',
        period: 'Aug 2026',
        amount: 7_200,
        dueDate: '1 Aug 2026',
        dueDateIso: '2026-08-01',
        status: 'due' as const,
      },
    ]
    const updated = applyDueDayToInvoices(invoices, resident, 'en')
    expect(updated[0].dueDateIso).toBe('2026-08-15')
  })

  it('adds months when advancing dates', () => {
    expect(advanceDueDateByMonths('2026-01-31', 1)).toBe('2026-02-28')
  })
})
