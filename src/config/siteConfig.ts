/** Site identity — defaults match production MLIHrent; override via Vite env for sample deployments. */

function env(key: string): string | undefined {
  const value = (import.meta.env[key as keyof ImportMetaEnv] as string | undefined)?.trim()
  return value || undefined
}

export type SiteProfile = 'production' | 'sample'

export interface SiteLegal {
  brandName: string
  legalName: string
  tradeLicenseNumber: string
  licensedEmirate: string
  registeredAddress: string
  phone: string
  governingLaw: string
  disputeVenue: string
  lastUpdated: string
  primaryDomain: string
  publicUrl: string
  suggestedDomains: string[]
}

const PRODUCTION_LEGAL: SiteLegal = {
  brandName: 'MLIHrent',
  legalName: 'LULWA MLIH REAL ESTATE - SOLE PROPRIETORSHIP L.L.C.',
  tradeLicenseNumber: '[Insert UAE Trade License No.]',
  licensedEmirate: 'Abu Dhabi, United Arab Emirates',
  registeredAddress: 'Etihad Airways Centre, 5th Floor, Abu Dhabi, United Arab Emirates',
  phone: '+971 4 000 0000',
  governingLaw: 'Laws of the United Arab Emirates',
  disputeVenue: 'Courts of Abu Dhabi, United Arab Emirates',
  lastUpdated: '20 July 2026',
  primaryDomain: 'www.mlihrent.com',
  publicUrl: 'https://www.mlihrent.com',
  suggestedDomains: ['mlihrent.com', 'www.mlihrent.com'],
}

const SAMPLE_LEGAL: SiteLegal = {
  brandName: 'Sample Rents',
  legalName: 'Sample Property Management Demo L.L.C.',
  tradeLicenseNumber: '[Demo — not a live licence]',
  licensedEmirate: 'Abu Dhabi, United Arab Emirates',
  registeredAddress: 'Demo address — sample site only',
  phone: '+971 50 000 0000',
  governingLaw: 'Laws of the United Arab Emirates',
  disputeVenue: 'Courts of Abu Dhabi, United Arab Emirates',
  lastUpdated: '22 July 2026',
  primaryDomain: 'sample-rents.vercel.app',
  publicUrl: 'https://sample-rents.vercel.app',
  suggestedDomains: ['sample-rents.vercel.app'],
}

function resolveProfile(): SiteProfile {
  const raw = env('VITE_SITE_PROFILE')?.toLowerCase()
  return raw === 'sample' ? 'sample' : 'production'
}

function resolveLegal(profile: SiteProfile): SiteLegal {
  const base = profile === 'sample' ? SAMPLE_LEGAL : PRODUCTION_LEGAL
  const publicUrl = env('VITE_PUBLIC_SITE_URL') ?? base.publicUrl
  let primaryDomain = env('VITE_PRIMARY_DOMAIN') ?? base.primaryDomain
  if (!env('VITE_PRIMARY_DOMAIN') && env('VITE_PUBLIC_SITE_URL')) {
    try {
      primaryDomain = new URL(publicUrl).host
    } catch {
      primaryDomain = base.primaryDomain
    }
  }
  return {
    ...base,
    brandName: env('VITE_SITE_BRAND') ?? base.brandName,
    legalName: env('VITE_SITE_LEGAL_NAME') ?? base.legalName,
    tradeLicenseNumber: env('VITE_SITE_TRADE_LICENSE') ?? base.tradeLicenseNumber,
    phone: env('VITE_SITE_PHONE') ?? base.phone,
    registeredAddress: env('VITE_SITE_ADDRESS') ?? base.registeredAddress,
    primaryDomain,
    publicUrl,
    suggestedDomains: env('VITE_SITE_DOMAINS')?.split(',').map((d) => d.trim()).filter(Boolean) ?? [
      primaryDomain,
    ],
  }
}

const profile = resolveProfile()
const legal = resolveLegal(profile)

export const siteConfig = {
  profile,
  isSample: profile === 'sample',
  legal,
  /** Landing hero — first segment + accent (e.g. MLIH + rent). */
  heroTitle: env('VITE_SITE_HERO_TITLE') ?? (profile === 'sample' ? 'Sample' : 'MLIH'),
  heroAccent: env('VITE_SITE_HERO_ACCENT') ?? (profile === 'sample' ? 'Rents' : 'rent'),
  pageTitle:
    env('VITE_SITE_PAGE_TITLE') ??
    (profile === 'sample' ? 'Sample Rents — Demo portal' : 'MLIHrent — Rent, simplified'),
  pageDescription:
    env('VITE_SITE_PAGE_DESCRIPTION') ??
    (profile === 'sample'
      ? 'Demo property management portal — separate from MLIHrent production.'
      : 'MLIHrent — professional property management for Buildings A–D. Residents pay rent, report maintenance, and get building support online.'),
}

export function isTradeLicenseConfigured() {
  const n = siteConfig.legal.tradeLicenseNumber.trim()
  return Boolean(n && !n.startsWith('[Insert') && !n.startsWith('[Demo'))
}
