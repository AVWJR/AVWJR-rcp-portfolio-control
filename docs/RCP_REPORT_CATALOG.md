# RCP Report Catalog

Phase E institutional packs. Every pack reprints the same period snapshot used by the five-audience narrative engine. Ratio math stays in `@rcp/analytics` (Phase D). Amounts are integer USD cents.

Source of truth in code: `@rcp/reporting` `PACK_CATALOG` and `@rcp/documents` `listReportPacks()`. Preview: `/narratives`. Export: `GET /api/packs/{id}?entity=&period=&format=pdf|pptx`.

## Audiences (same snapshot, five tones)

| id | Audience | Emphasis |
| --- | --- | --- |
| `lp` | Limited Partner | Performance, CFADS as distributions proxy, risk, operating health |
| `gp` | General Partner | Value creation, operator accountability, capital allocation |
| `ic` | Investment Committee | Thesis tracking, risks, covenants, go / hold / fix |
| `lender` | Lender | Collateral, DSCR / debt yield, reserves, covenant compliance |
| `mgmt` | Management Committee | Operating actions, variance owners, maintenance / CapEx priorities |

Narratives regenerate when the navy header entity or period changes. They cite key figures with units (USD, %, x, months). They do not invent LTV, delinquency, T12 from one month, or actual investor distributions.

## Packs

| id | Title | Audience | Cadence | Charts |
| --- | --- | --- | --- | --- |
| `monthly_investor` | Monthly Investor Pack | LP | monthly | GPR→NOI→BTCF waterfall; NOI/occ/OpEx/DSCR trends; concentration; budget bridge; BS composition |
| `quarterly_lender` | Quarterly Lender Pack | Lender | quarterly | Maturity wall; CapEx vs reserves; trends; BS composition; heatmap |
| `ic_memo` | IC Memo Pack | IC | as needed | Waterfall; budget bridge; concentration; heatmap; maturity wall |
| `management_flash` | Management Flash | Management Committee | flash | OpEx composition; budget bridge; CapEx vs reserves; trends |

Each pack also includes a cover, KPI strip, audience narrative, and disclosures.

## Chart ids

| id | Chart |
| --- | --- |
| `waterfall_gpr_noi_btcf` | GPR → vacancy → concessions → EGR → other income → EGI → OpEx → NOI → interest → principal → BTCF |
| `trends_noi_occupancy_opex_dscr` | Available-month NOI, book economic occupancy (EGI/GPR), OpEx ratio, DSCR |
| `opex_composition` | In-NOI OpEx groups |
| `capex_vs_reserves` | Period PPE additions vs GL 1020 vs loan reserve requirement |
| `debt_maturity_wall` | First-mortgage UPB by maturity year |
| `portfolio_concentration` | SPE period NOI share (look-through; not GAAP consolidation) |
| `actual_vs_budget_bridge` | Budget NOI → actual NOI |
| `bs_composition` | Asset / liability / equity slices |
| `portfolio_heatmap` | SPE × share / book occ / OpEx ratio / DSCR / gated LTV |

BTCF is a presentation identity: **period NOI − interest − principal**. AM fees stay below NOI and are excluded from BTCF. CFADS (Phase D) is the distributions proxy: **period NOI − PPE additions − reserve requirement**.

Occupancy trend is book economic occupancy because the rent roll is a point-in-time file, not a monthly series. Physical occupancy is cited for the selected period when a rent roll exists.

## Export

| Format | MIME | Notes |
| --- | --- | --- |
| PDF | `application/pdf` | Letter, RCP navy/gold vector charts, narrative pages |
| PPTX | Office Open XML | Widescreen 13.33×7.5, native Office charts, PPT-compatible |

UI: Export PDF / Export PPTX on `/narratives` and `/narratives/packs/[id]`.

## Labels that stay locked

- Combined roll-up is **not a GAAP consolidation**.
- T12 incomplete on the two-month demo seed is **not annualized**.
- LTV gated without appraisal. Delinquency stubbed (no charge/receipt subledger).
- No promote waterfall. No live PMS or bank rec.

## Phase F (stub only)

Document vault, K-1 packets, and scheduled delivery are not implemented. See `@rcp/documents` `PHASE_F_VAULT_TODO` / `PHASE_F_SCHEDULER_TODO` and `@rcp/tax-bridge`.
