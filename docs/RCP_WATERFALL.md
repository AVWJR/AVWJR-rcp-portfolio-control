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
- **OpCo cash, CFADS, liquidity, pack CFADS/cash** use **GP/RCP after waterfall**. LP share is labeled **not upstreamed**. **LP pref unpaid** is shown when a template is live.
- Soft-archived SPEs still stay out.

Entry: gold nav **Deals** → SPE card → **LP/GP waterfall** (`/deals/{code}/waterfall`). Also linked from the SPE dashboard and Properties.

## Five templates

Grounded in CRE/REPE practice (deal-level pref + promote, institutional catch-up, multi-hurdle, American vs European). Click a chip to populate; every field stays editable.

1. **Simple pref + promote (no catch-up)** — ROC → LP pref (default 8%) → residual 80% LP / 20% GP.
2. **Institutional pref + 100% catch-up + promote** — ROC → LP pref → 100% GP catch-up until GP has its promote share of profits above ROC → 80/20 residual.
3. **Multi-hurdle IRR promote** — ROC → dollar-pref bands at 8%→20% GP, 12%→30%, 15%→40%. **Honest:** these are dollar-pref proxies of IRR hurdles, not XIRR.
4. **American / deal-by-deal** — same deal-level hurdles as simple pref+promote; clawback/lookback is **flagged for later true-up** (this run does not reverse prior promote).
5. **European / whole-fund style** — no GP promote from this SPE until portfolio/OpCo capital + pref are satisfied (or until LP contributed capital is entered — LP-protective). Residual then splits per promote %.

Engine formulas: `packages/ledger/src/waterfall.ts` (`WATERFALL_FORMULAS`). Integer USD cents. Unit tests: `tests/waterfall-engine.test.ts` (fixed $12M on $10M / 8% / 12 months) and `tests/waterfall-rollup.test.ts`.

## Principal click-test (SPE-HMTOS)

1. Gold nav **Deals**.
2. Open **SPE-HMTOS** (or create/select that live SPE if it exists on this deploy).
3. Click **LP/GP waterfall**.
4. Click **Institutional pref + 100% catch-up + promote**. Enter LP contributed capital if you want ROC/pref to have a base.
5. Read **Applies to OpCo rollup** (LP share vs GP/RCP).
6. **Save waterfall**.
7. Open **OpCo** combined dashboard: Cash / CFADS should say **after waterfall** and no longer equal 100% of SPE-HMTOS cash.

## APIs

- `GET /api/deals/{code}/waterfall`
- `PUT /api/deals/{code}/waterfall` — Principal only (partner view 403 on writes)

Expert: ask **“How do I set the deal waterfall?”**
