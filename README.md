# MLIHrent

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

Production site: **[https://www.mlaihrent.com](https://www.mlaihrent.com)**

| Who | URL |
|-----|-----|
| Public / listings | `https://www.mlaihrent.com/` |
| Residents | `https://www.mlaihrent.com/login` |
| Staff | `https://www.mlaihrent.com/staff` |

`vercel.json` redirects old domains and `mlaihrent.com` (non-www) to `www.mlaihrent.com`.

**After domain connect:** change default staff passwords in **Admin → sidebar**, add tenants under **Info**, and set your trade licence in `src/legal/siteLegal.ts`.

`vercel.json` is already in the project so React Router routes (`/login`, `/admin`, etc.) work on refresh.

**Note:** Cross-device sync requires cloud storage. See **[SETUP-SYNC.md](./SETUP-SYNC.md)** (Vercel Blob — 5 min setup).

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
| Bo 3baid (admin) | `0553262626` | `1989` |
| Kalban (staff) | `0505001021` | `3004` |
| Mosa (admin) | `0529999799` | `1988` |
| Mohammed (admin) | `0503262626` | `1983` |

Residents are created by staff in **Admin → Info** — assign phone number and 4-digit password before the tenant can sign in.

Buildings **A–D** · 36 units (A0–A12, B1–B8, C1–C7, D1–D8).

## Sample site (another domain, isolated data)

See **[SETUP-SAMPLE-SITE.md](./SETUP-SAMPLE-SITE.md)** to deploy a demo copy on a new Vercel project without affecting www.mlihrent.com.

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
