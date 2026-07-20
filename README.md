# MLIHrents

Residential portal for rent, maintenance, AI support, and building operations.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (e.g. http://localhost:5174).

## Make the website public (Vercel)

Fastest free option:

1. Create a free account at [vercel.com](https://vercel.com) (GitHub login is easiest).
2. Put this project on GitHub (new repo → upload or `git push`).
3. In Vercel: **Add New Project** → import that GitHub repo.
4. Leave settings as default (Vite is auto-detected) → **Deploy**.
5. You get a public URL like `https://mlihrents.vercel.app`.

## Custom domain (live)

Production site: **[https://www.mlihrents.com](https://www.mlihrents.com)**

| Who | URL |
|-----|-----|
| Public / listings | `https://www.mlihrents.com/` |
| Residents | `https://www.mlihrents.com/login` |
| Staff | `https://www.mlihrents.com/staff` |

`vercel.json` redirects `mlihrents.com` (non-www) and `mlihrents.vercel.app` to `www.mlihrents.com`.

**After domain connect:** change default staff passwords in **Admin → sidebar**, add tenants under **Info**, and set your trade licence in `src/legal/siteLegal.ts`.

`vercel.json` is already in the project so React Router routes (`/login`, `/admin`, etc.) work on refresh.

**Note:** With Supabase configured (see [SETUP-SUPABASE.md](./SETUP-SUPABASE.md)), data syncs across all devices. Without it, data stays in each browser only.

## Production build

```bash
npm run build
npm run preview
```

## Routes

| Path | Who |
|------|-----|
| `/` | Public landing + available apartments |
| `/login` | Resident phone login |
| `/staff` | Staff / admin login only |
| `/app` | Resident portal (residents only) |
| `/admin` | Building operations (staff only) |

Residents cannot open `/admin`. Staff are redirected away from `/app`.

## Login

Staff bootstrap accounts (change passwords after first sign-in):

| Role | Phone | Password |
|------|-------|----------|
| Building Admin | `0500000000` | `1234` |
| Operations Manager | `0501111111` | `5678` |

Residents are created by staff in **Admin → Info** — assign phone number and 4-digit password before the tenant can sign in.

Buildings **A–D** · 36 units (A0–A12, B1–B8, C1–C7, D1–D8).

## UAE domain & compliance

See **[COMPLIANCE-UAE.md](./COMPLIANCE-UAE.md)** for domain registration (`.ae`), trade licence, PDPL, and RERA notes.

Public legal pages:
- `/privacy` — Privacy Policy (UAE PDPL-oriented)
- `/terms` — Terms of Use (UAE / Dubai courts)
- `/cookies` — Cookie Policy

Fill in real company details in `src/legal/siteLegal.ts` before go-live, then have a UAE lawyer review.

## Features

- Phone-linked apartment profiles  
- Rent schedules (monthly / quarterly / 6 months / yearly / full lease) + remaining balance  
- Payments: **bank transfer** (admin verification)  
- Maintenance tickets  
- MLIH AI chat + human handoff + service numbers  
- English / Arabic (RTL)  
- Available apartments on the public homepage  

## Next (real backend)

- Database for residents, leases, invoices  
- SMS OTP provider  
