/** Site identity for public disclosures. */
export const siteLegal = {
  brandName: 'MLIHrent',
  legalName: 'LULWA MLIH REAL ESTATE - SOLE PROPRIETORSHIP L.L.C.',
  tradeLicenseNumber: '[Insert UAE Trade License No.]',
  licensedEmirate: 'Abu Dhabi, United Arab Emirates',
  registeredAddress: 'Etihad Airways Centre, 5th Floor, Abu Dhabi, United Arab Emirates',
  contactEmail: 'legal@mlaihrent.com',
  supportEmail: 'support@mlaihrent.com',
  phone: '+971 4 000 0000',
  dataProtectionContact: 'privacy@mlaihrent.com',
  governingLaw: 'Laws of the United Arab Emirates',
  disputeVenue: 'Courts of Abu Dhabi, United Arab Emirates',
  lastUpdated: '20 July 2026',
  primaryDomain: 'www.mlaihrent.com',
  publicUrl: 'https://www.mlaihrent.com',
  suggestedDomains: ['mlaihrent.com', 'www.mlaihrent.com'],
}

export function isTradeLicenseConfigured() {
  const n = siteLegal.tradeLicenseNumber.trim()
  return Boolean(n && !n.startsWith('[Insert'))
}
