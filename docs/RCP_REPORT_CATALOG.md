# RCP Report Catalog

Phase E institutional packs. Every pack reprints the same period snapshot used by the five-audience narrative engine. Ratio math stays in `@rcp/analytics` (Phase D). Amounts are integer USD cents.

Source of truth in code: `@rcp/reporting` `PACK_CATALOG`, `AUDIENCE_BRIEFS` (CRE Sentinel matrix), and `@rcp/documents` `listReportPacks()`. Preview: `/narratives`. Export: `GET /api/packs/{id}?entity=&period=&format=pdf|pptx`.

## Audiences (same snapshot, five briefs)

Each audience is a first-class `AudienceBrief`: **section outline + KPI strip + chart IDs**. Switching tabs on `/narratives` changes the body, chips, and infographics. Shared KPI chips are only ids that appear on **three or more** audiences; everything else is audience-specific. Every NOI tile carries a `noiDefinition` of `period` | `t12 incomplete` | `annualized_period`.

| id | Audience | Questions / sections | Charts |
| --- | --- | --- | --- |
| `lp` | Limited Partner | NOI / NOI-unit vs plan; capital at risk; ask / next capital event | NOI concentration bars; occupancy vs breakeven gap; T12-incomplete callout; covenant watchlist (fails only) |
| `gp` | General Partner | Intervene this month; fee income / OpCo burn vs property; problem-child SPE | SPE scorecard heatmap; CapEx vs reserve gap; watchlist with reason codes |
| `ic` | Investment Committee | Go / hold / kill; period vs T12 vs annualized; falsifiers | Decision / posture strip; UPB stack (not LTV); T12 / path-dependency callout |
| `lender` | Lender | In covenant?; cure path; collateral operations | Covenant traffic light; DSCR sparkline; maturity schedule; reserve coverage |
| `mgmt` | Management Committee | Books close clean?; combined coherent?; what ships externally? | Close / IC control strip; NOI variance waterfall; portfolio scoreboard |

Narratives regenerate when the navy header entity or period changes. They cite key figures with units (USD, %, x, months). They do not invent LTV, delinquency, T12 from one month, or actual investor distributions. Seed / demo months (SPE-WBG) carry an incomplete-T12 disclaimer.

## Packs

| id | Title | Audience | Cadence | Charts |
| --- | --- | --- | --- | --- |
| `monthly_investor` | Monthly Investor Pack | LP | monthly | From the LP brief |
| `quarterly_lender` | Quarterly Lender Pack | Lender | quarterly | From the Lender brief |
| `ic_memo` | IC Memo Pack | IC | as needed | From the IC brief |
| `management_flash` | Management Flash | Management Committee | flash | From the Management brief |

Each pack uses the same executive spine, skinned for the audience: **cover → 3–5 KPI strip → narrative thesis → 2–4 insight visuals → risks/asks → appendix**. Dense tables and remaining KPIs sit in the appendix. Live decks are capped; extra chart-of-accounts detail stays out of the spine.

## Chart ids

| id | Chart |
| --- | --- |
| `waterfall_gpr_noi_btcf` | GPR → vacancy → concessions → EGR → other income → EGI → OpEx → NOI → interest → principal → BTCF |
| `trends_noi_occupancy_opex_dscr` | DSCR vs threshold sparkline (available-month NOI / book occ / OpEx / DSCR) |
| `opex_composition` | In-NOI OpEx groups |
| `capex_vs_reserves` | CapEx vs reserve coverage (PPE additions vs GL 1020 vs requirement) |
| `debt_maturity_wall` | Maturity schedule — first-mortgage UPB by year |
| `portfolio_concentration` | NOI concentration bars (look-through; not GAAP consolidation) |
| `actual_vs_budget_bridge` | NOI variance waterfall — budget NOI → actual NOI |
| `bs_composition` | Asset / liability / equity slices |
| `portfolio_heatmap` | SPE scorecard (NOI / phys occ / book occ / OpEx / DSCR). LTV omitted (gated). |
| `coverage_vs_threshold` | Covenant traffic light — DSCR and debt yield versus thresholds |
| `occupancy_breakeven` | Occupancy vs breakeven gap |
| `liquidity_runway` | Cash versus period OpEx (months of coverage) |
| `fee_vs_noi` | AM / fee line versus period NOI (fees stay below NOI) |
| `covenant_watchlist` | Covenant watchlist, fails only, with reason codes |
| `t12_status` | T12 incomplete callout / path-dependency |
| `decision_posture` | Go / hold / kill strip |
| `upb_stack` | UPB stack — not LTV |
| `close_control` | Close / IC / AM-below-NOI control strip |

BTCF is a presentation identity: **period NOI − interest − principal**. AM fees stay below NOI and are excluded from BTCF. CFADS (Phase D) is the distributions proxy: **period NOI − PPE additions − reserve requirement**.

Occupancy trend is book economic occupancy because the rent roll is a point-in-time file, not a monthly series. Physical occupancy is cited for the selected period when a rent roll exists.

## Export

| Format | MIME | Notes |
| --- | --- | --- |
| PDF | `application/pdf` | 16:9 widescreen (matches PPTX), ~0.5" margins, RCP navy/gold vector charts, so-what line on every visual |
| PPTX | Office Open XML | Widescreen 13.33×7.5 (16:9), native Office charts, PPT-compatible |

UI: Export PDF / Export PPTX on `/narratives` and `/narratives/packs/[id]`.

## Labels that stay locked

- Combined roll-up is **not a GAAP consolidation**.
- T12 incomplete on the two-month demo seed is **not annualized**.
- LTV gated without appraisal. Delinquency stubbed (no charge/receipt subledger).
- AM 6310 sits below NOI. CPA tax export is not a filing.
- Deal LP/GP waterfalls (when saved) haircut OpCo cash/CFADS; default is 100% look-through. No live PMS or bank rec.

## Phase F

Document vault (`/vault`), K-1-oriented capital export (`/tax/k1`), books-to-tax (`/tax`), and scheduled pack generation (`/scheduler`, `npm run reports:run`) are live. They do **not** file returns or send email. See [RCP_TAX_BRIDGE.md](./RCP_TAX_BRIDGE.md), [RCP_DOCUMENT_VAULT.md](./RCP_DOCUMENT_VAULT.md), [RCP_SCHEDULER.md](./RCP_SCHEDULER.md).
