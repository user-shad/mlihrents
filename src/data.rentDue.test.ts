import { describe, expect, it } from 'vitest'
import {
  applyDueDayToInvoices,
  blankResident,
  buildInstallmentInvoice,
  calendarInstallmentDueIso,
  nextCalendarInstallmentDueIso,
} from './data'

describe('calendar installment due dates', () => {
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

  it('spaces due dates on the calendar grid every N months from January', () => {
    expect(calendarInstallmentDueIso(0, 5, 3, 2026)).toBe('2026-01-05')
    expect(calendarInstallmentDueIso(1, 5, 3, 2026)).toBe('2026-04-05')
    expect(calendarInstallmentDueIso(2, 5, 3, 2026)).toBe('2026-07-05')
    expect(calendarInstallmentDueIso(3, 5, 3, 2026)).toBe('2026-10-05')
  })

  it('starts after lease start on the calendar grid', () => {
    expect(nextCalendarInstallmentDueIso(quarterly)).toBe('2026-01-05')
    expect(
      nextCalendarInstallmentDueIso({ ...quarterly, amountPaid: 7_200 }),
    ).toBe('2026-04-05')
  })

  it('builds invoice on the next calendar installment date', () => {
    const inv = buildInstallmentInvoice(quarterly, 'en')
    expect(inv?.dueDateIso).toBe('2026-01-05')
    expect(inv?.amount).toBe(7_200)
  })

  it('aligns unpaid invoices to the calendar schedule', () => {
    const invoices = [
      {
        id: 'INV-A1-202604',
        period: 'Apr 2026',
        amount: 7_200,
        dueDate: '1 Apr 2026',
        dueDateIso: '2026-04-01',
        status: 'due' as const,
      },
    ]
    const updated = applyDueDayToInvoices(invoices, { ...quarterly, amountPaid: 7_200 }, 'en')
    expect(updated[0].dueDateIso).toBe('2026-04-05')
  })
})
