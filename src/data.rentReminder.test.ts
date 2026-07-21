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
      'https://www.mlihrent.com/resident',
    )
    expect(message).toContain('Hello Sara Ali')
    expect(message).toContain('Remaining balance on your lease: AED 5,000')
    expect(message).not.toContain('invoice')
    expect(message).toContain('مرحباً Sara Ali')
    expect(message).toContain('———')
  })
})
