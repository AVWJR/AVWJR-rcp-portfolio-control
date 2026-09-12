# RCP Debt File (Phase C)

Integer cents. One first mortgage per property SPE. LTV is **not** computed from book cost / UPB.

## Loan fields

| Field | Notes |
| --- | --- |
| SPE | Property LLC |
| Lender | Note holder |
| Original / current UPB | Book principal; current UPB must equal GL `2110` + `2210` |
| Rate | Annual basis points (568 = 5.68%) |
| Payment | Monthly P&I |
| Maturity | Contractual date; portfolio view shows remaining months |
| Reserve requirement | Monthly replacement-reserve target (GL `1020` is the actual balance) |
| DSCR threshold | Basis points (12500 = 1.25x) |
| Debt yield threshold | Basis points (800 = 8.00%) |

## Journals

Debt-service helper (not re-posted for the seeded August month):

- Dr `6110` interest
- Dr `2110` principal
- Cr `1010` cash
- Optional Dr `1020` reserve / Cr `1010`

LT → current roll (posted in seed for August):

- Dr `2210` / Cr `2110` for next-12-month principal shortfall

Forward amortization uses contractual rate × remaining UPB. August interest/principal are **book actuals** from the Phase A seed so they tie to `6110` and the mortgage paydown.

## Covenants

- **DSCR** = period NOI ÷ (interest + principal)
- **Debt yield** = (period NOI × 12) ÷ UPB

Pass/fail is stored against the note thresholds. A value-add SPE can fail monthly DSCR; that is a control result, not a bug.

## Out of scope

Appraisal LTV/LTC, live servicer feed, full refinance / defeasance, promote waterfalls.
