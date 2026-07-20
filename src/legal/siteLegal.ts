/** Site identity for public disclosures. */
export const siteLegal = {
  brandName: 'MLIHrent',
  legalName: 'LULWA MLIH REAL ESTATE - SOLE PROPRIETORSHIP L.L.C.',
  tradeLicenseNumber: '[Insert UAE Trade License No.]',
  licensedEmirate: 'Abu Dhabi, United Arab Emirates',
  registeredAddress: 'Etihad Airways Centre, 5th Floor, Abu Dhabi, United Arab Emirates',
  contactEmail: 'legal@mlihrent.com',
  supportEmail: 'support@mlihrent.com',
  phone: '+971 4 000 0000',
  dataProtectionContact: 'privacy@mlihrent.com',
  governingLaw: 'Laws of the United Arab Emirates',
  disputeVenue: 'Courts of Abu Dhabi, United Arab Emirates',
  lastUpdated: '20 July 2026',
  primaryDomain: 'www.mlihrent.com',
  publicUrl: 'https://www.mlihrent.com',
  suggestedDomains: ['mlihrent.com', 'www.mlihrent.com'],
}

export function isTradeLicenseConfigured() {
  const n = siteLegal.tradeLicenseNumber.trim()
  return Boolean(n && !n.startsWith('[Insert'))
}
