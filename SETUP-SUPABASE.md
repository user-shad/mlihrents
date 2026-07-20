# Supabase setup (sync phone + laptop)

MLIHrent stores building data in **Supabase** so admin changes on one device appear on all others.

## 1. Create a free Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up.
2. **New project** → pick a name and password → create.

## 2. Run the database schema

1. In Supabase: **SQL Editor** → **New query**.
2. Paste the contents of [`supabase/schema.sql`](./schema.sql).
3. Click **Run**.

## 3. Get API keys

1. Supabase → **Project Settings** → **API**.
2. Copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`

## 4. Add keys to Vercel

1. Vercel → your **mlihrents** project → **Settings** → **Environment Variables**.
2. Add these for **Production** (server-side — no `VITE_` prefix required):

| Name | Value |
|------|--------|
| `SUPABASE_URL` | Project URL from Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | **service_role** key (keep secret) |

Optional (direct browser sync + realtime):

| Name | Value |
|------|--------|
| `VITE_SUPABASE_URL` | Same Project URL |
| `VITE_SUPABASE_ANON_KEY` | **anon public** key |

3. **Redeploy** the site (Deployments → ⋯ → Redeploy).

After redeploy, Admin sidebar should show **Cloud sync active**. If it says **Local only**, the keys are missing or the SQL schema was not run.

## 5. Local development (optional)

Create `.env.local` in the project root:

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

Restart `npm run dev` after adding env vars.

## How it works

- First device with existing browser data **uploads** it to Supabase automatically.
- Other devices **download** the same tenants, logins, payments, and listings.
- Changes sync within ~1 second (realtime + save debounce).
- If Supabase is not configured, the app falls back to browser-only storage (old behaviour).

## Security note

The current setup uses open read/write on the sync table for simplicity (single-building internal tool). For stricter access, add Supabase Auth or row-level rules later.
