# Resident import template (MLIHrents)

Use **`residents-sample.csv`** — open it in Excel, edit rows, then save as CSV or upload here for import.

## Columns

| Column | Required | Notes |
|--------|----------|--------|
| `name` | Yes | Full name |
| `phone` | Yes | UAE mobile, e.g. `0545882666` |
| `pin` | Yes | Exactly 4 digits (resident login password) |
| `building` | Yes | Building name |
| `building_number` | Yes | e.g. `B12` |
| `apartment` | Yes | Unit number |
| `floor` | Yes | Number |
| `parking` | No | Bay ID or leave blank |
| `email` | No | |
| `move_in` | No | `YYYY-MM-DD` |
| `lease_end` | Yes | `YYYY-MM-DD` |
| `occupants` | No | Number of people |
| `status` | No | `active` · `arrears` · `notice` |
| `rent_amount_aed` | Yes | Amount per installment |
| `rent_due_day` | Yes | Day of month `1`–`28` |
| `rent_schedule` | Yes | `1`–`12` payments per year (`12` = monthly, `4` = quarterly, `2` = every 6 months) |
| `contract_total_aed` | Yes | Full lease rent total |
| `amount_paid_aed` | No | Already paid toward contract (default `0`) |

## Tips

- Keep the header row exactly as in the sample.
- One resident per row.
- Do not reuse the same phone for two residents.
- PINs must be 4 digits only.
