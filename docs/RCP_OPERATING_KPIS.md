# RCP Operating KPIs (Phase B)

Amounts are integer USD cents. Ratios are integer basis points (10_000 = 100.00%).

## Rent-roll sourced (unit master)

These are **not** inferred from the GL. The UI gates them as “Rent-roll sourced”.

| KPI | Formula | Notes |
| --- | --- | --- |
| Physical occupancy | occupied ÷ rentable | Rentable = all units except `DOWN` (offline / rehab). |
| Loss-to-lease | Σ max(0, market − in-place) on `OCCUPIED` | Monthly. In-place above market is ignored. **Not** loan-to-value (Phase C). |
| Vacancy loss (rent roll) | Σ market rent of `VACANT` | Compare to GL `4020`. Seed demo forces equality. |
| Concessions (rent roll) | Σ concession on `OCCUPIED` | Compare to GL `4030`. Seed demo forces equality. |
| Rent-roll GPR | Σ market rent of rentable units | Compare to GL `4010`. `DOWN` units have $0 market rent. |
| Rent-roll economic analog | (in-place − concessions) / rent-roll GPR | Secondary. Primary economic occupancy is book EGI/GPR. |

`DOWN` units are excluded from rentable and do not enter GPR or vacancy.

## Book / GL sourced

| KPI | Formula | Notes |
| --- | --- | --- |
| Economic occupancy (book) | **EGI / GPR** | Documented Phase B definition. EGI = GPR − vacancy − concessions + other income. |
| NOI | EGI − in-NOI OpEx | AM fees (`6310`) stay **below** NOI. |
| Breakeven occupancy | **(OpEx + interest + principal paydown − other income) / GPR** | See below. |

### Breakeven occupancy

```
BE% = (OpEx + Interest + Principal_paydown − Other_income) / GPR
```

- **OpEx** — in-NOI operating expenses from the period income statement (payroll through other opex, including property management `5910`).
- **Interest** — GL `6110`.
- **Principal paydown** — decrease in mortgage UPB (`2110` + `2210`) during the period. Net draws are treated as $0 principal (not negative DS).
- **Other income** — GL `4100`, subtracted because it does not scale with occupancy in this model.
- **Excluded** — depreciation (non-cash) and OpCo AM fees (below-NOI, not property cash DS).

Interpretation: the occupancy rate at which EGI covers OpEx + debt service if vacancy is the only GPR leakage and other income is occupancy-independent. A result above 100% means the property cannot cash-breakeven on GPR alone.

## Delinquency / AR aging

**Not computed.** Tenant AR (`1110`) is a control total. Charge/receipt / aging data does not exist in Phase B. UI shows a TODO stub. Do not divide `1110` by GPR and call it delinquency.

## Budget variance

```
Variance $ = Actual − Budget
Variance % = (Actual − Budget) / Budget     (null if Budget = 0)
MoM $      = Actual − Prior
MoM %      = (Actual − Prior) / Prior       (null if Prior = 0)
```

Budgets are stored by CoA account as natural-magnitude positive cents (GPR, vacancy, opex, etc. are all positive). Contra-revenue lines are displayed as negatives on the operating statement, matching the book income statement.

The 2026-07 seed has opening balances only, so August MoM prior operating activity is $0.

## Combined roll-up

OpCo **combined roll-up** (not a GAAP consolidation) sums wholly owned SPE books plus OpCo and eliminates IC `1310`/`2310` and AM `6310`/`7010`. Rent-roll KPIs on that view are the SPE unit file stacked together.
