# RCP Report Catalog

Phase E institutional packs. Every pack reprints the same period snapshot used by the five-audience narrative engine. Ratio math stays in `@rcp/analytics` (Phase D). Amounts are integer USD cents.

Source of truth in code: `@rcp/reporting` `PACK_CATALOG` and `@rcp/documents` `listReportPacks()`. Preview: `/narratives`. Export: `GET /api/packs/{id}?entity=&period=&format=pdf|pptx`.

## Audiences (same snapshot, five briefs)

Each audience is a first-class `AudienceBrief`: **section outline + KPI strip + chart IDs**. Switching tabs on `/narratives` changes the body, chips, and infographics.

| id | Audience | Emphasis | Charts |
| --- | --- | --- | --- |
| `lp` | Limited Partner | Period NOI / unit vs plan, physical + book occ, LTL, concentration, liquidity | NOI concentration; occupancy vs breakeven; budget bridge; covenant-fail strip |
| `gp` | General Partner | Fee income below NOI, look-through contribution, liquidity | Concentration; heatmap; fee vs NOI; liquidity months |
| `ic` | Investment Committee | Go / hold / fix, thesis vs actuals, concentration, CapEx/CIP | Concentration; budget bridge; CapEx vs reserves; coverage vs threshold; heatmap |
| `lender` | Lender | DSCR / debt yield vs threshold, UPB, debt service, reserves, maturity | Coverage vs threshold; maturity wall; NOI/DSCR trends; occupancy vs breakeven |
| `mgmt` | Management Committee | This-week actions, occupancy / LTL, controllable OpEx, CapEx vs R&M | OpEx composition; budget bridge; occupancy vs breakeven; CapEx vs reserves |

Narratives regenerate when the navy header entity or period changes. They cite key figures with units (USD, %, x, months). They do not invent LTV, delinquency, T12 from one month, or actual investor distributions.

## Packs

| id | Title | Audience | Cadence | Charts |
| --- | --- | --- | --- | --- |
| `monthly_investor` | Monthly Investor Pack | LP | monthly | From the LP brief |
| `quarterly_lender` | Quarterly Lender Pack | Lender | quarterly | From the Lender brief |
| `ic_memo` | IC Memo Pack | IC | as needed | From the IC brief |
| `management_flash` | Management Flash | Management Committee | flash | From the Management brief |

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
| `coverage_vs_threshold` | DSCR and debt yield versus covenant thresholds |
| `occupancy_breakeven` | Physical occupancy, book economic occupancy, breakeven |
| `liquidity_runway` | Cash versus period OpEx (months of coverage) |
| `fee_vs_noi` | AM / fee line versus period NOI (fees stay below NOI) |

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

## Phase F

Document vault (`/vault`), K-1-oriented capital export (`/tax/k1`), books-to-tax (`/tax`), and scheduled pack generation (`/scheduler`, `npm run reports:run`) are live. They do **not** file returns or send email. See [RCP_TAX_BRIDGE.md](./RCP_TAX_BRIDGE.md), [RCP_DOCUMENT_VAULT.md](./RCP_DOCUMENT_VAULT.md), [RCP_SCHEDULER.md](./RCP_SCHEDULER.md).
