# SPE Monthly Close (Phase A–C)

Timezone: `America/New_York`. Currency: USD.

## Workflow

`OPEN` → **soft close** (operating posts blocked; controller adjustments only) → checklist `DONE`/`NA` → **hard lock** (`CLOSED`, all posts rejected) → **reopen** only with reason + ticket.

Close status is per entity + period. Seed demo: `SPE-WBG` `2026-07` hard locked; `SPE-CVC` `2026-07` soft closed; `2026-08` remains open.

## Controller checklist

1. Period row exists (`YYYY-MM`).
2. Operating journals posted (rent, vacancy, concessions, other income, OpEx).
3. Cash applications posted (collections, AP payments).
4. Below-NOI items posted last:
   - interest (`6110`)
   - depreciation (`6210`)
   - **OpCo asset management fee (`6310` / `2310`)** — below NOI
5. Mirror the AM fee on OpCo (`1310` / `7010`). Confirm IC sides match.
6. Print Trial Balance. Debits must equal credits.
7. Print Income Statement. Confirm AM fees appear below NOI.
8. Print Balance Sheet. Assets must equal liabilities + equity (unclosed NI is added to equity).
9. Print Cash Flow. Beginning cash + net change must equal ending cash.
10. Import or confirm the rent roll (unit master). Do not derive physical occupancy from `4020`.
11. Import or confirm the monthly operating budget. Print the operating statement variance.
12. Review breakeven occupancy: `(OpEx + interest + principal − other income) / GPR`.
13. Loan file: payment schedule, current/LT split, DSCR and debt yield vs thresholds.
14. CapEx vs R&M classified; CIP and placed-in-service reviewed.
15. OpCo↔SPE intercompany `1310`/`2310` and AM `6310`/`7010` matched.
16. Soft close → checklist complete → hard lock.

UI: `/close`. Locked periods show a banner on every statement and reject `postJournal`.

## Out of scope

- Live PMS / bank feed
- Promote / waterfall
- BigBrainRE underwriting
- Delinquency / AR aging (no charge/receipt subledger)
- LTV from book cost (still gated)

## Close is not year-end

The app does not auto-close P&L into `3100` / `3900`. Current-period NI is computed and presented on the balance sheet until a future year-end close job is implemented.
