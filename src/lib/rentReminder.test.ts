import { describe, expect, it } from 'vitest'
import {
  isRentReminderDue,
  rentReminderLogKey,
  residentsForRentReminder,
  wasRentReminderSent,
} from '../../lib/rentReminder'

describe('rent reminder due', () => {
  const resident = {
    id: 'apt-a1',
    name: 'Tenant',
    phone: '0501234567',
    apartment: 'A1',
    contractTotal: 28_800,
    amountPaid: 0,
    rentAmount: 2400,
    nextDueDateIso: '2026-08-01',
  }

  it('is due on the due date', () => {
    expect(isRentReminderDue(resident, new Date(2026, 7, 1))).toBe(true)
  })

  it('lists due residents', () => {
    const list = residentsForRentReminder([resident], new Date(2026, 7, 5))
    expect(list).toHaveLength(1)
  })

  it('tracks reminder log per month', () => {
    const key = rentReminderLogKey('apt-a1', '2026-08-01')
    expect(key).toBe('apt-a1:2026-08')
    expect(wasRentReminderSent(resident, { [key]: '2026-08-01T09:00:00.000Z' })).toBe(true)
  })
})
