# Roche Capital Partners — Portfolio Control

OpCo accounting / portfolio control for **Roche Capital Partners**. Phase A is the book ledger. Phase B is the property operating package. Phase C adds the debt file, CapEx/CIP, intercompany matching, and period-close workflow. **Phase D** is the live ratio dictionary plus OpCo and property dashboards with formula drill-down.

Locked stack: TypeScript, Next.js App Router, Prisma, PostgreSQL in production, **SQLite for local demo**. Server actions + API routes. USD, `en-US`, `America/New_York`. Integer cents. Double-entry intact.

Entity tree: **HoldCo → OpCo → Property SPE/LLC**. Seed SPEs are 100% owned. OpCo asset management fees sit **below NOI** on the SPE. OpCo’s multi-SPE view is a **combined roll-up** (eliminates IC `1310`/`2310` and AM `6310`/`7010`) — not a GAAP consolidation. See [docs/RCP_INTERCOMPANY.md](./docs/RCP_INTERCOMPANY.md).

## Install / run / seed (local SQLite demo)

```bash
cp .env.example .env
npm install
npx prisma generate
npm run db:reset    # prisma db push && seed (deletes ledger, units, budgets, loans, capex, close)
npm test
npm run verify:d    # Phase D dashboards + live dictionary
npm run verify      # Phase A then B then C then D
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

## Seed entities

| Code | Name | Notes |
| --- | --- | --- |
| RCP-HOLD | Roche Capital Partners HoldCo | Parent |
| RCP-OPCO | RCP Operating Company LLC | Combined roll-up parent for SPEs |
| SPE-WBG | Willow Bend Gardens LLC | 264 units · value-add garden |
| SPE-CVC | Crestview Commons LLC | 192 units · stabilized |
| SPE-HCR | Harbor Court Residences LLC | 84 units · light rehab |

Books: opening **2026-07**, operating month **2026-08**. Switch entity and period in the navy header. On OpCo, choose **Combined roll-up** to stack wholly owned SPEs.

Sample SPE to click: **Willow Bend Gardens (`SPE-WBG`)**  
http://localhost:3000/dashboard  
http://localhost:3000/dashboard/SPE-WBG?entity=SPE-WBG&period=2026-08  
http://localhost:3000/dashboard/ratios/noi_period?entity=SPE-WBG&period=2026-08  
http://localhost:3000/properties/SPE-WBG?entity=SPE-WBG&period=2026-08  
http://localhost:3000/debt?entity=SPE-WBG&period=2026-08  
http://localhost:3000/capex?entity=SPE-WBG&period=2026-08  
http://localhost:3000/close?entity=SPE-WBG&period=2026-07

Close demo: WBG `2026-07` is **hard locked**. CVC `2026-07` is **soft closed**. August stays open.

## Phase D — OpCo + property ratio dashboards

- **Live dictionary** — `@rcp/analytics` implements [docs/RCP_RATIO_DICTIONARY_STUB.md](./docs/RCP_RATIO_DICTIONARY_STUB.md) with explicit formulas, units, and NOI definition labels (**period** vs **T12** vs **annualized period**). T12 is incomplete on the two-month demo seed and is not silently annualized.
- **Property dashboard** — `/dashboard/[entityCode]` (e.g. `SPE-WBG`): period NOI, NOI/unit, EGI, OpEx ratio, tagged controllable OpEx, CapEx vs reserves, CFADS and CFADS/DSCR, cash, NOI budget variance, rent-roll physical occupancy / loss-to-lease / book economic occupancy / breakeven, loan DSCR / debt yield / UPB / maturity. Delinquency and LTV stay gated.
- **OpCo dashboard** — `/dashboard` → `RCP-OPCO` combined: properties/units, look-through NOI and NOI/unit, liquidity months, look-through UPB / DSCR / debt yield (not LTV), fee income, G&A%, covenant watchlist, NOI concentration. Combined roll-up is labeled **not a GAAP consolidation**.
- **Drill-down** — every tile opens `/dashboard/ratios/[id]` with the formula, NOI label, contributing accounts or rent-roll fields, and links to OS / TB / debt / rent roll / CapEx.
- **Phase E** — `/narratives` is a stub only (no PDF packs).

API: `GET /api/dashboard?entity=SPE-WBG&period=2026-08` · `GET /api/ratios`

## Phase C — debt, capex, close

- **Debt** — one first mortgage per SPE (lender, original/UPB, rate, payment, maturity, reserve requirement). August interest/principal match GL `6110` and mortgage paydown. Helpers for amortization, debt-service journals, and LT → current reclass. DSCR and debt yield stored + computed. Portfolio maturity schedule at `/debt`.
- **CapEx / CIP** — `1460` Construction in Progress. CapEx vs R&M classified. Journals move CIP → fixed asset. Monthly depreciation `6210`/`1490` unchanged. Seed: WBG value-add interiors (CIP + partial PIS) and an R&M tracker.
- **Intercompany** — unmatched SPE `2310` vs OpCo `1310` (and AM `6310`/`7010`) hard-fails `verify:c`.
- **Period close** — `OPEN` → soft close → controller checklist → hard lock. Posts to locked periods are rejected. Reopen requires reason + ticket.

Formulas: [docs/RCP_DEBT.md](./docs/RCP_DEBT.md), [docs/RCP_CAPEX.md](./docs/RCP_CAPEX.md), [docs/RCP_SPE_MONTHLY_CLOSE.md](./docs/RCP_SPE_MONTHLY_CLOSE.md).

## Phase B — property operating package

- **Operating statement / NOI bridge** — GPR → vacancy/concessions → EGR → other income → EGI → OpEx groups → NOI → interest, depreciation, AM fees → NI. Budget vs actual ($ and %) and prior-period / MoM when the prior month exists.
- **Rent roll / unit master** — unit id, floorplan, beds/baths, sqft, status, market rent, in-place rent, lease start/end, concession. Seeded to match SPE unit counts and August GL GPR / vacancy / concessions.
- **Budgets** — monthly by CoA account, integer cents. Seeded for **2026-08** on each SPE and OpCo.
- **KPIs (rent-roll sourced, gated)** — physical occupancy, loss-to-lease, rent-roll vacancy and concessions. **Book economic occupancy = EGI / GPR**. Breakeven occupancy from GL OpEx + debt service. Delinquency is stubbed (no charge/receipt data).

Formulas: [docs/RCP_OPERATING_KPIS.md](./docs/RCP_OPERATING_KPIS.md).

### Import paths

CSV import **replaces** the SPE’s current rent roll or that month’s budget. The UI requires a confirm checkbox. CLI requires `--replace`. API requires `confirmReplace=true` when rows already exist.

```bash
npm run import:rent-roll -- --entity=SPE-WBG --file=data/samples/rent-roll.csv --replace
npm run import:budget -- --entity=SPE-WBG --period=2026-08 --file=data/samples/budget.csv --replace
```

UI import lives on the property page (rent roll) and operating statement (budget). API:

- `POST /api/rent-roll` (multipart `entity` + `file` + `confirmReplace=true`)
- `GET /api/rent-roll?entity=SPE-WBG` · `&format=csv` to download
- `POST /api/budgets` (multipart `entity`, `period`, `file`, `confirmReplace=true`)
- `GET /api/budgets?entity=SPE-WBG&period=2026-08`
- `GET /api/debt` · `GET /api/capex` · `GET /api/close`
- `GET /api/reports/os?entity=SPE-WBG&period=2026-08`
- `GET /api/reports/kpis?entity=SPE-WBG&period=2026-08`
- `GET /api/reports/{tb|is|bs|cf}?entity=SPE-WBG&period=2026-08`
- OpCo combined roll-up: `?entity=RCP-OPCO&view=combined`

CSV headers:

```
unit_id,floorplan,beds,baths,sqft,status,market_rent,in_place_rent,lease_start,lease_end,concession
account_code,amount
```

Rents and budget amounts are USD in the file; the importer stores integer cents. Status is `OCCUPIED` | `VACANT` | `DOWN`.

## Statements

- Operating Statement — Phase B NOI bridge + variance
- Trial Balance — as-of period end
- Income Statement — book P/L (same NOI math, no budget columns)
- Balance Sheet — as-of, including unclosed NI and CIP `1460`
- Cash Flow — indirect; ending cash ties to the balance sheet
- Debt maturity / covenants — Phase C
- CapEx / CIP register — Phase C
- Period close board — Phase C

## Packages

| Package | Role |
| --- | --- |
| `@rcp/ledger` | CoA, double-entry, TB / IS / BS / CF, close rules, IC match |
| `@rcp/debt` | Loan amort, covenants, debt-service / CIP / current-portion journals |
| `@rcp/properties` | Unit master, rent-roll CSV, occupancy / loss-to-lease |
| `@rcp/reporting` | Operating statement + budget / MoM variance |
| `@rcp/analytics` | Live ratio dictionary + formula helpers; LTV and delinquency still gated |
| `@rcp/rcp-brand` | Institutional brand tokens |
| `@rcp/entities` | HoldCo / OpCo / SPE types |
| `@rcp/tax-bridge` | Phase F stub |
| `@rcp/documents` | Phase E stub |

## Docs

- [ERD.md](./ERD.md)
- [VERIFY_PHASE_A.md](./VERIFY_PHASE_A.md)
- [VERIFY_PHASE_B.md](./VERIFY_PHASE_B.md)
- [VERIFY_PHASE_C.md](./VERIFY_PHASE_C.md)
- [VERIFY_PHASE_D.md](./VERIFY_PHASE_D.md)
- [docs/RCP_COA_OUTLINE.md](./docs/RCP_COA_OUTLINE.md)
- [docs/RCP_SPE_MONTHLY_CLOSE.md](./docs/RCP_SPE_MONTHLY_CLOSE.md)
- [docs/RCP_DEBT.md](./docs/RCP_DEBT.md)
- [docs/RCP_CAPEX.md](./docs/RCP_CAPEX.md)
- [docs/RCP_INTERCOMPANY.md](./docs/RCP_INTERCOMPANY.md)
- [docs/RCP_OPERATING_KPIS.md](./docs/RCP_OPERATING_KPIS.md)
- [docs/RCP_RATIO_DICTIONARY_STUB.md](./docs/RCP_RATIO_DICTIONARY_STUB.md)

## Out of scope

Phase E narratives/PDF (stub only). Phase F tax. No live PMS or bank feed. No promote waterfall. No BigBrainRE underwriting. No LTV from book cost.
