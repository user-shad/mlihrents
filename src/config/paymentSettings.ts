/** Bank account where residents send rent transfers. Configure in Admin → Payments. */
export interface BankAccountSettings {
  accountName: string
  bankName: string
  iban: string
  accountNumber: string
  swift: string
}

export const BANK_SETTINGS_KEY = 'mlihrents_bank_settings'

export const emptyBankSettings: BankAccountSettings = {
  accountName: '',
  bankName: '',
  iban: '',
  accountNumber: '',
  swift: '',
}

export function normalizeBankSettings(settings: BankAccountSettings): BankAccountSettings {
  return {
    accountName: settings.accountName.trim(),
    bankName: settings.bankName.trim(),
    iban: settings.iban.replace(/\s/g, '').toUpperCase(),
    accountNumber: settings.accountNumber.trim(),
    swift: settings.swift.trim().toUpperCase(),
  }
}

export function isBankConfigured(settings: BankAccountSettings) {
  const normalized = normalizeBankSettings(settings)
  return Boolean(normalized.accountName && normalized.bankName && normalized.iban)
}

export function bankSummary(settings: BankAccountSettings) {
  const normalized = normalizeBankSettings(settings)
  const last4 = normalized.iban.slice(-4) || normalized.accountNumber.slice(-4) || '****'
  return `${normalized.bankName} · IBAN ···${last4}`
}

export function readBankSettings(fallback?: BankAccountSettings | null): BankAccountSettings {
  try {
    const raw = localStorage.getItem(BANK_SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as BankAccountSettings
      if (parsed && typeof parsed === 'object') {
        return normalizeBankSettings(parsed)
      }
    }
  } catch {
    /* ignore */
  }
  if (fallback) {
    const migrated = normalizeBankSettings(fallback)
    writeBankSettings(migrated)
    return migrated
  }
  return { ...emptyBankSettings }
}

export function writeBankSettings(settings: BankAccountSettings): boolean {
  try {
    localStorage.setItem(BANK_SETTINGS_KEY, JSON.stringify(normalizeBankSettings(settings)))
    return true
  } catch {
    return false
  }
}
