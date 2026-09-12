# VERIFY_PHASE_D

Automated: `npm run verify:d` (after `npm run db:reset`). `npm run verify` runs Phase A, then B, then C, then D.

## Done-when checklist

| # | Criterion | How to verify |
| --- | --- | --- |
| 1 | Live ratio dictionary with formulas, units, NOI definition labels (period / T12 / annualized period) | `/dashboard/ratios` · `GET /api/ratios` · `docs/RCP_RATIO_DICTIONARY_STUB.md` · `tests/ratio-formulas.test.ts` |
| 2 | Property dashboard per SPE: GL tiles + rent-roll KPIs + debt covenants | `/dashboard/SPE-WBG?entity=SPE-WBG&period=2026-08` · `GET /api/dashboard?entity=SPE-WBG&period=2026-08` |
| 3 | OpCo dashboard: properties/units, look-through NOI, liquidity, leverage inventory, fee income, G&A%, covenant watchlist, NOI concentration | `/dashboard` → `/dashboard/RCP-OPCO?view=combined` |
| 4 | Combined roll-up labeled (not GAAP consolidation) | OpCo dashboard copy · entity switcher · dictionary |
| 5 | Drill-down: every tile → formula → contributing accounts or rent-roll fields → TB / OS / debt / rent roll | Click NOI, DSCR, physical occupancy |
| 6 | T12 incomplete on seed (one operating month); not silently annualized | T12 tile shows `n/12 mo` |
| 7 | LTV gated without appraisal; delinquency stubbed | Tiles + `ratioAvailability()` |
| 8 | Formula helpers unit-tested; AM fees remain below NOI; cents / SQLite intact | `npm test` · `npm run verify:d` |
| 9 | Phase E narratives/PDF stub only | `/narratives` |

## Seed SPE to click

**Willow Bend Gardens LLC (`SPE-WBG`)** — 264 units, value-add garden.

- http://localhost:3000/dashboard
- http://localhost:3000/dashboard/SPE-WBG?entity=SPE-WBG&period=2026-08
- http://localhost:3000/dashboard/ratios/noi_period?entity=SPE-WBG&period=2026-08
- http://localhost:3000/dashboard/ratios/dscr?entity=SPE-WBG&period=2026-08
- http://localhost:3000/dashboard/RCP-OPCO?entity=RCP-OPCO&period=2026-08&view=combined

## Commands

```bash
cp .env.example .env
npm install
npm run db:reset
npm test
npm run verify:d
npm run verify
npm run dev
```

## Policy the script enforces

- Dictionary markdown lists every `RATIO_DICTIONARY` id.
- WBG period NOI tile matches the income-statement NOI; NOI/unit uses 264 units.
- T12 is incomplete (`< 12` months) and is not labeled ready T12.
- Physical occupancy and breakeven compute from the rent roll / GL helpers.
- DSCR / debt yield compute; LTV and delinquency stay gated.
- NOI drill-down has contributing accounts that link to statements.
- OpCo dashboard is 3 properties / 540 units; concentration shares fill the mix.
- Combined roll-up copy rejects a GAAP consolidation claim.
- AM fees remain below NOI.

## Out of scope (must remain undone)

Phase E audience narratives / PDF packs (stub only). Phase F tax. No live PMS/bank. No promote waterfall. No LTV from book cost.
