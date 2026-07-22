import { describe, expect, it } from 'vitest'
import {
  amountDueThroughMonth,
  applyRentPaidThroughMonth,
  installmentCountThroughMonth,
  leaseInstallmentDueIso,
  type Invoice,
  type Resident,
} from './data'

function sampleResident(overrides: Partial<Resident> = {}): Resident {
  return {
    id: 'apt-a1',
    name: 'Tenant',
    phone: '0501234567',
    pin: '4567',
    building: 'Building A',
    buildingNumber: 'A',
    apartment: 'A1',
    floor: 0,
    parking: '',
    leaseEnd: '30 Dec 2026',
    leaseStart: '15/11/2025',
    rentAmount: 2500,
    currency: 'AED',
    rentDueDay: 1,
    rentSchedule: 1,
    contractTotal: 30_000,
    amountPaid: 0,
    status: 'arrears',
    ...overrides,
  }
}

describe('rent paid through month', () => {
  it('counts monthly installments through July 2026', () => {
    const resident = sampleResident()
    expect(installmentCountThroughMonth(resident, 2026, 7)).toBe(9)
    expect(amountDueThroughMonth(resident, 2026, 7)).toBe(22_500)
  })

  it('marks residents and invoices paid through July', () => {
    const resident = sampleResident()
    const invoiceMap: Record<string, Invoice[]> = {
      'apt-a1': [
        {
          id: 'INV-A1-202607',
          period: 'Jul 2026',
          amount: 2500,
          dueDateIso: '2026-07-01',
          dueDate: '1 Jul 2026',
          status: 'due',
        },
        {
          id: 'INV-A1-202608',
          period: 'Aug 2026',
          amount: 2500,
          dueDateIso: '2026-08-01',
          dueDate: '1 Aug 2026',
          status: 'due',
        },
      ],
    }

    const fixed = applyRentPaidThroughMonth([resident], invoiceMap, ['INV-A1-202607'], 2026, 7)
    expect(fixed.residentList[0].amountPaid).toBe(22_500)
    expect(fixed.residentList[0].nextDueDateIso).toBe('2026-08-01')
    expect(fixed.residentList[0].status).toBe('active')
    expect(fixed.invoiceMap['apt-a1']).toHaveLength(1)
    expect(fixed.invoiceMap['apt-a1'][0].id).toBe('INV-A1-202608')
    expect(fixed.invoiceMap['apt-a1'][0].status).toBe('due')
    expect(fixed.paidIds).not.toContain('INV-A1-202607')
  })

  it('does not change amountPaid when amountPaidManual is set', () => {
    const resident = sampleResident({ amountPaid: 5000, amountPaidManual: true })
    const fixed = applyRentPaidThroughMonth([resident], {}, [], 2026, 7)
    expect(fixed.residentList[0].amountPaid).toBe(5000)
  })

  it('derives next due date from lease start after paid-through month', () => {
    const resident = sampleResident()
    expect(leaseInstallmentDueIso(resident, 8)).toBe('2026-07-01')
    expect(leaseInstallmentDueIso(resident, 9)).toBe('2026-08-01')
  })
})
