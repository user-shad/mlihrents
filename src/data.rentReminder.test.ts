import { describe, expect, it } from 'vitest'
import { blankResident, buildRentReminderWhatsAppMessage } from './data'

describe('buildRentReminderWhatsAppMessage', () => {
  it('includes English and Arabic in one message', () => {
    const resident = {
      ...blankResident,
      id: 'r1',
      name: 'Sara Ali',
      apartment: '101',
      building: 'Tower A',
      buildingNumber: '1',
      contractTotal: 10_000,
      amountPaid: 5_000,
      rentAmount: 2_500,
    }
    const message = buildRentReminderWhatsAppMessage(
      resident,
      [
        {
          id: 'INV-001',
          period: 'Mar 2026',
          amount: 2_500,
          dueDate: '1 Apr 2026',
          status: 'due',
        },
      ],
      'https://www.mlihrent.com/resident',
    )
    expect(message).toContain('Hello Sara Ali')
    expect(message).toContain('مرحباً Sara Ali')
    expect(message).toContain('———')
  })
})
