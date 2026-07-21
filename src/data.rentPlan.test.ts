import { describe, expect, it } from 'vitest'
import { blankResident, canCollectRent, hasRentPlan } from './data'

describe('rent plan helpers', () => {
  it('requires contract total and installment', () => {
    expect(hasRentPlan({ ...blankResident, contractTotal: 10_000, rentAmount: 2_500 })).toBe(true)
    expect(hasRentPlan({ ...blankResident, contractTotal: 0, rentAmount: 2_500 })).toBe(false)
    expect(hasRentPlan({ ...blankResident, contractTotal: 10_000, rentAmount: 0 })).toBe(false)
  })

  it('blocks collection when fully paid or plan missing', () => {
    expect(
      canCollectRent({
        ...blankResident,
        contractTotal: 10_000,
        amountPaid: 10_000,
        rentAmount: 2_500,
      }),
    ).toBe(false)
    expect(
      canCollectRent({
        ...blankResident,
        contractTotal: 0,
        amountPaid: 0,
        rentAmount: 0,
        rentSchedule: 4,
      }),
    ).toBe(false)
    expect(
      canCollectRent({
        ...blankResident,
        contractTotal: 10_000,
        amountPaid: 5_000,
        rentAmount: 2_500,
      }),
    ).toBe(true)
  })
})
