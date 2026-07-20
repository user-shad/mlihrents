# UAE compliance & domain readiness (MLIHrents)

This checklist helps prepare MLIHrents for a UAE domain and lawful operation.  
**It is not legal advice.** Have a UAE-qualified lawyer and (if needed) a PRO / corporate services firm review before go-live.

## 1. Buy a domain

### Option A — `.ae` (recommended for local brand)
- Register through a **TDRA-accredited** registrar (see [TDRA / .aeDA](https://tdra.gov.ae/)).
- **Second-level** names like `MLIHrents.ae` are generally open to individuals and companies (local or overseas) with accurate registrant details.
- **Restricted** names like `co.ae`, `net.ae`, `org.ae`, `gov.ae` need specific eligibility documents (trade licence, etc.).
- Provide **true WhoIs / registrant contact** data and keep it updated.

### Option B — `.com` / other gTLD
- Faster internationally; still host and operate under UAE rules if you serve UAE residents.

Suggested names in `src/legal/siteLegal.ts`: `MLIHrents.ae`, `MLIHrents.com`.

## 2. Company & licences (operating the business)

Before collecting rent or marketing units commercially in the UAE, typically you need:

| Item | Why |
|------|-----|
| UAE trade licence (mainland / free zone) | Legal entity on contracts, invoices, domain WHOIS |
| Correct licence activity | Property management / IT / software — match what you actually do |
| Emirate real-estate rules | Dubai: DLD / RERA if you act as broker or manage units; other emirates have their own regulators |
| Corporate bank account | Receive rent / merchant payouts |
| Payment provider | Local acquirer with UAE merchant onboarding + invoices/VAT if applicable |
| Tax | Corporate tax / VAT registration when thresholds apply (consult an accountant) |

Update placeholders in `src/legal/siteLegal.ts` with your real legal name, licence number, and address.

## 3. Website pages already added

| Page | Path | Purpose |
|------|------|---------|
| Privacy Policy | `/privacy` | UAE PDPL-oriented disclosures |
| Terms of Use | `/terms` | Contract, payments, AI, governing law (UAE / Dubai courts) |
| Cookie Policy | `/cookies` | Essential vs optional cookies |
| Cookie banner | Site-wide | Consent for non-essential cookies |
| Footer | Landing + legal | Company identity, licence line, contacts |

## 4. Personal data (PDPL)

Federal Decree-Law No. 45 of 2021 (Personal Data Protection Law):

- Appoint a privacy contact (`privacy@…`).
- Process only what you need for lease/rent/support.
- Secure passwords, access control, and hosting.
- Honour access / correction / deletion requests where required.
- Use a DPA with processors (hosting, SMS, payments).

## 5. Payments & communications

- Live card/Apple Pay only via a **licensed** payment gateway and clear receipts.
- Marketing SMS/WhatsApp: follow TDRA / spam and consent rules; prefer opt-in.
- Keep lease documents and payment records as required for audits.

## 6. Before you publish

1. Replace all `[Insert …]` fields in `src/legal/siteLegal.ts`.
2. Lawyer reviews Privacy + Terms (Arabic + English if you serve both).
3. Enable HTTPS (SSL) on the domain.
4. Confirm hosting region / transfer safeguards under PDPL.
5. Confirm whether your activity needs RERA/DLD (or other emirate) approval.
6. Register domain with accurate company/individual details matching your licence where required.

## 7. Helpful official links

- TDRA / .ae domains: https://tdra.gov.ae/
- UAE legislation portal: https://uaelegislation.gov.ae/
- Dubai Land Department: https://dubailand.gov.ae/
