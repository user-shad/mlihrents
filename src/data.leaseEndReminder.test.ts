import { describe, expect, it } from 'vitest'
import {
  blankResident,
  buildLeaseEndReminderWhatsAppMessage,
  isLeaseEndReminderDue,
  leaseEndReminderOnDate,
  residentsForLeaseEndReminder,
} from './data'

describe('lease end reminders', () => {
  it('detects the 2-month-before reminder window', () => {
    const remindOn = leaseEndReminderOnDate('22 Sep 2026', 2)!
    expect(remindOn.getFullYear()).toBe(2026)
    expect(remindOn.getMonth()).toBe(6)
    expect(remindOn.getDate()).toBe(22)
    expect(isLeaseEndReminderDue('22 Sep 2026', 2, new Date('2026-07-22T12:00:00'))).toBe(true)
    expect(isLeaseEndReminderDue('22 Sep 2026', 2, new Date('2026-06-01T12:00:00'))).toBe(false)
  })

  it('lists occupied residents due for lease-end reminders', () => {
    const residents = [
      {
        ...blankResident,
        id: 'apt-a1',
        name: 'Sara',
        phone: '0500000001',
        apartment: 'A1',
        leaseEnd: '22 Sep 2026',
      },
      {
        ...blankResident,
        id: 'apt-a2',
        name: 'Omar',
        phone: '0500000002',
        apartment: 'A2',
        leaseEnd: '22 Dec 2026',
      },
    ]
    const due = residentsForLeaseEndReminder(residents, 2, new Date('2026-07-22T12:00:00'))
    expect(due.map((r) => r.apartment)).toEqual(['A1'])
  })

  it('builds bilingual WhatsApp lease-end reminder', () => {
    const message = buildLeaseEndReminderWhatsAppMessage(
      {
        ...blankResident,
        name: 'Sara',
        apartment: 'A1',
        buildingNumber: 'A',
        leaseEnd: '22 Sep 2026',
      },
      'https://www.mlihrent.com/resident',
      'MLIHrent',
    )
    expect(message).toContain('Your lease ends on 22 Sept 2026')
    expect(message).toContain('22 سبتمبر 2026')
    expect(message).toContain('———')
  })
})
