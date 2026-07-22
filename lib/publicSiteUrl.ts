/** Shared public URL for server-side links (WhatsApp, cron). */
export function serverPublicSiteUrl(): string {
  const explicit = process.env.PUBLIC_SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  const vercel = process.env.VERCEL_URL?.trim()
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '').replace(/\/$/, '')}`
  return 'https://www.mlihrent.com'
}
