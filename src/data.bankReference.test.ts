import { describe, expect, it } from 'vitest'
import {
  findDuplicateBankReference,
  isValidBankReference,
  normalizeBankReferenceDigits,
  type PaymentRecord,
} from './data'

function samplePayment(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: 'pay-1',
    invoiceId: 'INV-001',
    residentId: 'r1',
    residentName: 'Test Resident',
    unit: 'A-101',
    amount: 5000,
    method: 'bank',
    status: 'settled',
    paidAt: '1 Jan 2026',
    destination: 'Wio',
    bankReference: '123456789',
    ...overrides,
  }
}

describe('bank reference helpers', () => {
  it('strips non-digits from bank references', () => {
    expect(normalizeBankReferenceDigits('REF 12-34 5678')).toBe('12345678')
  })

  it('accepts references with 6–15 digits', () => {
    expect(isValidBankReference('123456')).toBe(true)
    expect(isValidBankReference('123456789012345')).toBe(true)
    expect(isValidBankReference('12345')).toBe(false)
    expect(isValidBankReference('1234567890123456')).toBe(false)
  })

  it('finds duplicate references on active payments', () => {
    const payments = [
      samplePayment({ id: 'pay-1', bankReference: '987654321' }),
      samplePayment({ id: 'pay-2', bankReference: '111222333', status: 'pending_review' }),
    ]
    const dup = findDuplicateBankReference('111-222-333', payments)
    expect(dup?.id).toBe('pay-2')
  })

  it('ignores rejected, deleted, and excluded payments', () => {
    const payments = [
      samplePayment({ id: 'pay-rejected', bankReference: '555666777', status: 'rejected' }),
      samplePayment({ id: 'pay-deleted', bankReference: '888999000', status: 'deleted' }),
      samplePayment({ id: 'pay-self', bankReference: '444555666' }),
    ]
    expect(findDuplicateBankReference('555666777', payments)).toBeNull()
    expect(findDuplicateBankReference('888999000', payments)).toBeNull()
    expect(findDuplicateBankReference('444555666', payments, 'pay-self')).toBeNull()
  })
})
