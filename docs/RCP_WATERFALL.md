# Deal-level LP / GP waterfall

Roche Capital Partners OpCo has historically **looked through 100%** of each live property SPE: cash, NOI, and ratios stack as if RCP owns the SPE outright. That is still the **demo default**. Real Roche deals have unique LP/GP splits and return hurdles. This feature adds a per-SPE waterfall so **cash available for distribution up to RCP OpCo** is the GP/RCP share after the waterfall — not gross SPE cash.

This is a **distribution** engine on CFADS / cash-if-distributed. It does not invent AR aging or delinquency, and it is not a GAAP consolidation with minority interest.

## Current treatment (verified in code)

| Layer | Actual behavior before a template is saved |
| --- | --- |
| Entity tree | HoldCo (`RCP-HOLD`) → OpCo (`RCP-OPCO`) → property SPE/LLC |
| Ownership | Seed SPEs `ownershipBps = 10000` (100%). `isWhollyOwned` exists; OpCo rollup does **not** haircut by that field. |
| OpCo combined | Stacks **live** SPE books + OpCo, eliminates IC `1310`/`2310` and AM `6310`/`7010`. Labeled **combined roll-up — not a GAAP consolidation**. No NCI, no HoldCo `1350` elimination. |
| Look-through | Dashboard NOI, units, UPB, DSCR, debt yield stack 100% of live SPE operating results. |
| Cash / CFADS | OpCo cash = OpCo GL cash + every live SPE’s `1010–1040`. CFADS = look-through NOI − stacked PPE − stacked reserve requirement. Treated as wholly owned. |
| Promote / pref | **None.** Partner capital / K-1 export is a 100% member rollforward. Tax-bridge copy previously said not to invent a promote — that remains true for K-1 special allocations. |
| Soft-archive | `ARCHIVED` SPEs already leave live Deals and OpCo rollup; books and vault stay on Deal Archive. |

Until the Principal clicks a template and **Saves**, nothing in the demo numbers changes.

## After a template is saved

- **Persisted** on `SpeWaterfall` (1:1 with the SPE). Missing row = look-through 100%.
- **Property NOI / occupancy / DSCR** stay look-through (operating performance of the asset).
- **OpCo cash, CFADS, liquidity, pack CFADS/cash** use **RCP after waterfall** (GP-side after optional Co-GP). **LP Monthly Investor Pack / LP narratives** use **LP share after waterfall** plus pref unpaid, catch-up, residual promote, and Co-GP when set — same `SpeWaterfall` row. Property NOI / occupancy / DSCR stay look-through (operating performance of the asset).
- Soft-archived SPEs still stay out.

Entry: gold nav **Deals** → SPE card → **LP/GP waterfall** (`/deals/{code}/waterfall`). **Deal proforma** `/deals/{code}/proforma`. **OpCo proforma** `/opco/proforma`. Also linked from the SPE dashboard and Properties.

## Co-GP (deal/SPE)

Parties at the SPE: **Deal LPs**, **RCP (GP or Co-GP)**, and optional **third-party Co-GP**. Editable:

- Co-GP name
- Co-GP % of GP-side promote / catch-up / residual
- Co-GP % of GP co-invest (ROC / pref / pari passu)

Both shares default **0** (blank name) = prior two-party LP vs single GP/RCP. `rcpCents + coGpCents = gpCents`. OpCo entitlement is **RCP cents**; Co-GP stays at the deal.

## Proformas (forward-looking)

Same engine and Co-GP terms as live rollup / LP packs. Not historical books and not a budget.

1. **Deal level** — Deal LPs vs Deal GPs (RCP + Co-GP). Year 1 CFADS defaults to this period × 12; optional growth; user-entered exit proceeds on the last year.
2. **OpCo level** — aggregates each live SPE’s deal waterfall. **OpCo LPs** = Σ Deal LPs. **OpCo GPs (RCP platform)** = Σ RCP. Co-GP is shown at the deal, not as OpCo GP. Optional OpCo-level pref (enter platform capital + pref rate) splits RCP cash through a simple ROC → pref → residual.

Engine: `packages/ledger/src/proforma.ts`. Tests: `tests/waterfall-engine.test.ts`, `tests/waterfall-proforma.test.ts`.

## A typed 0 is zero

Unreturned capital and LP pref unpaid follow one rule:

- An **empty** box means “use the default.” For unreturned capital, that default is LP contributed capital. For LP pref unpaid, the default is nothing carried in (this period’s pref still accrues).
- A **typed 0** means zero. Return of capital is already done, or unpaid pref carried in is zero. It does not fall back to contributed capital, and it does not disappear into a blank box when you reload.

Older saves could not tell those two apart (both were stored as 0 and treated as empty). Open the deal, type 0 if that is what you mean, and save again. The screen then reloads 0 as 0 and an empty box as empty.

The dollar columns on the waterfall row are still required numbers, so a preview build does not change the shared database. The empty-versus-zero choice is saved next to the tiers (`null` for blank, `"0"` for zero) and that is what the screen reads back.

## If SPE cash were distributed today

That sentence uses **operating cash available** (account 1010) only. It excludes replacement reserves (1020), escrow / impounds (1030), and tenant security deposits (1040). The label on the page says so. Total cash, which still includes those accounts, is shown separately and is not the distribution base.

## Catch-up

The catch-up row is **not** an 80/20 split of that row’s dollars. The 80/20 (or whatever you type on the residual / promote row) is the **GP’s target share** of profits above return of capital. The **Catch-up %** at the top of the deal is the share of each catch-up dollar that goes to the GP.

- At **100%**, every catch-up dollar goes to the GP until the GP holds that target share.
- At **50%**, half of each catch-up dollar goes to the GP and half to the LP, and the row continues until the GP still reaches the same target. It takes more dollars; it does not stop halfway to the target.
- A **70/30** residual moves the target to **30%**. The catch-up row follows the residual row. You do not set a second split on the catch-up row.
- A typed **0** stays 0. It does not jump back to 80/20.

Formula, in whole cents (truncating division):

- `P` = LP preferred return paid in this distribution
- `g` = GP target share from the residual row = GP% / (LP% + GP%)
- `c` = Catch-up % paid to the GP
- When `c` is greater than `g`, catch-up dollars `X = (g × P) / (c − g)`
- The GP receives `c × X`. The LP receives the rest of `X`.
- The residual row then continues at `g`, so the GP’s share of profits above return of capital stays at `g`.

Worked example (the engine’s $12,000,000 distribution on $10,000,000 capital, 8% pref for 12 months, $800,000 pref, $2,000,000 of profits above return of capital):

| Catch-up % | Residual | GP at the end |
| --- | --- | --- |
| 100% | 80/20 | $400,000 (20%) |
| 50% | 80/20 | $400,000 (20%) |
| 100% | 70/30 | $600,000 (30%) |

## Five templates

Grounded in CRE/REPE practice (deal-level pref + promote, institutional catch-up, multi-hurdle, American vs European). Click a chip to populate; every field stays editable.

1. **Simple pref + promote (no catch-up)** — ROC → LP pref (default 8%) → residual 80% LP / 20% GP.
2. **Institutional pref + 100% catch-up + promote** — ROC → LP pref → GP catch-up at the Catch-up % until the GP holds the residual row’s target share of profits above ROC → 80/20 residual. A catch-up below 100% still reaches that target.
3. **Multi-hurdle IRR promote** — ROC → dollar-pref bands at 8%→20% GP, 12%→30%, 15%→40%. **Honest:** these are dollar-pref proxies of IRR hurdles, not XIRR.
4. **American / deal-by-deal** — same deal-level hurdles as simple pref+promote; clawback/lookback is **flagged for later true-up** (this run does not reverse prior promote).
5. **European / whole-fund style** — no GP promote from this SPE until portfolio/OpCo capital + pref are satisfied (or until LP contributed capital is entered — LP-protective). Residual then splits per promote %.

Engine formulas: `packages/ledger/src/waterfall.ts` (`WATERFALL_FORMULAS`). Integer USD cents. Unit tests: `tests/waterfall-engine.test.ts` (fixed $12M on $10M / 8% / 12 months) and `tests/waterfall-rollup.test.ts`.

## Principal click-test (SPE-WBG) — zero, operating cash, catch-up

1. Gold nav **Deals**. Open **SPE-WBG**. Click **LP/GP waterfall**.
2. Click **Simple pref + promote**. Enter LP contributed capital **$1,000,000**. Leave **Unreturned capital** empty. The preview should treat the full $1,000,000 as still invested.
3. Type **0** in Unreturned capital. The box must stay **0**, not go blank. With this month’s distributable cash, return of capital is already done, so the split is the residual promote (not a paydown of the $1,000,000).
4. Type **0** in LP pref unpaid. It must stay **0**.
5. **Save waterfall**. Reload the page. Both zeros are still **0**.
6. Clear Unreturned capital so the box is empty. Save and reload. The box stays empty, and the math again uses the $1,000,000 contributed capital. (When this month’s distributable cash is $18,900 at 8% simple monthly, an empty unreturned box gives Deal LP **$18,900.00**, RCP **$0.00**, and LP pref unpaid **$6,666.66**. Typed 0 and typed pref unpaid 0 give Deal LP **$15,120.00**, RCP **$3,780.00**, and pref unpaid **$0.00**.)
7. Read **If SPE cash were distributed today**. The dollar amount in that sentence is **operating cash available** and the words say it excludes reserves, escrow, and tenant deposits. It should be lower than **Total cash** when those accounts have balances.
8. Click **Institutional pref + 100% catch-up + promote**. Set **Catch-up %** to **50**. The catch-up row should read that **50%** of the row goes to the GP until a **20%** target, and the LP/GP boxes on that row should be locked to the residual row (labeled as the GP target, not as a split of the catch-up).
9. Change the residual row to **70% LP / 30% GP**. The catch-up target should move to **30%**. Type **0** in Catch-up % if you want no catch-up dollars to the GP — it must stay 0, not snap back to 80/20.

## Principal click-test (SPE-HMTOS)

1. Gold nav **Deals**.
2. Open **SPE-HMTOS** (or create/select that live SPE if it exists on this deploy).
3. Click **LP/GP waterfall**.
4. Click **Institutional pref + 100% catch-up + promote**. Enter LP contributed capital if you want ROC/pref to have a base.
5. Read **Applies to OpCo rollup** (Deal LP vs RCP vs Co-GP).
6. Optional: enter a Co-GP name and promote %. Leave 0% to keep two-party LP/GP.
7. **Save waterfall**.
8. Open **Deal proforma** (same SPE) and **OpCo proforma** (`/opco/proforma`).
9. Open **OpCo** combined dashboard: Cash / CFADS say **after waterfall** (RCP).
10. Open **Narratives → Limited Partner** (or export Monthly Investor Pack): distributions / pref / promote must match the SPE waterfall (LP share, not 100% look-through).

## Packs (one source of truth)

The period snapshot carries both the CFADS **pool** and the LP/GP split. Audience packs pick:

| Audience | Economic CFADS / cash |
| --- | --- |
| LP (`monthly_investor`) | LP share after waterfall; pref unpaid; residual LP vs GP promote; Co-GP disclosed |
| GP | RCP after waterfall (promote + catch-up + co-invest, after Co-GP) |
| IC / Management | Pool labeled; LP vs RCP vs Co-GP; do not ship look-through as LP cash |
| Lender | SPE **book** CFADS/cash for coverage/collateral, plus the split disclosed |

Default with no template remains 100% look-through.

## APIs

- `GET /api/deals/{code}/waterfall`
- `PUT /api/deals/{code}/waterfall` — Principal only (partner view 403 on writes)

Expert: ask **“How do I set the deal waterfall?”** (covers Co-GP and where to open deal / OpCo proformas).
