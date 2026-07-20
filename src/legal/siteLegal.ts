/** Site identity for public disclosures. */
export const siteLegal = {
  brandName: 'MLIHrents',
  legalName: 'LULWA MLIH REAL ESTATE - SOLE PROPRIETORSHIP L.L.C.',
  tradeLicenseNumber: '[Insert UAE Trade License No.]',
  licensedEmirate: 'Abu Dhabi, United Arab Emirates',
  registeredAddress: 'Etihad Airways Centre, 5th Floor, Abu Dhabi, United Arab Emirates',
  contactEmail: 'legal@mlihrents.com',
  supportEmail: 'support@mlihrents.com',
  phone: '+971 4 000 0000',
  dataProtectionContact: 'privacy@mlihrents.com',
  governingLaw: 'Laws of the United Arab Emirates',
  disputeVenue: 'Courts of Abu Dhabi, United Arab Emirates',
  lastUpdated: '20 July 2026',
  primaryDomain: 'www.mlihrents.com',
  publicUrl: 'https://www.mlihrents.com',
  suggestedDomains: ['mlihrents.com', 'www.mlihrents.com'],
}

export function isTradeLicenseConfigured() {
  const n = siteLegal.tradeLicenseNumber.trim()
  return Boolean(n && !n.startsWith('[Insert'))
}
