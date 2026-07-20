/** Bank account where residents send rent transfers. Configure in Admin → Payments. */
export interface BankAccountSettings {
  accountName: string
  bankName: string
  iban: string
  accountNumber: string
  swift: string
}

export const emptyBankSettings: BankAccountSettings = {
  accountName: '',
  bankName: '',
  iban: '',
  accountNumber: '',
  swift: '',
}

export function isBankConfigured(settings: BankAccountSettings) {
  return Boolean(settings.accountName.trim() && settings.bankName.trim() && settings.iban.trim())
}

export function bankSummary(settings: BankAccountSettings) {
  const iban = settings.iban.replace(/\s/g, '').toUpperCase()
  const last4 = iban.slice(-4) || settings.accountNumber.slice(-4) || '****'
  return `${settings.bankName.trim()} · IBAN ···${last4}`
}
