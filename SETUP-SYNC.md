# Enable phone + laptop sync (5 minutes)

The app needs **cloud storage** on Vercel. Without it, each browser keeps its own copy (phone ≠ laptop).

## Option A — Vercel Blob (easiest, recommended)

1. Open [vercel.com](https://vercel.com) → your **mlihrents** project
2. Go to **Storage** tab → **Create Database** → **Blob**
3. Name it (e.g. `mlihrents-sync`) → **Create** → **Connect** to your project
4. **Deployments** → latest deploy → **⋯** → **Redeploy**
5. Open **www.mlaihrent.com/staff** → sidebar should say **Cloud sync active**

No API keys to copy — Vercel adds `BLOB_READ_WRITE_TOKEN` automatically.

## Option B — Upstash Redis (Vercel Marketplace)

1. Vercel → **Storage** → **Marketplace** → search **Upstash Redis**
2. Create → **Connect** to mlihrents → **Redeploy**
3. Vercel adds `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` automatically

## Option C — Supabase

See [SETUP-SUPABASE.md](./SETUP-SUPABASE.md) if you prefer Supabase.

---

## Verify it works

1. On **phone**: Admin → Info → add a tenant + login info → tap **Sync now**
2. On **laptop**: refresh Admin → same tenant should appear within ~10 seconds
3. If sidebar still says **Local only**, storage is not connected — redo steps above and **Redeploy**

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| **Local only** in admin sidebar | Blob or Redis not connected; redeploy after adding storage |
| Data on phone, empty on laptop | Tap **Sync now** on phone after cloud is active |
| **500 error** on sync | Payload too large — payment screenshots stay local; tenant data still syncs |
| **503** on sync | No storage connected — complete Option A or B above |
