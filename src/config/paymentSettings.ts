/** Bank account where residents send rent transfers. Configure in Admin → Payments. */
export interface BankAccountSettings {
  accountName: string
  bankName: string
  iban: string
  accountNumber: string
  swift: string
  bankAddress: string
}

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

export function readBankSettings(fallback?: BankAccountSettings | null): BankAccountSettings {
  try {
    const raw = localStorage.getItem(BANK_SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as BankAccountSettings
      if (parsed && typeof parsed === 'object') {
        const normalized = normalizeBankSettings({
          ...emptyBankSettings,
          ...parsed,
        })
        if (isBankConfigured(normalized)) return normalized
      }
    }
  } catch {
    /* ignore */
  }
  if (fallback && isBankConfigured(fallback)) {
    return normalizeBankSettings({ ...emptyBankSettings, ...fallback })
  }
  return { ...defaultBankSettings }
}

export function writeBankSettings(settings: BankAccountSettings): boolean {
  try {
    localStorage.setItem(BANK_SETTINGS_KEY, JSON.stringify(normalizeBankSettings(settings)))
    return true
  } catch {
    return false
  }
}
