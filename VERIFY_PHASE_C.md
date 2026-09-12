# VERIFY_PHASE_C

Automated: `npm run verify:c` (after `npm run db:reset`). `npm run verify` runs Phase A, then B, then C.

## Done-when checklist

| # | Criterion | How to verify |
| --- | --- | --- |
| 1 | Loan file per SPE (lender, original/UPB, rate, payment, maturity, reserves) | `/debt` · `GET /api/debt` · seed one loan each |
| 2 | August interest / principal match GL `6110` and mortgage paydown | `verify:c` · loan payment rows |
| 3 | Amortization helpers + LT → current roll from next-12 principal | `tests/amortize.test.ts` · August roll journals |
| 4 | DSCR and debt yield stored + computed from NOI / UPB / debt service | Debt table Pass/Fail · `tests/covenants.test.ts` |
| 5 | Portfolio maturity schedule | `/debt` |
| 6 | CapEx vs R&M; CIP `1460` → fixed asset; dep path intact | `/capex` · WBG value-add CIP + HCR direct-to-`1430` |
| 7 | Unmatched IC is a hard fail; AM fee both sides balanced | `verify:c` · `tests/intercompany.test.ts` |
| 8 | Soft close → checklist → hard lock; posts blocked; reopen needs reason + ticket | `/close` · WBG `2026-07` locked · CVC `2026-07` soft-closed |
| 9 | Combined roll-up stays labeled (not GAAP consol) | Entity switcher · README · `docs/RCP_INTERCOMPANY.md` |
| 10 | Sample CSV import cannot silently full-replace | UI checkbox · CLI `--replace` · `tests/import-replace.test.ts` |

## Seed SPE to click

**Willow Bend Gardens LLC (`SPE-WBG`)** — 264 units, value-add garden.

- http://localhost:3000/debt?entity=SPE-WBG&period=2026-08
- http://localhost:3000/capex?entity=SPE-WBG&period=2026-08
- http://localhost:3000/close?entity=SPE-WBG&period=2026-07 (hard locked)
- http://localhost:3000/close?entity=SPE-CVC&period=2026-07 (soft closed)

## Commands

```bash
cp .env.example .env
npm install
npm run db:reset
npm test
npm run verify:c
npm run verify
npm run dev
```

## Policy the script enforces

- One loan per SPE; book UPB equals GL `2110` + `2210`.
- August scheduled interest equals GL `6110`.
- DSCR and debt yield compute (pass/fail is informational; value-add may fail DSCR).
- WBG has a CIP capex project and a separate R&M tracker.
- WBG `2026-07` is `CLOSED`; posting asserts `PeriodLockedError`.
- SPE `2310` equals OpCo `1310`; SPE `6310` equals OpCo `7010`.
- Rent-roll unit counts stay 264 / 192 / 84.
- AM fees remain below NOI.

## Out of scope (must remain undone)

Phase E narratives/PDF. Phase F tax. No live bank/PMS. No promote waterfall. No LTV from book cost.
