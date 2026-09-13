# VERIFY_PHASE_F

Automated: `npm run verify:f` (after `npm run db:reset`). `npm run verify` runs Phase A through F.

**Books-to-tax supports CPA preparation. This system does not file taxes and does not replace CPA or counsel.**

## Done-when checklist

| # | Criterion | How to verify |
| --- | --- | --- |
| 1 | Books-to-tax worksheet per entity (book NI / dep / interest / fees vs tax; MACRS lives; every line BOOKS / TAX / BRIDGE) | `/tax?entity=SPE-WBG&period=2026-08` · `/tax?entity=RCP-OPCO&period=2026-08` |
| 2 | Sample adjustments seeded for one SPE + OpCo | WBG meals + prepaid; OpCo meals + fee-character hook |
| 3 | Partner capital rollforward identity + CSV/Excel K-1-oriented export | `/tax/k1?entity=SPE-WBG&period=2026-08` · `GET /api/tax/k1?...&format=csv` |
| 4 | 1099 vendor master + overlay; empty AP stubs honestly | `/vendors?entity=SPE-WBG&period=2026-08` |
| 5 | Document vault metadata + blobs; upload / list / download | `/vault?entity=SPE-WBG` |
| 6 | Scheduled packs (monthly investor, quarterly lender) + CLI + last-run status | `/scheduler` · `npm run reports:run -- --pack=monthly_investor` |
| 7 | Docs + disclaimer | this file, README, `docs/RCP_TAX_BRIDGE.md`, `docs/RCP_DOCUMENT_VAULT.md`, `docs/RCP_SCHEDULER.md` |
| 8 | `npm run verify:f` + unit tests; A–E chain still green | `npm test` · `npm run verify` |

## Seed SPE to click

**Willow Bend Gardens LLC (`SPE-WBG`)**

- http://localhost:3000/tax?entity=SPE-WBG&period=2026-08
- http://localhost:3000/tax/k1?entity=SPE-WBG&period=2026-08
- http://localhost:3000/vendors?entity=SPE-WBG&period=2026-08
- http://localhost:3000/vault?entity=SPE-WBG&period=2026-08
- http://localhost:3000/scheduler?entity=SPE-WBG&period=2026-08
- http://localhost:3000/tax?entity=RCP-OPCO&period=2026-08

## Commands

```bash
cp .env.example .env
npm install
npm run db:reset
npm test
npm run verify:f
npm run verify
npm run reports:run -- --pack=monthly_investor --entity=SPE-WBG --period=2026-08
npm run dev
```

## Policy the script enforces

- Every worksheet line is labeled BOOKS, TAX, or BRIDGE.
- Worksheet identity: taxable income = book NI − (tax dep − book dep) ± overlays.
- Capital identity: beg + contrib − dist ± NI = end. Seed SPE remains 100% owned.
- K-1 export documents that it is not a filed K-1.
- Empty 1099 overlay stubs (Phase A AP has no vendor subledger).
- WBG vault contains lease, loan, K-1, draw, insurance blobs.
- Scheduler writes PDF + PPTX and persists SUCCESS.

## Out of scope (must remain undone)

Live bank / PMS. Promote waterfall. IRS e-file. SSO. Full AP invoice subledger. LTV from book cost. Redefining Phase D KPIs or moving AM into NOI.
