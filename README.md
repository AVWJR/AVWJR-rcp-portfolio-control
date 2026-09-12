# Roche Capital Partners — Portfolio Control

Phase A OpCo accounting / portfolio control ledger for **Roche Capital Partners**.

Locked stack: TypeScript, Next.js App Router, Prisma, PostgreSQL in production, **SQLite for local demo**. Server actions + API routes. USD, `en-US`, `America/New_York`.

Entity tree: **HoldCo → OpCo → Property SPE/LLC**. Seed SPEs are 100% owned and consolidate into OpCo. OpCo asset management fees sit **below NOI** on the SPE.

## Install / run / seed (local SQLite demo)

```bash
cp .env.example .env
npm install
npx prisma generate
npm run db:reset    # prisma db push && seed (seed deletes existing ledger rows)
npm test
npm run verify      # VERIFY_PHASE_A
npm run dev
```

App: [http://localhost:3000](http://localhost:3000)

`.env` default:

```
DATABASE_URL="file:./dev.db"
```

Prisma resolves that path relative to `prisma/`, so the file is `prisma/dev.db`.

### PostgreSQL (production)

1. Change `provider = "postgresql"` in `prisma/schema.prisma`.
2. Set `DATABASE_URL` to a Postgres URL.
3. Run `npx prisma migrate dev` (or `db push`) and `npm run db:seed`.

SQLite is the documented local-demo fallback so the app runs without a database server.

## Seed entities

| Code | Name | Notes |
| --- | --- | --- |
| RCP-HOLD | Roche Capital Partners HoldCo | Parent |
| RCP-OPCO | RCP Operating Company LLC | Consolidation parent for SPEs |
| SPE-WBG | Willow Bend Gardens LLC | 264 units · value-add garden |
| SPE-CVC | Crestview Commons LLC | 192 units · stabilized |
| SPE-HCR | Harbor Court Residences LLC | 84 units · light rehab |

Books: opening **2026-07**, operating month **2026-08**. Switch entity and period in the navy header. OpCo has a **Consolidated SPEs** view (eliminates IC `1310`/`2310` and AM `6310`/`7010`).

## Statements

- Trial Balance — as-of period end
- Income Statement — period activity (GPR → NOI → interest / depreciation / AM fees)
- Balance Sheet — as-of, including unclosed NI
- Cash Flow — indirect; ending cash ties to the balance sheet

`GET /api/reports/{tb|is|bs|cf}?entity=SPE-WBG&period=2026-08`

## Packages

| Package | Phase A role |
| --- | --- |
| `@rcp/ledger` | CoA, double-entry, TB / IS / BS / CF math |
| `@rcp/rcp-brand` | Institutional brand tokens |
| `@rcp/entities` | HoldCo / OpCo / SPE types |
| `@rcp/properties` | Unit/strategy stub (Phase B occupancy gated) |
| `@rcp/debt` | Mortgage GL only; LTL gated |
| `@rcp/analytics` | Ratio gate — do not fake occupancy/LTL/delinquency from GL |
| `@rcp/reporting` | Statement route helpers |
| `@rcp/tax-bridge` | Phase F stub |
| `@rcp/documents` | Phase E stub |

## Docs

- [ERD.md](./ERD.md)
- [VERIFY_PHASE_A.md](./VERIFY_PHASE_A.md)
- [docs/RCP_COA_OUTLINE.md](./docs/RCP_COA_OUTLINE.md)
- [docs/RCP_SPE_MONTHLY_CLOSE.md](./docs/RCP_SPE_MONTHLY_CLOSE.md)
- [docs/RCP_RATIO_DICTIONARY_STUB.md](./docs/RCP_RATIO_DICTIONARY_STUB.md)

## Out of scope

Phases B–F beyond TODOs. No live PMS or bank feed. No promote waterfall. No BigBrainRE underwriting.
