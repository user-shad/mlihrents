import { describe, expect, it } from 'vitest'
import {
  applyDueDayToInvoices,
  blankResident,
  buildInstallmentInvoice,
  calendarDueDateIso,
  currentCalendarDueDateIso,
} from './data'

describe('calendar due dates', () => {
  const resident = {
    ...blankResident,
    id: 'apt-a1',
    apartment: 'A1',
    contractTotal: 28_800,
    amountPaid: 0,
    rentAmount: 7_200,
    rentDueDay: 5,
    rentSchedule: 3 as const,
  }

  it('builds due date on the configured day in the current calendar month', () => {
    const inv = buildInstallmentInvoice(resident, 'en')
    const now = new Date()
    const expected = currentCalendarDueDateIso(5, now)
    expect(inv?.dueDateIso).toBe(expected)
  })

  it('applies due day within each invoice calendar month', () => {
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
    const updated = applyDueDayToInvoices(invoices, 5, 'en')
    expect(updated[0].dueDateIso).toBe(calendarDueDateIso(2026, 2, 5))
  })
})
