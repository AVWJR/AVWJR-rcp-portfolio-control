# SPE Monthly Close (Phase A)

Timezone: `America/New_York`. Currency: USD.

## Sequence

1. Confirm the period row exists (`YYYY-MM`) and status is `OPEN`.
2. Post operating journals (rent, vacancy, concessions, other income, OpEx).
3. Post cash applications (collections, AP payments).
4. Post below-NOI items last:
   - interest (`6110`)
   - depreciation (`6210`)
   - **OpCo asset management fee (`6310` / `2310`)** — below NOI
5. Mirror the AM fee on OpCo (`1310` / `7010`).
6. Print Trial Balance. Debits must equal credits.
7. Print Income Statement. Confirm AM fees appear below NOI.
8. Print Balance Sheet. Assets must equal liabilities + equity (unclosed NI is added to equity).
9. Print Cash Flow. Beginning cash + net change must equal ending cash.
10. Close the period (`Period.status = CLOSED`) once reviewers sign off. Posted journals cannot be added to a closed period.

## Out of scope this phase

- Live PMS rent-roll import
- Bank feed / reconciliation
- Promote / waterfall
- BigBrainRE underwriting
- Occupancy, LTL, delinquency (see `RCP_RATIO_DICTIONARY_STUB.md`)

## Close is not year-end

Phase A does not auto-close P&L into `3100` / `3900`. Current-period NI is computed and presented on the balance sheet until a future close job is implemented.
