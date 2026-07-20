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

Optional later: connect your own domain (`mlihrents.ae`) in Vercel → **Domains**.

`vercel.json` is already in the project so React Router routes (`/login`, `/admin`, etc.) work on refresh.

**Note:** Data is still stored in each visitor’s browser for now. A shared database can come after the site is live.

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

| Who | Phone | Password |
|-----|-------|----------|
| Sample resident (Sara) | `0545882666` | `7423` |
| Sample resident (Omar) | `0558821044` | `5510` |
| Staff (bootstrap) | `0500000000` | `1234` |

Resident CSV template: `public/templates/residents-sample.csv` (also downloadable from Admin → register section).

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
- Payments: **bank transfer** (admin verification) or **Apple Pay / card** via Stripe Checkout  
- Maintenance tickets  
- MLIH AI chat + human handoff + service numbers  
- English / Arabic (RTL)  
- Available apartments on the public homepage  

## Apple Pay (Stripe)

Real Apple Pay uses [Stripe Checkout](https://stripe.com). Add these in **Vercel → Project → Settings → Environment Variables**:

| Variable | Where |
|----------|--------|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → API keys (secret) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard → API keys (publishable) |

Redeploy after saving. Residents choose **Apple Pay** at checkout — on iPhone/Safari, Apple Pay appears on the Stripe page.

Test card: `4242 4242 4242 4242` · any future expiry · any CVC.

## Next (real backend)

- Database for residents, leases, invoices  
- SMS OTP provider  
