# Enable phone + laptop sync (5 minutes)

The app needs **cloud storage** on Vercel. Without it, each browser keeps its own copy (phone ≠ laptop).

## Option A — Vercel Blob (easiest, recommended)

1. Open [vercel.com](https://vercel.com) → your **mlihrents** project
2. Go to **Storage** tab → **Create Database** → **Blob**
3. Name it (e.g. `mlihrents-sync`) → **Create** → **Connect** to your project
4. **Deployments** → latest deploy → **⋯** → **Redeploy**
5. Open **www.mlaihrent.com/staff** → sidebar should say **Cloud sync active**

No API keys to copy — Vercel adds `BLOB_READ_WRITE_TOKEN` automatically.

---

## Option B — Supabase

See [SETUP-SUPABASE.md](./SETUP-SUPABASE.md) if you prefer Supabase.

---

## Verify it works

1. On **phone**: Admin → Info → add a tenant + login info → wait 5 seconds
2. On **laptop**: refresh Admin → same tenant should appear
3. If sidebar still says **Local only**, storage is not connected — redo steps above and **Redeploy**

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| **Local only** in admin sidebar | Blob or Supabase not connected; redeploy after adding storage |
| Data on phone, empty on laptop | Cloud sync was off when data was created; re-enter on phone after sync is active |
| **500 error** on sync | Supabase: run `supabase/schema.sql` in SQL Editor |
