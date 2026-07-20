/** Bank account where residents send rent transfers. Configure in Admin → Payments. */
export interface BankAccountSettings {
  accountName: string
  bankName: string
  iban: string
  accountNumber: string
  swift: string
  bankAddress: string
}

type StoredBankSettings = BankAccountSettings & { adminSaved?: boolean }

export const BANK_SETTINGS_KEY = 'mlihrents_bank_settings'

/** Pre-configured building account — shown on the live site for all users. */
export const defaultBankSettings: BankAccountSettings = {
  accountName: 'LULWA MLIH REAL ESTATE - SOLE PROPRIETORSHIP L.L.C.',
  bankName: 'Wio Bank',
  iban: 'AE420860000009057845637',
  accountNumber: '9057845637',
  swift: 'WIOBAEADXXX',
  bankAddress: 'Etihad Airways Centre 5th Floor, Abu Dhabi, UAE',
}

export const emptyBankSettings: BankAccountSettings = {
  accountName: '',
  bankName: '',
  iban: '',
  accountNumber: '',
  swift: '',
  bankAddress: '',
}

export function normalizeBankSettings(settings: BankAccountSettings): BankAccountSettings {
  return {
    accountName: settings.accountName.trim(),
    bankName: settings.bankName.trim(),
    iban: settings.iban.replace(/\s/g, '').toUpperCase(),
    accountNumber: settings.accountNumber.trim(),
    swift: settings.swift.trim().toUpperCase(),
    bankAddress: settings.bankAddress.trim(),
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

/** Use site defaults unless an admin explicitly saved custom details. */
export function readBankSettings(): BankAccountSettings {
  try {
    const raw = localStorage.getItem(BANK_SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as StoredBankSettings
      if (parsed?.adminSaved && isBankConfigured(parsed)) {
        return normalizeBankSettings(parsed)
      }
    }
  } catch {
    /* ignore */
  }
  return { ...defaultBankSettings }
}

export function writeBankSettings(settings: BankAccountSettings): boolean {
  try {
    const payload: StoredBankSettings = {
      ...normalizeBankSettings(settings),
      adminSaved: true,
    }
    localStorage.setItem(BANK_SETTINGS_KEY, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}
