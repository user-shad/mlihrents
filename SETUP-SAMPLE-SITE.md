# Sample site (free Vercel URL — no custom domain)

Run a **demo copy** on Vercel’s free `https://your-project.vercel.app` address. You do **not** need to buy or connect a domain. Production **mlihrent.com** is unchanged.

## What stays separate

| Item | Production (mlihrent) | Sample site |
|------|------------------------|-------------|
| URL | www.mlihrent.com | `https://sample-rents.vercel.app` (example) |
| Tenant & payment data | Production Redis/Blob | **New** storage on the sample project |
| Sync token | Production token | **New** random token |

## Quick setup (≈10 minutes)

1. **Vercel** → **Add New Project** → import GitHub repo `mlihrents`.
2. Name it e.g. **`sample-rents`** (separate from the live mlihrents project).
3. **Environment Variables** — minimum required:

   | Variable | Value |
   |----------|--------|
   | `VITE_SITE_PROFILE` | `sample` |
   | `SYNC_API_TOKEN` | new random string |
   | `VITE_SYNC_API_TOKEN` | same as above |

   No domain or URL variables needed — the app uses the free `*.vercel.app` URL automatically.

4. **Storage** → connect **new** Redis or Blob ([SETUP-SYNC.md](./SETUP-SYNC.md)).
5. **Deploy** → open the URL Vercel gives you (e.g. `https://sample-rents.vercel.app`).

**Do not** add a custom domain unless you want one later. **Do not** set these env vars on the live mlihrents project.

## Verify

- Orange **“Demo site”** banner at the top
- Brand shows **Sample Rents**
- Changes on the sample URL do **not** appear on www.mlihrent.com

## Local demo

```bash
cp env.sample.example .env.local
# Set SYNC tokens in .env.local
npm run dev
```

Opens at `http://localhost:5173` with sample branding.
