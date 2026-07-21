import { describe, expect, it } from 'vitest'
import { blankResident, buildRentReminderWhatsAppMessage } from './data'

describe('buildRentReminderWhatsAppMessage', () => {
  it('matches the bilingual reminder format', () => {
    const resident = {
      ...blankResident,
      id: 'apt-a0',
      name: 'Norbeth Jean Acollador De Leon',
      apartment: 'A0',
      building: 'Building A',
      buildingNumber: 'A',
      contractTotal: 28_800,
      amountPaid: 0,
      rentAmount: 2_400,
      rentDueDay: 25,
    }
    const invoices = [
      {
        id: 'INV-A0-202607',
        period: 'Jul 2026',
        amount: 2_400,
        dueDate: '25 Jul 2026',
        dueDateIso: '2026-07-25',
        status: 'due' as const,
      },
    ]
    const message = buildRentReminderWhatsAppMessage(
      resident,
      invoices,
      'https://www.mlihrent.com/resident',
      'MLIHrent',
    )
    expect(message).toContain(
      'Hello Norbeth Jean Acollador De Leon,\n\nThis is a rent reminder from MLIHrent for unit A0.\n\nPay via the resident portal:\nhttps://www.mlihrent.com/resident\n\nThank you.',
    )
    expect(message).toContain('فاتورة Jul 2026 Jul 2026.')
    expect(message).toContain('———')
    expect(message).not.toContain('Remaining balance')
  })
})
