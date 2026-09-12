# RCP Ratio Dictionary (Stub)

Phase A is a **book ledger**. The following operating and credit ratios are **gated**. They must not be computed, implied, or displayed from GL balances.

| Ratio | Status | Why the GL is insufficient | Ready |
| --- | --- | --- | --- |
| Occupancy (physical / economic) | Gated | Requires a unit file or PMS occupied/vacant counts. Vacancy loss (`4020`) is a dollar contra, not a unit count. | Phase B |
| Loan-to-value / loan-to-cost (LTL) | Gated | Requires a debt instrument file (commitment, current UPB, appraised value / cost basis policy). Mortgage GL is a book UPB only. | Phase C |
| Delinquency / aging | Gated | Requires tenant-level AR aging from PMS or a collections subledger. Account `1110` is a single control total. | Phase B |

`@rcp/analytics` exports `ratioAvailability()` which always returns `{ ready: false }` for these keys.

Do not:

- divide vacancy loss by GPR and label it occupancy
- divide mortgage GL by cost basis and label it LTV/LTL
- treat tenant AR as a delinquency rate

Phase A **may** report book figures that are fully determined by the ledger: NOI, NI, cash, leverage from book UPB vs book equity (clearly labeled book-only if ever added later).
