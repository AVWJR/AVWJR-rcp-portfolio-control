# VERIFY_PHASE_B

Automated: `npm run verify:b` (after `npm run db:reset`). `npm run verify` runs Phase A then Phase B.

## Done-when checklist

| # | Criterion | How to verify |
| --- | --- | --- |
| 1 | Operating statement / NOI bridge (GPR → vacancy/concessions → EGI → OpEx → NOI → interest / dep / AM → NI) | `/reports/operating-statement?entity=SPE-WBG&period=2026-08` · `GET /api/reports/os?entity=SPE-WBG&period=2026-08` · `npm test` |
| 2 | Rent roll / unit master + CSV import | Seed 264 / 192 / 84 units · `/properties/SPE-WBG` · `npm run import:rent-roll -- --entity=SPE-WBG --file=data/samples/rent-roll.csv` |
| 3 | Monthly operating budgets for 2026-08 | Seed lines on each SPE + OpCo · import via `/api/budgets` or `npm run import:budget` |
| 4 | Budget vs actual (line and %) and prior-period / MoM columns | Operating statement table · `tests/variance.test.ts` |
| 5 | Rent-roll KPIs: physical occ., economic occ. (EGI/GPR), loss-to-lease, vacancy/concessions | Property view KPI strip (gated) · `tests/occupancy.test.ts` |
| 6 | Breakeven occupancy from OpEx + debt service | Documented in `docs/RCP_OPERATING_KPIS.md` · verify script prints % |
| 7 | Delinquency not invented | KPI strip stub / `@rcp/analytics` `delinquency` still `ready: false` |
| 8 | AM fees remain below NOI; integer cents; SQLite demo | `npm run verify` and `verify:b` |
| 9 | OpCo view labeled **combined roll-up** | Entity switcher on OpCo · not “consolidated” as a GAAP claim |

## Seed SPE to click

**Willow Bend Gardens LLC (`SPE-WBG`)** — 264 units, value-add garden.

- http://localhost:3000/properties/SPE-WBG?entity=SPE-WBG&period=2026-08
- http://localhost:3000/reports/operating-statement?entity=SPE-WBG&period=2026-08
- OpCo combined roll-up: http://localhost:3000/reports/operating-statement?entity=RCP-OPCO&period=2026-08&view=combined

## Commands

```bash
cp .env.example .env
npm install
npm run db:reset
npm test
npm run verify:b
npm run verify
npm run dev
```

CSV paths:

```bash
npm run import:rent-roll -- --entity=SPE-WBG --file=data/samples/rent-roll.csv
npm run import:budget -- --entity=SPE-WBG --period=2026-08 --file=data/samples/budget.csv
```

Re-seed after a sample import if you want the full 264-unit roll back: `npm run db:reset`.

## Policy the script enforces

- Rent-roll unit counts match SPE unit counts (264 / 192 / 84).
- Rent-roll GPR, vacancy, and concessions equal the seed GL (`4010` / `4020` / `4030`).
- Physical occupancy is in (0, 100%]; loss-to-lease ≥ 0.
- Book economic occupancy is EGI / GPR.
- 2026-08 budgets exist; OS GPR variance = actual − budget.
- AM fees sit below NOI.
- OpCo combined roll-up trial balance still balances after IC/AM elimination.

## Out of scope (must remain undone)

Phase E narratives/PDF. Phase F tax. No live PMS. No promote waterfall. No delinquency from GL `1110`. No LTV from book cost.
