# RCP Ratio Dictionary

Live computational source of truth: `@rcp/analytics` (`RATIO_DICTIONARY` + formula helpers). This file is the in-repo narrative. Phase D dashboards drill every KPI to the formula, NOI definition, and contributing accounts or rent-roll fields.

Amounts are integer USD cents. Ratios are integer basis points (`10_000` = 100.00% or 1.00x depending on unit). **AM fees (`6310`) stay below NOI.**

## NOI definitions

| Label | id key | Meaning |
| --- | --- | --- |
| Period NOI | `period` | Selected-month book NOI (`EGI − in-NOI OpEx`). |
| T12 NOI | `t12` | Sum of the last 12 monthly period NOI figures. Requires 12 operating months. |
| Annualized period NOI | `annualized_period` | Period NOI × 12. Used for debt yield only. **Not T12.** |
| T12 (incomplete) | — | Fewer than 12 months on the books. Shown with months-available. **Do not silently annualize and call it T12.** |

The demo seed has opening **2026-07** and one operating month **2026-08**. T12 is therefore incomplete.

OpCo’s multi-SPE presentation is a **combined roll-up** (IC `1310`/`2310` and AM `6310`/`7010` eliminated) — **not a GAAP consolidation**. Look-through property KPIs stack wholly owned SPE books without calling that stack a consolidation.

## Live ratios

| id | Ratio | Formula | Unit | NOI def. | Status | Source |
| --- | --- | --- | --- | --- | --- | --- |
| `noi_period` | NOI (period) | EGI − in-NOI OpEx | usd_cents | period | ready | GL |
| `noi_t12` | NOI (T12) | Σ period NOI of the last 12 months | usd_cents | t12 | incomplete on seed | GL |
| `noi_annualized` | NOI (annualized period) | Period NOI × 12 | usd_cents | annualized_period | ready | GL |
| `noi_per_unit` | NOI / unit | Period NOI ÷ SPE unit count | usd_cents | period | ready | GL + unit master |
| `egi` | Effective Gross Income | GPR − vacancy − concessions + other income | usd_cents | period | ready | GL |
| `gpr` | Gross Potential Rent | GL `4010` period credit-net | usd_cents | period | ready | GL |
| `opex_ratio` | OpEx ratio | In-NOI OpEx ÷ EGI | bps | period | ready | GL |
| `controllable_opex` | Controllable OpEx | `5110+5210+5310+5410+5510+5610+5990` | usd_cents | period | ready | GL (tagged) |
| `controllable_opex_ratio` | Controllable OpEx ratio | Controllable OpEx ÷ EGI | bps | period | ready | GL |
| `cash` | Cash | `1010+1020+1030+1040` | usd_cents | — | ready | GL |
| `capex_vs_reserves` | CapEx vs reserves | Period PPE additions (`1420–1460`) vs GL `1020` vs loan reserve requirement | usd_cents | period | ready | GL + loan |
| `cfads` | CFADS | Period NOI − period PPE additions − monthly reserve requirement | usd_cents | period | ready | mixed |
| `cfads_dscr` | CFADS / DSCR | CFADS ÷ (interest + principal) | multiple_bps | period | ready | mixed |
| `budget_variance_noi` | NOI budget variance | Actual period NOI − Budget NOI | usd_cents | period | ready | budget |
| `physical_occupancy` | Physical occupancy | Occupied ÷ rentable (`DOWN` excluded) | bps | — | ready when rent roll exists | rent roll |
| `loss_to_lease` | Loss-to-lease | Occupied Σ max(0, market − in-place) | usd_cents | — | ready when rent roll exists | rent roll |
| `economic_occupancy_book` | Economic occupancy (book) | EGI ÷ GPR | bps | period | ready | GL |
| `economic_occupancy_rent_roll` | Economic occupancy (rent-roll analog) | (in-place − concessions) ÷ rent-roll GPR | bps | — | ready when rent roll exists | rent roll |
| `breakeven_occupancy` | Breakeven occupancy | (OpEx + interest + principal paydown − other income) ÷ GPR | bps | period | ready | GL |
| `dscr` | DSCR | Period NOI ÷ (interest + principal) | multiple_bps | period | ready | loan + NOI |
| `debt_yield` | Debt yield | (Period NOI × 12) ÷ UPB | bps | annualized_period | ready | loan + NOI |
| `upb` | Unpaid principal balance | Loan-file UPB (= GL `2110+2210`) | usd_cents | — | ready | loan |
| `maturity` | Maturity | Loan maturity date; remaining months | date | — | ready | loan |
| `ltv` | Loan-to-value / loan-to-cost | UPB ÷ appraised value | gated | — | gated | appraisal missing |
| `delinquency` | Delinquency / AR aging | Tenant charge/receipt aging | gated | — | gated | no subledger |
| `fee_income` | Fee income | GL `7010` period credit-net | usd_cents | period | ready | OpCo GL |
| `ga_ratio` | G&A % | (`5110+5610+5990`) ÷ `7010` | bps | period | ready | OpCo GL |
| `liquidity_months` | Liquidity (months of OpEx) | Ending cash ÷ period OpEx | months_hundredths | period | ready | GL |
| `look_through_upb` | Look-through UPB | Σ SPE loan-file UPB | usd_cents | — | ready | loan |
| `properties_units` | Properties / units | Count of SPEs and Σ unitCount | count | — | ready | entity |
| `noi_concentration` | NOI concentration | SPE period NOI ÷ Σ SPE period NOI | bps | period | ready | GL |

See [RCP_OPERATING_KPIS.md](./RCP_OPERATING_KPIS.md) for Phase B occupancy / breakeven detail and [RCP_DEBT.md](./RCP_DEBT.md) for covenant journals.

## Controllable OpEx tags

| Tag | Codes | Notes |
| --- | --- | --- |
| Controllable | `5110` `5210` `5310` `5410` `5510` `5610` `5990` | Payroll, R&M, utilities, contracts, marketing, admin, other |
| Non-controllable | `5710` `5810` | Insurance and real estate taxes |
| Contractual (excluded from controllable) | `5910` | Property management fees — disclosed separately |

## Gated — do not invent

| Ratio | Why |
| --- | --- |
| `ltv` | Loan file has UPB. No appraisal. **do not divide UPB by book cost** / PPE and label it LTV. |
| `delinquency` | Account `1110` is a control total. No tenant charges/receipts. |

`@rcp/analytics` `ratioAvailability()` returns `ready: true` for occupancy and loss-to-lease only when `hasRentRoll` is true. Delinquency and LTV (`ltl`) are always `ready: false`.

Do not:

- divide vacancy loss by GPR and label it physical occupancy
- divide mortgage GL by cost basis and label it LTV
- treat tenant AR as a delinquency rate
- annualize one month of NOI and label it T12

## Combined roll-up vs look-through

- **Look-through** — stack wholly owned SPE property KPIs (NOI, units, UPB, DS). Primary OpCo operating dashboard.
- **Combined roll-up** — OpCo + SPEs after IC / AM elimination. Labeled in the header. **not a GAAP consolidation**.
