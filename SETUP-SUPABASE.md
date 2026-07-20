# Supabase setup (sync phone + laptop)

MLIHrents stores building data in **Supabase** so admin changes on one device appear on all others.

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
2. Add both variables for **Production** (and Preview if you use preview deploys).
3. **Redeploy** the site (Deployments → ⋯ → Redeploy).

## 5. Local development (optional)

Create `.env.local` in the project root:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

Restart `npm run dev` after adding env vars.

## How it works

- First device with existing browser data **uploads** it to Supabase automatically.
- Other devices **download** the same tenants, logins, payments, and listings.
- Changes sync within ~1 second (realtime + save debounce).
- If Supabase is not configured, the app falls back to browser-only storage (old behaviour).

## Security note

The current setup uses open read/write on the sync table for simplicity (single-building internal tool). For stricter access, add Supabase Auth or row-level rules later.
