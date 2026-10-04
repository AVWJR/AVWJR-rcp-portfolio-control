# Asset management, Phase 1

One plan per Owned deal. The plan reads that deal's rent roll and the selected period's books, ranks the dollars at stake, and logs decisions. It does not change rents, send messages, post journals, or write to a property-management system.

## What this phase does

- Plan page at `/deals/{code}/plan`, linked from Deals and the deal profile.
- Live baseline for occupancy, loss-to-lease, other income, and payroll / controllable expenses.
- A typed weekly comp update (source, geography, vintage, as-of, retrieved date, terms note) that stores the observation and re-scores the plan.
- One income idea that can be approved or declined. The decision and the action show up in the tracking log.
- Read-only vacancy, lease ladder, other-income accounts, payroll benchmark, budget lines, loan-file covenant, and underwriting snapshot comparison, using data already on file.

## What this phase does not do

- No automated public-source feed, API keys, cron, or crawler. That is Phase 1b.
- No blended rent. Method `phase1-no-blend-v1` stores each observation on its own. Weights are not guessed.
- No pricing band and no monthly KPI target. Both stay blank until supplied. Recommendations need approval.
- No PMS feed, write-back, email, SMS, vendor contact, or rent change.
- No resident names, contacts, unit balances, payment history, screening, or similar fields. Unit codes and property totals only.
- No unit-level delinquency list. Aging is not on file. Account 1110 is a control total, not a delinquency rate.
- No exit timing, refinance, sell, or IRR recommendation.
- No deletion. Plan events and observations are insert-only. A new score supersedes a recommendation by adding a log row.

## Formulas

Amounts are integer cents. Ratios are integer basis points (10,000 = 100%). Division truncates. A missing input or a zero denominator is blank (`Not available`), not zero.

| Figure | Formula |
| --- | --- |
| RevPAU | Period revenue ÷ rentable units. Revenue is book EGI when the period has income-statement activity; otherwise rent-roll in-place rent minus concessions. Rentable units are every unit except `DOWN`. |
| Loss-to-lease | The existing rent-roll KPI. Floored = Σ max(0, market − in-place) on revenue occupied units. Signed keeps gain-to-lease as negative. Vacant, down, model, employee, and admin units are excluded. |
| Physical occupancy | Occupied ÷ rentable. Blank when rentable is zero. |
| Concessions | Σ concession on occupied units. End dates are not on file, so burn-off timing is not calculated. |
| Other income per occupied unit | Book other income (4100 and 4110–4190) ÷ occupied units. |
| Payroll per unit | (5110 + 5120) ÷ rentable units, or the deal unit count when there is no rent roll. Per occupied unit uses occupied units. |
| Controllable opex per unit | 5110, 5120, 5210, 5220, 5410, 5510, 5610, 5910, and 5990 ÷ the same unit denominator. Utilities, taxes, and insurance are excluded. |
| NOI margin | Period NOI ÷ period EGI. |
| Utility recovery | 4110 ÷ (5310–5350). Blank when utilities are zero. |

Ranking uses those dollar impacts, then the RevPAU effect. It does not rank by the occupancy rate. An illustrative RevPAU is shown only when every vacant unit has one sourced asking rent. Several rents for the same floor plan are not blended.

A market observation older than 45 days before the period end is marked stale. That is a display rule. Stale rents are not used in the illustrative comparison.

## How to update a plan

1. Open **Deals**, then the SPE, then **Asset plan**.
2. Use the period in the header. The baseline follows that period.
3. Open **Pricing and market**. Enter the source, geography, as-of date, retrieved date, and a terms note. Click **Save weekly update**. ZORI rows must include the words `Data Provided by Zillow Group`.
4. Open **Income ideas**. Click **Add income idea**. On an idea, type why, then **Approve idea** or **Decline idea**.
5. Open **Tracking log** and confirm the decision is there.

Listing sites whose terms bar automated access are rejected by name. This phase does not call them.

## Data and deployment

New tables: `AssetPlan`, `MarketObservation`, `PlanRecommendation`, `IncomeOpportunity`, `PlanEvent`. Columns are additive. Old deals simply have no plan row until someone saves an update. Viewing the page does not create a plan.

`MarketObservation` and `PlanEvent` are insert-only in the app. Recommendation status can move from open to superseded; the log keeps the prior text. Income-idea status can move from idea to approved or declined; the prior status is in the log.

Do not drop, rename, or reset these tables. Do not seed or purge them. Demo SPEs `SPE-WBG`, `SPE-CVC`, and `SPE-HCR` stay in place. Plan writes do not touch units, journals, or the deal name.

Vercel previews share the production database. Schema changes are safe for `prisma db push` because they only add tables and nullable or defaulted columns.
