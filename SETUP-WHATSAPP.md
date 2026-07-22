# Automatic WhatsApp messages

Send rent reminders and payment updates automatically via the **WhatsApp Cloud API** (Meta).

Manual “Send rent reminder” buttons still work (opens WhatsApp on your phone). This guide is for **server-side automatic** messages.

## 1. Meta WhatsApp Business setup

1. Create a [Meta Developer](https://developers.facebook.com/) app
2. Add **WhatsApp** product → **API Setup**
3. Add a **WhatsApp Business** phone number (or use Meta’s test number while developing)
4. Copy:
   - **Temporary or permanent access token** → `WHATSAPP_ACCESS_TOKEN`
   - **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`

## 2. Vercel environment variables

In Vercel → **mlihrents** → **Settings** → **Environment Variables**:

| Variable | Example |
|----------|---------|
| `WHATSAPP_ACCESS_TOKEN` | Meta Graph API token |
| `WHATSAPP_PHONE_NUMBER_ID` | `123456789012345` |
| `WHATSAPP_BRAND_NAME` | `MLIH Rents` (optional) |
| `PUBLIC_SITE_URL` | `https://www.mlihrent.com` (optional) |
| `CRON_SECRET` | Random string (Vercel may add this for cron) |

Redeploy after saving.

## 3. Add test recipients (development)

In Meta Developer → WhatsApp → **API Setup**, add resident phone numbers as **test recipients** while the app is in development mode.

## 4. What runs automatically

| Trigger | When |
|---------|------|
| **Daily cron** | 9:00 AM UAE time — rent reminders for units with due/overdue rent |
| **Payment approved/rejected** | Right after admin confirms or rejects a bank transfer (if WhatsApp is configured) |
| **Admin “Send due reminders now”** | Manual run from Payments tab |

Each unit gets **one rent reminder per due month** (tracked in cloud sync).

## 5. Message rules

- Bilingual **English + Arabic** (same as manual reminders)
- Only occupied units with a phone number and open rent balance
- Sent on the due date or up to **30 days overdue**
- Skips units already reminded for that month

## 6. Important Meta limits

- **Development mode**: only messages to registered test numbers
- **Production**: may require **approved message templates** for outbound messages outside the 24-hour chat window
- If sends fail with “template required”, create a utility template in Meta Business Manager and contact support to wire it up

## 7. Verify

1. Add your phone as a test recipient in Meta
2. Set env vars and redeploy
3. Admin → **Payments** → **Automatic WhatsApp** → **Send due reminders now**
4. Check response toast and Meta WhatsApp Manager → **Message insights**

## Troubleshooting

| Error | Fix |
|-------|-----|
| `whatsapp_not_configured` | Set token + phone number ID on Vercel → redeploy |
| `#131030 Recipient not in allowed list` | Add number as test recipient (dev mode) |
| `#131047 Re-engagement message` | Need approved template for production outbound |
| Cron not running | Check Vercel → Project → **Cron Jobs** tab |
