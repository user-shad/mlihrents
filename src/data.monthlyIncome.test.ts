import { describe, expect, it } from 'vitest'
import {
  blankResident,
  collectedInMonth,
  expectedMonthlyIncome,
  monthlyRentEquivalent,
  type PaymentRecord,
} from './data'

describe('monthly income helpers', () => {
  it('converts schedules to monthly rent', () => {
    expect(
      monthlyRentEquivalent({
        ...blankResident,
        rentAmount: 9000,
        rentSchedule: 4,
        contractTotal: 36000,
      }),
    ).toBe(3000)
  })

  it('sums expected monthly income from rent plans', () => {
    const total = expectedMonthlyIncome([
      { ...blankResident, id: '1', contractTotal: 12000, rentAmount: 1000, rentSchedule: 12 },
      { ...blankResident, id: '2', contractTotal: 36000, rentAmount: 9000, rentSchedule: 4 },
    ])
    expect(total).toBe(4000)
  })

  it('totals verified payments in the current month', () => {
    const now = new Date()
    const paidAt = `${now.getDate()} ${now.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
    const payments: PaymentRecord[] = [
      {
        id: 'p1',
        invoiceId: 'INV-1',
        residentId: 'r1',
        residentName: 'Test',
        unit: 'A1',
        amount: 2500,
        confirmedAmount: 2500,
        method: 'bank',
        status: 'settled',
        paidAt,
        destination: 'Wio',
      },
    ]
    expect(collectedInMonth(payments, now.getFullYear(), now.getMonth())).toBe(2500)
  })
})
