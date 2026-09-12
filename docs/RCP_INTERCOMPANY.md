# RCP Intercompany (Phase C)

## Combined roll-up vs consolidation

OpCo’s multi-SPE view is a **combined roll-up**:

- Stacks wholly owned SPE books with OpCo
- Eliminates `1310` / `2310` (due to/from) and `6310` / `7010` (AM fee)
- Does **not** eliminate HoldCo `1350` Investment in Subsidiaries
- Does **not** claim NCI, push-down, or GAAP consolidation

The entity switcher labels this **Combined roll-up**, not “consolidated.”

## Matching rule

For each period (and as-of):

- Σ SPE `2310` (credit net) = OpCo `1310` (debit net)
- Σ SPE `6310` = OpCo `7010`

Unmatched IC is a **hard fail** in `npm run verify:c`. AM fee billing must be accrued on both sides in the same period (SPE below NOI; OpCo income).

Seed August: WBG $4,740 + CVC $4,070 + HCR $1,280 = OpCo $10,090.
