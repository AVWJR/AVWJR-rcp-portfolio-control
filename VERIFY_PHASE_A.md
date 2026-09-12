# VERIFY_PHASE_A

Automated: `npm run verify` (after `npm run db:reset`). Seed deletes existing ledger rows; it does not drop the SQLite file.

## Done-when checklist

| # | Criterion | How to verify |
| --- | --- | --- |
| 1 | Next.js + Prisma models Entity, Account, Period, Journal, JournalLine; double-entry on post | `npx prisma generate` · `npm test` · post path is `src/lib/post-journal.ts` (`assertJournalBalanced`) |
| 2 | Master CoA template; clone on entity create | `seedMasterCoaTemplate` + `createEntityWithCoa` · template count equals `MASTER_COA.length` |
| 3 | Seed HoldCo, OpCo, 3 SPEs (value-add garden, stabilized, light rehab), unit counts, balancing journals, statements for ≥1 period | Entity names below · `npm run verify` |
| 4 | UI: entity switcher, TB, IS, BS, CF, RCP shell | `npm run dev` → `/` and `/reports/*` |
| 5 | Docs present | `ERD.md`, this file, `docs/RCP_RATIO_DICTIONARY_STUB.md`, `docs/RCP_COA_OUTLINE.md`, `docs/RCP_SPE_MONTHLY_CLOSE.md`, README |
| 6 | Package stubs | `packages/{ledger,entities,properties,debt,analytics,reporting,tax-bridge,documents,rcp-brand}` |

## Seed entity names

| Code | Name | Type | Units | Strategy |
| --- | --- | --- | --- | --- |
| RCP-HOLD | Roche Capital Partners HoldCo | HOLDCO | — | — |
| RCP-OPCO | RCP Operating Company LLC | OPCO | — | — |
| SPE-WBG | Willow Bend Gardens LLC | SPE | 264 | VALUE_ADD_GARDEN |
| SPE-CVC | Crestview Commons LLC | SPE | 192 | STABILIZED |
| SPE-HCR | Harbor Court Residences LLC | SPE | 84 | LIGHT_REHAB |

Default report period: **2026-08** (opening books in **2026-07**).

## Commands

```bash
cp .env.example .env
npm install
npm run db:reset
npm test
npm run verify
npm run dev
```

Open:

- http://localhost:3000
- http://localhost:3000/reports/income-statement?entity=SPE-WBG&period=2026-08
- http://localhost:3000/reports/trial-balance?entity=RCP-OPCO&period=2026-08&view=consolidated

API: `GET /api/reports/is?entity=SPE-WBG&period=2026-08`

## Policy checks the script enforces

- Every posted journal balances.
- TB debits = credits for OpCo and each SPE.
- Balance sheet equation holds (including unclosed NI).
- Cash flow beginning + change = ending cash.
- SPE AM fees sit below NOI (`NOI = NI + interest + depreciation + AM fees` when there is no AM income).
- OpCo consolidated TB / BS / CF after IC + AM elimination.

## Out of scope (must remain undone)

Phases B–F beyond TODOs. No live PMS/bank. No promote waterfall. No BigBrainRE UW. No occupancy / LTL / delinquency from the GL.
