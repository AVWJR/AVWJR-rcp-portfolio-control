# VERIFY_PHASE_E

Automated: `npm run verify:e` (after `npm run db:reset`). `npm run verify` runs Phase A, then B, then C, then D, then E.

## Done-when checklist

| # | Criterion | How to verify |
| --- | --- | --- |
| 1 | Print-ready RCP-branded chart layer (waterfall, trends, OpEx, CapEx/reserves, maturity wall, concentration/heatmap, budget bridge, BS composition) | `/narratives?entity=SPE-WBG&period=2026-08` · light/dark themes |
| 2 | Five audience narratives from the same period snapshot (LP, GP, IC, Lender, Management Committee) | Audience tabs on `/narratives` · `GET /api/narratives?entity=SPE-WBG&period=2026-08` |
| 3 | Narratives regenerate when period or entity changes and cite key numbers with units | Switch header to `2026-07` or `RCP-OPCO` · numbers and IC go/hold/fix update |
| 4 | Report packs: Monthly Investor (LP), Quarterly Lender, IC Memo, Management Flash | `/narratives/packs/monthly_investor?entity=SPE-WBG&period=2026-08` |
| 5 | PDF and PPTX export | Export buttons · `GET /api/packs/monthly_investor?entity=SPE-WBG&period=2026-08&format=pdf` · `&format=pptx` |
| 6 | Phase D `/narratives` stub replaced | `/narratives` is the live catalog + preview |
| 7 | Docs: this file, README Phase E, [docs/RCP_REPORT_CATALOG.md](./docs/RCP_REPORT_CATALOG.md) | Files exist |
| 8 | `npm run verify:e` + narrative hook tests + pack smoke | `npm test` · `npm run verify:e` |
| 9 | Seed demo on SPE-WBG + OpCo | Links below |
| 10 | Phase D KPI math unchanged; LTV/delinquency gated; AM below NOI; combined roll-up labeled | Script + ratio tests |

## Seed SPE to click

**Willow Bend Gardens LLC (`SPE-WBG`)** — 264 units, value-add garden.

- http://localhost:3000/narratives?entity=SPE-WBG&period=2026-08
- http://localhost:3000/narratives?entity=SPE-WBG&period=2026-08&audience=ic
- http://localhost:3000/narratives/packs/monthly_investor?entity=SPE-WBG&period=2026-08
- http://localhost:3000/narratives/packs/quarterly_lender?entity=SPE-WBG&period=2026-08
- http://localhost:3000/narratives/packs/ic_memo?entity=SPE-WBG&period=2026-08
- http://localhost:3000/narratives/packs/management_flash?entity=SPE-WBG&period=2026-08
- http://localhost:3000/narratives?entity=RCP-OPCO&period=2026-08&view=combined

## Commands

```bash
cp .env.example .env
npm install
npm run db:reset
npm test
npm run verify:e
npm run verify
npm run dev
```

## Policy the script enforces

- Catalog lists all four packs and five audiences.
- WBG and OpCo narratives generate for every audience and cite period NOI with a `$` unit.
- IC memo includes a GO / HOLD / FIX action.
- Chart suite includes the required infographic ids.
- PDF begins with `%PDF`; PPTX is a ZIP (`PK`).
- AM fees remain below NOI; LTV and delinquency stay gated in the snapshot.
- OpCo copy rejects a GAAP consolidation claim.
- Phase F vault / tax are out of scope for this script (implemented in Phase F).

## Out of scope (must remain undone)

Phase F tax / K-1 / document vault / scheduler (see VERIFY_PHASE_F.md). No live PMS or bank. No promote waterfall. No LTV from book cost. Do not redefine Phase D KPIs.
