# Sample site (separate domain, no impact on MLIHrent)

Run a **demo copy** of this portal on another domain or Vercel URL. Production **mlihrent.com** is unchanged unless you deploy with `VITE_SITE_PROFILE=sample` there (do not do that on the live project).

## What stays separate

| Item | Production (mlihrent) | Sample site |
|------|------------------------|-------------|
| Domain | www.mlihrent.com | Your new domain / `*.vercel.app` |
| Tenant & payment data | Production Redis/Blob | **New** storage connection |
| Sync token | Production `SYNC_API_TOKEN` | **New** random token |
| Branding | MLIHrent | Sample Rents (configurable) |

## Quick setup (≈15 minutes)

1. **Vercel** → **Add New Project** → import the same GitHub repo (`mlihrents`).
2. Name it e.g. `sample-rents` (not the existing mlihrents project).
3. **Settings → Environment Variables** — copy from [`env.sample.example`](./env.sample.example):
   - `VITE_SITE_PROFILE` = `sample`
   - `VITE_PUBLIC_SITE_URL` / `PUBLIC_SITE_URL` = your new URL (e.g. `https://sample-rents.vercel.app`)
   - New `SYNC_API_TOKEN` + matching `VITE_SYNC_API_TOKEN`
4. **Storage** → connect **new** Redis or Blob on this project only ([SETUP-SYNC.md](./SETUP-SYNC.md)).
5. **Deploy**.
6. Optional: **Settings → Domains** → add your custom domain.

## Verify isolation

- Open the sample URL — you should see an orange **“Demo site”** banner at the top.
- Admin sync health should show the **sample** storage backend, not production.
- Changes on sample must **not** appear on www.mlihrent.com.

## Custom branding (optional)

| Variable | Example |
|----------|---------|
| `VITE_SITE_BRAND` | `Sunset Towers` |
| `VITE_SITE_HERO_TITLE` | `Sunset` |
| `VITE_SITE_HERO_ACCENT` | `Towers` |
| `VITE_SITE_LEGAL_NAME` | Your company legal name |
| `VITE_SITE_PHONE` | `+971 50 123 4567` |

Leave unset on the **mlihrents** Vercel project — defaults remain MLIHrent.

## Local demo

```bash
cp env.sample.example .env.local
# Edit .env.local — set tokens and URLs
npm run dev
```

## Branch deploy (optional)

You can deploy branch `sample-site` to the sample Vercel project while **production keeps deploying `master`**.
