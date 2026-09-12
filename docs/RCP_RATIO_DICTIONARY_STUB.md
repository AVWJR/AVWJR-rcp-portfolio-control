# RCP Ratio Dictionary

Phase A is a **book ledger**. Phase B adds a **unit master / rent roll**. Ratios that still lack source data stay gated.

| Ratio | Status | Source | Ready |
| --- | --- | --- | --- |
| Physical occupancy | Ready when a rent roll exists | Occupied ÷ rentable units (`DOWN` excluded) | Phase B |
| Economic occupancy | Ready | **Book: EGI / GPR**. Rent-roll analog: (in-place − concessions) / rent-roll GPR | Phase B |
| Loss-to-lease | Ready when a rent roll exists | Occupied Σ max(0, market − in-place) | Phase B |
| Breakeven occupancy | Ready when GPR and OpEx exist | (OpEx + interest + principal paydown − other income) / GPR | Phase B |
| DSCR | Ready when a loan file + NOI exist | Period NOI ÷ (interest + principal). Threshold stored in bps. | Phase C |
| Debt yield | Ready when a loan file + NOI exist | (Period NOI × 12) ÷ UPB. Threshold stored in bps. | Phase C |
| Loan-to-value / loan-to-cost | Gated | Loan file exists. Still needs appraisal — do not divide UPB by book cost. | Phase D |
| Delinquency / aging | Gated | Requires tenant charges and receipts. Account `1110` is a control total. | Phase B+ |

`@rcp/analytics` `ratioAvailability()` returns `ready: true` for occupancy and loss-to-lease only when `hasRentRoll` is true. Delinquency and LTV are always `ready: false`. DSCR / debt yield live on the loan file (`@rcp/debt`).

Do not:

- divide vacancy loss by GPR and label it physical occupancy
- divide mortgage GL by cost basis and label it LTV
- treat tenant AR as a delinquency rate

See [RCP_OPERATING_KPIS.md](./RCP_OPERATING_KPIS.md) for formulas.
