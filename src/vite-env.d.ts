/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_SYNC_API_TOKEN?: string
  readonly VITE_SITE_PROFILE?: string
  readonly VITE_SITE_BRAND?: string
  readonly VITE_SITE_HERO_TITLE?: string
  readonly VITE_SITE_HERO_ACCENT?: string
  readonly VITE_PUBLIC_SITE_URL?: string
  readonly VITE_PRIMARY_DOMAIN?: string
  readonly VITE_SITE_LEGAL_NAME?: string
  readonly VITE_SITE_TRADE_LICENSE?: string
  readonly VITE_SITE_PHONE?: string
  readonly VITE_SITE_ADDRESS?: string
  readonly VITE_SITE_DOMAINS?: string
  readonly VITE_SITE_PAGE_TITLE?: string
  readonly VITE_SITE_PAGE_DESCRIPTION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
