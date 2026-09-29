# RCP Monthly Financial Statement Format & Structure Standard

**Owner:** LedgerForge (RE accounting controller) for RCP Portfolio Control, the Roche Capital Partners multifamily OpCo
**Applies to:** HoldCo → OpCo → property SPEs (seed: `SPE-WBG`, `SPE-CVC`, `SPE-HCR`)
**Status:** Draft standard (format and structure only). Reviewed against `AVWJR/AVWJR-rcp-portfolio-control` @ `main` (Phases A–F merged). The repo was read only; nothing in it was changed.
**Timezone / currency:** `America/New_York`, USD. Money is stored as **integer USD cents**. Ratios are **integer basis points**, matching the repo's convention.

---

## 0. How to read this document

| Marker | Meaning |
| --- | --- |
| **REPO** | Exists in the repo today (code, doc, or schema). Cited by path. |
| **NEW (proposed)** | Proposed by this standard. It does not exist in the repo yet and needs a future implementation phase plus Principal approval. |
| **CONFLICT** | This standard differs from current repo behavior. The repo stays authoritative until the Principal approves a change. See §10. |
| **[AUTH]** | Backed by an authoritative standard (FASB ASC / ASU). |
| **[AGENCY]** | Backed by a published lender/agency or regulator definition (Fannie Mae Form 4254.DEF, HUD Handbook 4370.2). These are industry references, not GAAP. |
| **[IND-STD]** | Backed by a published industry reporting standard (NCREIF PREA Reporting Standards, IREM). Not GAAP. |
| **[CONV]** | General industry practice / convention. No single authoritative source. |
| `[amount]`, `[count]`, `[pct]`, `[date]`, `[tolerance_*]` | **Placeholders.** This document contains **no real or example figures.** |

---

## 1. Purpose, scope, and basis definitions

### 1.1 Purpose
This standard sets one canonical layout, line hierarchy, account mapping, close-control set, and rent-roll schema for monthly reporting at every RCP entity. As a result:

1. Every SPE income statement and balance sheet prints the same way and ties to the double-entry GL.
2. Imported third-party data (PMS GL exports, T12s, rent rolls) normalizes to the RCP chart of accounts through deterministic, reviewable rules.
3. The OpCo multi-SPE view is a clearly labeled **combined roll-up**, not a consolidation.
4. Close controls are explicit about which failures block a period (hard fail) and which are warnings.

### 1.2 Scope
- **In scope:** statement formats, line order, subtotals, column sets, sign and variance conventions, the chart-of-accounts mapping, vendor-label crosswalk rules, close controls, the rent-roll ingest schema, and lease-expiration and lease-term summary definitions.
- **Out of scope:** actual figures, budgets, thresholds (placeholders only), tax filing (the system supports **CPA export only** and does not file returns; see REPO `docs/RCP_TAX_BRIDGE.md`), GAAP consolidation under ASC 810 (§3.6), promote/waterfall mechanics (REPO `docs/RCP_WATERFALL.md`), live PMS/bank feeds (REPO out of scope per `docs/RCP_SPE_MONTHLY_CLOSE.md`).
- **No invented figures.** Any number in this document is a code, a structural constant (such as the aging bucket boundaries in §8), or a placeholder.

### 1.3 Accounting basis definitions

| Term | Definition | Authority |
| --- | --- | --- |
| **GAAP accrual basis** | Revenue is recognized when earned and expenses when incurred, regardless of cash timing. Lessor operating lease income is recognized on a straight-line basis over the lease term, subject to the collectibility assessment. | [AUTH] ASC 842-30-25-11 to 25-13 |
| **Cash basis** | Revenue is recorded when received and expenses when paid. There are no AR, AP, accrual, or prepaid balances except those created by cash movement. Common in property-manager "cash" reports. | [CONV] |
| **Modified cash basis** | Cash basis plus selected accruals (typically fixed assets/depreciation and debt). Must be disclosed per entity/period. | [CONV] |
| **Management (operating) basis** | A non-GAAP presentation that runs from NOI to cash flow after debt service. It includes balance-sheet cash items (capitalized capex, reserve deposits, loan principal) and excludes non-cash GAAP items (depreciation, amortization of debt issuance costs, straight-line adjustments). | [CONV] / [IND-STD] NCREIF PREA NOI concept |
| **Combined roll-up** | Line-by-line sum of wholly owned entity books with specified intercompany pairs removed. **Not** a GAAP consolidation. | REPO `packages/ledger/src/intercompany.ts` (`COMBINED_ROLLUP_NOTE`) |
| **Rent-roll sourced** | A metric computed from the unit master or rent roll, never inferred from the GL. | REPO `docs/RCP_OPERATING_KPIS.md` |

**Basis flag (NEW, proposed).** Each `(entity, period)` carries `accountingBasis ∈ {ACCRUAL, CASH, MODIFIED_CASH}`. Every imported dataset also carries `sourceBasis`. The repo has no such field today (checked in `prisma/schema.prisma`: neither `Entity` nor `Period` has a basis field). See §7.6.

---

## 2. Monthly multifamily property INCOME STATEMENT standard

### 2.1 Design principles
1. **Two views, one ledger.** (a) The **GAAP accrual income statement** and (b) the **management NOI → cash-flow view** are both generated from the same posted lines. A reconciliation (§2.4) must tie to zero difference.
2. **Contra-revenue, not expense.** Loss-to-lease, vacancy, concessions, non-revenue units, and bad debt reduce revenue above EGI. REPO policy: "Vacancy and concessions are contra-revenue, not operating expenses" (`docs/RCP_COA_OUTLINE.md`). This standard extends the same treatment to the new contra lines. Lender forms can classify some of these differently (§2.8).
3. **Property management fee (`5910`) is ABOVE NOI.** It is an operating expense.
4. **The RCP asset management fee (`6310`) is BELOW NOI** on the SPE P&L (LOCKED POLICY; REPO `docs/RCP_COA_OUTLINE.md` and `packages/ledger/src/coa.ts`). Only the Principal can override. A lender-covenant alternate presentation is described in §2.8.
5. **Capitalized capex never hits the P&L.** It posts to `1460` CIP and then to `1420`–`1450` when placed in service (REPO `docs/RCP_CAPEX.md`). It appears only in the management/cash-flow view.
6. **Loan principal never hits the P&L.** It reduces `2110`/`2210` and appears only in the management/cash-flow view.

### 2.2 Line hierarchy: GAAP accrual income statement (view a)

Indentation shows roll-up. `=` rows are computed subtotals, never posted.

| # | Line | RCP code(s) | Sign on statement | NOI position | Notes |
| --- | --- | --- | --- | --- | --- |
| R1 | **Gross Potential Rent (at market)** | `4010` | + | Above | REPO definition: Σ market rent of rentable units (`DOWN` excluded) (`docs/RCP_OPERATING_KPIS.md`). |
| R2 | Less: Loss-to-Lease / plus Gain-to-Lease | `4015` NEW | − (LTL) / + (GTL) | Above | Market vs lease (contract) rent on occupied units. Single signed account. See CONFLICT C-3. |
| R3 | **= Gross Potential Rent at lease (scheduled rent)** | computed | | Above | R1 + R2. |
| R4 | Less: Vacancy loss | `4020` | − | Above | REPO. Foregone scheduled/market rent on vacant rentable units. |
| R5 | Less: Concessions | `4030` | − | Above | REPO. Includes free rent and move-in specials. Straight-line amortization per §2.9. |
| R6 | Less: Non-revenue units (model / employee / admin-office) | `4040` NEW | − | Above | Only when those units are included in GPR. `DOWN` (offline/rehab) units stay excluded from GPR per REPO. See CONFLICT C-4. |
| R7 | Less: Bad debt / write-offs, net of recoveries | `4050` NEW | − | Above | Lessor collectibility adjustment to lease income ([AUTH] ASC 842-30-25-12/13). Recoveries of previously written-off rent credit this account. |
| R8 | **= Net Rental Income** | computed | | Above | R3 − R4 − R5 − R6 − R7. REPO labels this subtotal "Effective Gross Rent" (EGR) and omits R2/R6/R7 (CONFLICT C-2). |
| R9 | Other income: utility reimbursement / RUBS | `4110` NEW (under `4100`) | + | Above | |
| R10 | Other income: late / NSF fees | `4120` NEW | + | Above | |
| R11 | Other income: application / admin / lease fees | `4130` NEW | + | Above | |
| R12 | Other income: parking / garage | `4140` NEW | + | Above | |
| R13 | Other income: storage | `4150` NEW | + | Above | |
| R14 | Other income: pet rent / pet fees | `4160` NEW | + | Above | Non-refundable pet fees only. Refundable pet deposits are a liability (`2050`). |
| R15 | Other income: laundry / vending | `4170` NEW | + | Above | |
| R16 | Other income: damages / cleaning / forfeited deposits | `4180` NEW | + | Above | Forfeited deposits are recognized only when applied under the lease. |
| R17 | Other income: miscellaneous | `4100` (REPO) / `4190` NEW | + | Above | `4100` stays the REPO parent and catch-all. Sub-accounts roll into it. |
| R18 | **= Total Other Income** | computed | | Above | Σ R9–R17. |
| R19 | **= Effective Gross Income (EGI)** | computed | | Above | R8 + R18. |
| | **Operating expenses: Controllable** | | | | |
| E1 | Payroll & benefits | `5110` (+ `5120` NEW optional) | − | Above | Salaries, wages, payroll taxes, benefits, workers' comp. |
| E2 | Repairs & maintenance | `5210` | − | Above | Ordinary repairs, not capitalizable. |
| E3 | Turnover / make-ready | `5220` NEW (under R&M) | − | Above | Paint, clean, and minor repair between residents. REPO currently books make-ready in `5210` (`docs/RCP_CAPEX.md`). A sub-account keeps that roll-up intact. |
| E4 | Contract services | `5410` | − | Above | Landscaping, pest, security, elevator, and similar contracts. |
| E5 | Marketing & advertising | `5510` | − | Above | |
| E6 | General & administrative | `5610` | − | Above | Office, software, telephone, bank fees, professional fees *at the property level*. Entity-level costs go below NOI (`6410`). |
| E7 | Other operating expenses | `5990` | − | Above | |
| E8 | Property management fee | `5910` | − | **Above** | Third-party or affiliated **property** manager fee. **Distinct from the RCP AM fee `6310`.** The REPO tag is "contractual, disclosed separately" (CONFLICT C-6). |
| E9 | **= Total Controllable OpEx** | computed | | | |
| | **Operating expenses: Non-controllable** | | | | |
| E10 | Real estate taxes | `5810` | − | Above | |
| E11 | Insurance | `5710` | − | Above | |
| E12 | Utilities | `5310` (+ `5320`–`5350` NEW optional) | − | Above | Water/sewer, electric, gas, trash. The REPO tags utilities as *controllable* (CONFLICT C-6). |
| E13 | **= Total Non-controllable OpEx** | computed | | | |
| E14 | **= Total Operating Expenses** | computed | | | E9 + E13. |
| N1 | **= NET OPERATING INCOME (NOI)** | computed | | — | R19 − E14. |
| | **Below NOI (GAAP P&L accounts only)** | | | | |
| B1 | Asset management fee (RCP OpCo) | `6310` | − | **Below** | LOCKED. The IC counterpart is OpCo `7010`. |
| B2 | Partnership / entity-level costs | `6410` NEW | − | Below | Entity legal, audit, tax preparation, state entity fees, and franchise taxes. Consistent with Fannie Mae omitting "Entity Expenses" and "Partnership Fees" from G&A ([AGENCY] Form 4254.DEF). |
| B3 | Interest expense (cash coupon) | `6110` | − | Below | |
| B4 | Interest expense: amortization of debt issuance costs | `6120` NEW | − | Below | Reported as interest expense ([AUTH] ASC 835-30 via ASU 2015-03). Non-cash. |
| B5 | Depreciation | `6210` | − | Below | [AUTH] ASC 360. |
| B6 | Amortization (other intangibles, e.g., acquired in-place leases) | `6220` NEW (optional) | − | Below | Use only if acquisition accounting created intangibles. |
| B7 | Asset management fee income (OpCo only) | `7010` | + | Below | Prints only on OpCo (REPO prints the row when non-zero). |
| N2 | **= GAAP NET INCOME** | computed | | | N1 − B1 − B2 − B3 − B4 − B5 − B6 + B7. |

**Repo alignment note.** REPO `buildIncomeStatement` prints below-NOI rows in the order interest, depreciation, AM fee. This standard puts AM fee and entity costs first so that the GAAP statement and the management view read in the same order. This is presentation only (CONFLICT C-5, low severity). Net income is unchanged.

### 2.3 Line hierarchy: management NOI → cash-flow view (view b)

Items marked *(BS)* come from balance-sheet movements or subledgers, not from P&L accounts.

| # | Line | Source | Notes |
| --- | --- | --- | --- |
| M1 | **NOI** | = N1 | Identical to GAAP NOI (see §2.9 for concession straight-lining). |
| M2 | Less: Replacement reserve deposits *(BS)* | Increase in `1020` funded from operating cash, per loan requirement | This is a transfer between cash accounts, not an expense. Show the deposit **or** the actual recurring capex funded outside the reserve, per the entity's policy flag `reservePresentation ∈ {DEPOSIT, SPEND}`. Never show both for the same dollars. |
| M3 | Less: Recurring capex *(BS)* | Additions to `1460` / `1420`–`1450` tagged `capexClass = RECURRING` | Examples: appliance, flooring, and HVAC unit replacements at turnover (Fannie Mae classes fixture replacement at turnover as capex; [AGENCY] Form 4254.DEF §B.9). |
| M4 | Less: Non-recurring / value-add capex *(BS)* | Additions tagged `capexClass = NON_RECURRING` | Renovation programs and major systems. Often funded by equity or a lender holdback. Show the funding source memo line M4a. |
| M4a | Plus: Capex funded from reserves / equity / holdback *(BS)* | Reserve draws (decrease in `1020`/`1050`), `3010` contributions earmarked for capex | Prevents double-penalizing cash flow when capex is funded from restricted cash or new equity. |
| M5 | Less: Asset management fee | `6310` | Same dollars as B1. Accrual amount; cash-paid variant optional. |
| M6 | Less: Partnership / entity-level costs | `6410` NEW | |
| M7 | **= Cash Flow Before Debt Service (CFBDS)** | computed | This is the "cash flow available for debt service" concept. See terminology note in §2.5. |
| M8 | Less: Interest paid (cash coupon) | `6110` (accrual) adjusted by change in `2030` NEW accrued interest | Exclude `6120` (non-cash). |
| M9 | Less: Scheduled principal *(BS)* | Decrease in `2110` + `2210` (gross UPB, excluding contra `2215`) | REPO `principalPaydownFromLines` treats draws as zero paydown. Keep that rule. |
| M10 | **= Total Debt Service** | M8 + M9 | |
| M11 | **= Cash Flow After Debt Service (levered cash flow)** | M7 − M10 | |
| M12 | Memo: Distributions to members *(BS)* | `3020` | Below the line. Not an operating item. |
| M13 | Memo: Contributions from members *(BS)* | `3010` | |

### 2.4 Reconciliation: GAAP net income ↔ management cash flow (required schedule)

Printed on every monthly package under both views. Each line is one signed amount.

| Step | Line | Direction |
| --- | --- | --- |
| 1 | GAAP Net Income (N2) | start |
| 2 | Add back: Depreciation (`6210`) | + |
| 3 | Add back: Amortization of debt issuance costs (`6120`) | + |
| 4 | Add back: Other amortization (`6220`) | + |
| 5 | Straight-line / concession amortization timing (Δ `1130` NEW) | ± |
| 6 | Remove: AM fee income (`7010`), OpCo only | − |
| 7 | Accrual-to-cash interest adjustment (Δ `2030`) | ± |
| 8 | Less: Scheduled principal (M9) | − |
| 9 | Less: Reserve deposits or recurring capex (M2/M3) | − |
| 10 | Less: Non-recurring capex net of funded sources (M4 − M4a) | − |
| 11 | **= Cash Flow After Debt Service (M11)** | must equal M11 exactly (integer cents) |

**Tie rule.** `Step 11 − M11 = 0`. Any non-zero difference is a **hard fail** (§7.8).

**Relationship to the ASC 230 cash-flow statement.** The management view is **not** the GAAP statement of cash flows. The GAAP statement uses the indirect method (REPO `buildCashFlow`) and reconciles *total cash including restricted cash* ([AUTH] ASC 230 as amended by ASU 2016-18). Transfers between operating cash and restricted reserve cash are **not** cash-flow activities under ASU 2016-18. They are, however, meaningful in the management view (M2). Both statements must be produced. Do not relabel one as the other.

### 2.5 Coverage and cash-flow formulas (conceptual; no figures)

| Metric | Formula | Notes |
| --- | --- | --- |
| **NOI** | EGI − Total OpEx | [IND-STD] NCREIF PREA: NOI is property operating income *before interest expense* and excludes capitalizable expenditures. |
| **CFBDS** ("CFADS" in lender/project-finance usage) | NOI − reserves/recurring capex − AM fee − entity-level costs | Before debt service. |
| **Cash Flow After Debt Service** | CFBDS − (cash interest + scheduled principal) | Levered cash flow available to equity before distributions. |
| **DSCR (NOI basis)** | NOI ÷ (interest + scheduled principal) | REPO `dscr` definition. Matches [IND-STD] NCREIF PREA AM.07 and [AGENCY] Fannie Mae 4254 "DSCR (NOI/Debt Service)". |
| **DSCR (NCF basis)** | (NOI − replacement reserve/capex) ÷ debt service | [AGENCY] Fannie Mae 4254 "DSCR (NCF after CAPEX/Debt Service)". REPO `cfads_dscr` = REPO-CFADS ÷ (interest + principal). |
| **DSCR (covenant basis)** | Per loan agreement definition | **The loan document governs.** Store the definition text with the loan. |
| **Debt yield** | Annualized NOI ÷ UPB | REPO `debt_yield`, [IND-STD] NCREIF PREA AM.06. Label the NOI basis (period annualized vs T12). |
| **Breakeven occupancy** | (OpEx + interest + principal paydown − other income) ÷ GPR | REPO. Unchanged. |

**Terminology note (CONFLICT C-1).** The REPO uses `CFADS` = *period NOI − PPE additions − monthly reserve requirement* as a **distributions proxy**, and `BTCF` = *NOI − interest − principal* (`docs/RCP_RATIO_DICTIONARY_STUB.md`, `docs/RCP_REPORT_CATALOG.md`). Neither REPO metric deducts the AM fee. The requested label "CFADS / cash flow after debt service" merges two concepts. In lender usage, CFADS is cash flow available *for* debt service, which is before debt service. This standard therefore names **CFBDS** (before DS) and **Cash Flow After Debt Service** separately, and avoids the bare acronym "CFADS" on statements until the Principal chooses one canonical definition. Until then, any tile showing REPO `cfads` must carry its REPO formula text.

### 2.6 Column set (both views)

| Col | Header | Definition |
| --- | --- | --- |
| C1 | Month Actual | Posted activity in the period (`inPeriod`). |
| C2 | Month Budget | `BudgetLine` for (entity, year, month, account). REPO stores budgets as natural-magnitude positive cents. |
| C3 | Variance $ | **C1 − C2** (REPO convention: Actual − Budget), computed on natural magnitude. |
| C4 | Variance % | (C1 − C2) ÷ C2. **Null ("—") when C2 = 0** (REPO `pairVariance`). |
| C5 | Fav/(Unfav) flag | See §2.7. |
| C6 | Prior Year Same Month Actual | Same month of the prior fiscal year. Blank if no books. |
| C7 | YTD Actual | Σ C1 from the fiscal-year start through the period. |
| C8 | YTD Budget | Σ C2, same range. |
| C9 | YTD Variance $ | C7 − C8. |
| C10 | YTD Variance % | (C7 − C8) ÷ C8. Null when C8 = 0. |
| C11 | YTD Fav/(Unfav) flag | §2.7. |
| C12 *(optional)* | Prior YTD Actual | Same YTD range, prior year. |
| C13 *(optional)* | Per unit (month) | C1 ÷ unit count (from unit master; see REPO `noi_per_unit`). State whether the denominator is total units or rentable units. |
| C14 *(optional)* | % of EGI | C1 ÷ EGI (C1). Revenue lines above EGI may alternatively show % of GPR; label which. |

REPO also computes **MoM** (Actual − Prior month). It may be shown as an optional column C15 with the same null rule.

### 2.7 Variance sign and favorable/unfavorable convention

- **Arithmetic.** Variance $ is always `Actual − Budget` on the **natural magnitude** (all stored positive, as in REPO budgets). The arithmetic sign is never flipped.
- **Flag.** Each account carries `favorableWhen` (NEW attribute; the REPO has none):

| Account class | `favorableWhen` | Positive variance means |
| --- | --- | --- |
| Revenue (`4010`, `41xx`, `7010`) | `INCREASE` | Favorable |
| Contra-revenue (`4015` LTL side, `4020`, `4030`, `4040`, `4050`) | `DECREASE` | Unfavorable (more loss) |
| Operating & below-NOI expense (`5xxx`, `6xxx`) | `DECREASE` | Unfavorable |
| Subtotals EGI, NOI, CFBDS, CF after DS, Net income | `INCREASE` | Favorable |
| Subtotal Total OpEx | `DECREASE` | Unfavorable |

- `4015` is signed (loss or gain). Evaluate it on the net contra amount: a larger net loss is unfavorable.
- Display: unfavorable in parentheses and/or flagged "U". Favorable flagged "F". Null variance % shows "—".

### 2.8 Lender-covenant alternate presentation (AM fee above NOI)

**Default (LOCKED):** `6310` below NOI.

**When a loan document defines NOI as net of all management fees, or requires asset management fees in operating expenses:**
- Keep the GL and the primary statements unchanged (`6310` stays below NOI).
- Produce a separate **"Lender Covenant NOI"** schedule: Lender NOI = NOI − `6310` (and any other items the loan definition requires, e.g., normalized minimum management fee, required reserves).
- Label it: *"Lender-defined NOI per [loan name] §[section]. Differs from RCP NOI by the items listed."* List each adjusting item.
- Rationale: Fannie Mae Form 4254.DEF §B.1 says servicers should "include asset management fees if expenses relate to operating the Property" in Management Fees, and applies a normalized minimum management fee as a % of EGI ([AGENCY]). Lender NOI can therefore legitimately differ from RCP NOI.
- A Principal **override** that moves `6310` above NOI on the primary statements must be recorded as a policy change with date, approver, and ticket, and applied prospectively with comparative-period restatement noted.

**Other lender-form differences to disclose on the Lender NOI schedule [AGENCY]:**
- Fannie Mae 4254 treats non-revenue units as **expense** (payroll or G&A), not contra-revenue, and does not count them as vacancy.
- HUD Handbook 4370.2 records bad debts as an expense account (6370), not contra-revenue.

RCP keeps both as contra-revenue (§2.2) and reclassifies only on the lender schedule.

### 2.9 Revenue-recognition notes (ASC 842, lessor)
- Residential leases are **operating leases** for the lessor. Lease income is recognized **straight-line over the lease term** when collectibility is probable ([AUTH] ASC 842-30-25-11).
- **Concessions** (free rent, up-front discounts) are part of lease payments and are therefore recognized straight-line over the lease term. The timing difference between concession recognized and concession granted is held in `1130` NEW (Deferred Rent Receivable / straight-line). Many multifamily operators book concessions when granted because leases are short. That is a materiality judgment [CONV] and must be recorded as an entity accounting policy.
- **Collectibility.** If collectibility of a lease's payments is not probable, lease income is limited to the lesser of straight-line income or cash collected. A change in assessment is a current-period adjustment **to lease income** ([AUTH] ASC 842-30-25-12/13). This is why RCP presents bad debt as **contra-revenue** (`4050`).
- **ASC 326 does not apply** to operating lease receivables. ASU 2018-19 excluded "receivables arising from operating leases accounted for in accordance with Topic 842" from Subtopic 326-20 ([AUTH]). A general allowance (`1190`) for a portfolio of receivables that are probable of collection is an **accounting policy election** under ASC 450-20, which the FASB clarified in July 2019 (per PwC Viewpoint §8.8; see Sources). Non-lease receivables (e.g., separately accounted non-lease service fees) may fall under ASC 326.

---

## 3. Standard monthly SPE BALANCE SHEET and roll-up

### 3.1 SPE balance sheet layout

| # | Line | RCP code(s) | Normal bal. | Notes |
| --- | --- | --- | --- | --- |
| | **ASSETS** | | | |
| | *Real estate* | | | |
| A1 | Land | `1410` | Dr | Not depreciated. |
| A2 | Building | `1420` | Dr | |
| A3 | Building improvements | `1430` | Dr | |
| A4 | Site improvements | `1440` | Dr | |
| A5 | Furniture, fixtures & equipment | `1450` | Dr | |
| A6 | Construction in progress | `1460` | Dr | Not depreciated until placed in service (REPO `docs/RCP_CAPEX.md`). |
| A7 | Less: Accumulated depreciation | `1490` | Cr (contra) | [AUTH] ASC 360. |
| A8 | **= Real estate, net** | computed | | |
| | *Cash and restricted cash* | | | |
| A9 | Cash: operating | `1010` | Dr | Unrestricted. |
| A10 | Restricted cash: tenant security deposits | `1040` | Dr | REPO notes "Restricted cash". Held in trust where required by state law [CONV]. |
| A11 | Restricted cash: replacement reserve | `1020` | Dr | Lender-held or owner-held per loan. |
| A12 | Restricted cash: tax & insurance escrow | `1030` | Dr | REPO name "Escrow / Impound". |
| A13 | Restricted cash: other lender reserves | `1050` NEW | Dr | Repair escrow, debt-service reserve, holdbacks. |
| A14 | **= Total cash and restricted cash** | computed | | This subtotal ties to the ASC 230 statement of cash flows ending balance ([AUTH] ASU 2016-18). When shown on multiple lines, a reconciliation to the cash-flow statement is required. |
| | *Receivables and other* | | | |
| A15 | Tenant receivables | `1110` | Dr | REPO: control total only. The aging subledger is not built (REPO `docs/RCP_OPERATING_KPIS.md`). |
| A16 | Less: Allowance for doubtful accounts | `1190` | Cr (contra) | Policy election (§2.9). |
| A17 | Deferred rent receivable (straight-line) | `1130` NEW | Dr | Only if concessions are straight-lined. |
| A18 | Other receivables | `1120` NEW | Dr | Insurance claims, utility-billing vendor remittances, and other non-tenant receivables. |
| A19 | Due from related parties (IC receivable) | `1310` | Dr | On OpCo: AM fee due from SPEs. On an SPE: normally zero unless the SPE advanced funds. |
| A20 | Prepaid expenses | `1210` | Dr | Insurance, taxes paid in advance, service contracts. |
| A21 | Investment in subsidiaries | `1350` | Dr | REPO: HoldCo → OpCo. **Not used on SPEs.** |
| A22 | Suspense: unmapped import | `1999` NEW | either | Must be zero at soft close (§6.5, §7.8). |
| A23 | **= TOTAL ASSETS** | computed | | |
| | **LIABILITIES** | | | |
| L1 | Accounts payable | `2010` | Cr | REPO: control total. No vendor invoice subledger. |
| L2 | Accrued expenses | `2020` | Cr | |
| L3 | Accrued interest payable | `2030` NEW | Cr | Needed so interest accrues to the servicer statement (§7.5). |
| L4 | Accrued real estate taxes | `2035` NEW | Cr | |
| L5 | Prepaid rent / tenant credits | `2040` | Cr | Resident credit balances on the rent roll (§7.2). |
| L6 | Tenant security deposits payable | `2050` | Cr | Must tie to the rent roll deposits held **and** be considered against `1040` restricted cash (§7.2). |
| L7 | Due to related parties (IC payable) | `2310` | Cr | On an SPE: AM fee payable to OpCo. |
| L8 | Mortgage payable: current portion | `2110` | Cr | Next-12-month scheduled principal (REPO LT → current roll journal in `docs/RCP_DEBT.md`). |
| L9 | Mortgage payable: long-term | `2210` | Cr | |
| L10 | Less: Unamortized debt issuance costs | `2215` NEW | Dr (contra-liability) | [AUTH] ASC 835-30-45-1A: debt issuance costs are shown as a **direct deduction from the face amount** of the note, not as an asset. Exception: line-of-credit costs may be deferred as an asset (ASU 2015-15 SEC staff announcement). |
| L11 | **= Mortgage payable, net** | computed | | L8 + L9 − L10. Present as "Mortgage payable, net of unamortized debt issuance costs". |
| L12 | **= TOTAL LIABILITIES** | computed | | |
| | **MEMBERS' EQUITY** | | | |
| Q1 | Members' contributions | `3010` | Cr | REPO: `3010` = contributions (verified). |
| Q2 | Less: Members' distributions | `3020` | Dr (contra-equity) | REPO: `3020` = distributions (verified). |
| Q3 | Retained earnings (prior years) | `3100` | Cr | REPO: used at year-end close. |
| Q4 | Current-year earnings | `3900` + unclosed current-year NI | Cr | REPO: `3900` is the close target and is "unused while period is open". The BS computes unclosed NI (CONFLICT C-7). |
| Q5 | **= TOTAL MEMBERS' EQUITY** | computed | | |
| Q6 | **= TOTAL LIABILITIES + EQUITY** | computed | | Must equal A23 exactly (hard fail). |

**Current vs long-term.** A classified balance sheet is optional for SPEs [CONV]. If classified:
- Current assets: cash and restricted cash expected to be used within the operating cycle, receivables, prepaids, IC receivable.
- Current liabilities: AP, accruals, prepaid rent, deposits, IC payable, and `2110`.
- Debt issuance costs (`2215`) are allocated pro rata between current and long-term debt, or presented entirely against long-term debt with that policy disclosed [CONV].

REPO today classifies deposits and IC payable as current and does not separate restricted cash lines (CONFLICT C-8, presentation only).

### 3.2 Sign conventions on the balance sheet
- The ledger stores debits and credits as non-negative integer cents per line (REPO `PostedLine`). Balances are debit − credit.
- Statements show assets, liabilities, and equity as positive amounts. Contra accounts (`1190`, `1490`, `2215`, `3020`) show as negatives within their section.

### 3.3 HoldCo → OpCo → SPE roll-up mechanics

| Step | Action |
| --- | --- |
| 1 | Select the as-of period and scope: a single SPE, OpCo + all live SPEs, or HoldCo + OpCo + SPEs. Archived SPEs are excluded unless explicitly requested (REPO `lifecycleStatus`). |
| 2 | Verify every in-scope entity has a period row with the same `YYYY-MM` and a close status. Mixed statuses print a banner: "Roll-up includes OPEN periods". |
| 3 | Run the intercompany review (REPO `reviewIntercompany`): Σ SPE `2310` = OpCo `1310` and Σ SPE `6310` = OpCo `7010`. **Unmatched = hard fail** (REPO `docs/RCP_INTERCOMPANY.md`). |
| 4 | Sum each account's posted lines across entities. The master CoA is cloned identically onto every entity (REPO), so codes align one-for-one. |
| 5 | Apply eliminations (§3.4). |
| 6 | Build TB, IS, BS, and CF from the eliminated line set (REPO `ReportInput.eliminate = true`). |
| 7 | Run the tie checks (§3.5). |
| 8 | Print the header label: **"COMBINED ROLL-UP. NOT A GAAP CONSOLIDATION. NOT A TAX CONSOLIDATION."** (REPO wording in `COMBINED_ROLLUP_NOTE` and `docs/RCP_TAX_BRIDGE.md`). |

**Ownership.** Seed SPEs are wholly owned (`ownershipBps` at the REPO default meaning 100.00%). The roll-up stacks 100% of each SPE. When a deal waterfall is saved, the REPO applies the RCP share to OpCo **cash/CFADS** views only, not to the stacked statements (REPO `docs/RCP_WATERFALL.md`, `docs/RCP_RATIO_DICTIONARY_STUB.md`). Partially owned SPEs are flagged in the roll-up header. No NCI is computed.

### 3.4 Elimination entries

| # | Debit side (removed) | Credit side (removed) | Entities | REPO status |
| --- | --- | --- | --- | --- |
| E-1 | OpCo `1310` Due from related parties | SPE `2310` Due to related parties | OpCo ↔ each SPE | **REPO eliminates** (`ELIMINATION_CODES`) |
| E-2 | OpCo `7010` AM fee income | SPE `6310` AM fee expense | OpCo ↔ each SPE | **REPO eliminates** |
| E-3 | SPE members' equity (`3010`/`3020`/`3100`/`3900`) | Parent `1350` Investment in subsidiaries | HoldCo ↔ OpCo (and OpCo ↔ SPE if OpCo carries an investment) | **REPO does NOT eliminate.** `1350` is described as "HoldCo → OpCo". This standard keeps E-3 **out of the combined roll-up** to stay consistent with the REPO, and lists it only as the step that true consolidation would require. |
| E-4 | Any other IC pair (e.g., IC loans, cost reimbursements) | | | NEW (proposed): must use `1310`/`2310` so they fall into E-1 automatically. No new IC codes. |

**Elimination journal vs presentation-only elimination.**

| Approach | Description | REPO | Standard |
| --- | --- | --- | --- |
| Presentation-only (filter) | Report builder drops all lines on elimination codes from the combined line set. No journal is posted anywhere. | **REPO today:** `applyEliminations` filters out codes `1310`, `2310`, `6310`, `7010`. | **Adopted.** Keep it. |
| Elimination journal (elim entity) | Post reversing entries in a dedicated non-legal "ELIM" entity, preserving an audit trail of amounts removed. | Not implemented. | Optional future enhancement (NEW, proposed). Needed only if partial eliminations or non-matching IC ever have to be carried. |

**Implication of the filter approach.** It is exact only when the pairs match to the cent. That is why IC match is a **hard fail** before any roll-up prints. The filter also removes any *third-party* activity mistakenly posted to `1310`/`2310`. Rule: **`1310`/`2310`/`6310`/`7010` are reserved for RCP intercompany only.** A non-IC related-party balance (e.g., an affiliated property manager) must use a separate account. NEW proposal: `1320` Due from affiliates (non-eliminating) and `2320` Due to affiliates (non-eliminating).

### 3.5 Roll-up tie checks

| # | Check | Result on failure |
| --- | --- | --- |
| T-1 | Each entity's TB: Σ debits = Σ credits | Hard fail |
| T-2 | Σ SPE `2310` credit-net = OpCo `1310` debit-net (per period and as-of) | Hard fail |
| T-3 | Σ SPE `6310` = OpCo `7010` (period and YTD) | Hard fail |
| T-4 | Eliminated amounts net to zero: (E-1 debit removed − E-1 credit removed) = 0 and (E-2 income removed − E-2 expense removed) = 0 | Hard fail |
| T-5 | Combined TB after elimination balances | Hard fail |
| T-6 | Combined BS: assets = liabilities + equity | Hard fail |
| T-7 | Combined NI = Σ entity NI − `7010` removed + `6310` removed | Hard fail (arithmetically zero difference when T-3 passes) |
| T-8 | Combined cash-flow statement: beginning + net change = ending (total cash incl. restricted) | Hard fail |
| T-9 | All entities in scope share the same period and none are archived (unless requested) | Warning |
| T-10 | `1350` present in scope with no E-3 → banner "Investment in subsidiaries not eliminated (combined roll-up, not consolidation)" | Informational (expected) |

### 3.6 When true consolidation (ASC 810) would apply: OUT OF SCOPE
- GAAP consolidation applies when a reporting entity has a **controlling financial interest** in another legal entity. Control is assessed under the **variable interest entity (VIE) model** or the **voting interest entity model** ([AUTH] ASC 810-10; see the Deloitte Consolidation Roadmap in Sources).
- Consolidation would require, at minimum:
  - elimination of investment against subsidiary equity (E-3);
  - elimination of **all** IC balances and transactions, including unrealized profits;
  - noncontrolling interest presentation for partially owned SPEs;
  - consistent accounting policies and period-ends;
  - the related disclosures.
- Triggers that would make consolidated statements necessary [CONV]: an audit of HoldCo or OpCo under GAAP, a lender or investor requirement for consolidated GAAP statements, or a partially owned SPE requiring NCI.
- **This standard and the REPO do not produce GAAP consolidated statements.** Any such requirement goes to the CPA.

---

## 4. Canonical RCP chart of accounts

### 4.1 Rules
1. **The REPO master CoA is canonical** (`packages/ledger/src/coa.ts`, mirrored in `docs/RCP_COA_OUTLINE.md`). All REPO codes below were verified against `coa.ts` fields (`type`, `normalBalance`, `isContra`, `isBelowNoi`, `isCash`, `reportGroup`, `cashFlowClass`).
2. NEW codes fill gaps only. They are numbered inside the REPO's existing bands and do not reuse a REPO code.
3. Every NEW code must be given a REPO `reportGroup` that the existing report builders already sum, or it needs a code change. The **Report group** column shows the proposal. Groups marked † do not exist in the REPO and require builder changes before use.
4. **Never map by foreign account number alone.** Public and vendor numbering schemes collide with RCP codes. Example: HUD 4370.2 uses `1310` for Mortgagee Escrow Deposits and `2310` for Notes Payable (Long-Term), but RCP `1310`/`2310` are intercompany. Mapping is by label/keyword plus an approved per-client number map (§6).

### 4.2 Chart of accounts table

Legend. Type: A = asset, L = liability, Q = equity, R = revenue, X = expense. NB = normal balance. NOI = Above/Below/n.a. CF = REPO `cashFlowClass`.

| Code | Name | Type | NB | Contra | Statement / section | NOI | Report group | CF | Source | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1010 | Cash — Operating | A | Dr | | BS / Cash | n.a. | cash | NONE | REPO | `isCash` |
| 1020 | Cash — Replacement Reserve | A | Dr | | BS / Restricted cash | n.a. | cash | NONE | REPO | `isCash`; restricted |
| 1030 | Cash — Escrow / Impound | A | Dr | | BS / Restricted cash | n.a. | cash | NONE | REPO | Tax & insurance escrow |
| 1040 | Cash — Security Deposits | A | Dr | | BS / Restricted cash | n.a. | cash | NONE | REPO | REPO note "Restricted cash" |
| 1050 | Cash — Other Lender Reserves | A | Dr | | BS / Restricted cash | n.a. | cash | NONE | NEW (proposed) | Repair / DSR / holdback |
| 1110 | Accounts Receivable — Tenant | A | Dr | | BS / Receivables | n.a. | ar | OPERATING | REPO | Control total |
| 1120 | Other Receivables | A | Dr | | BS / Receivables | n.a. | ar | OPERATING | NEW (proposed) | Non-tenant |
| 1130 | Deferred Rent Receivable (straight-line) | A | Dr | | BS / Receivables | n.a. | ar | OPERATING | NEW (proposed) | ASC 842 straight-line concessions |
| 1190 | Allowance for Doubtful Accounts | A | Cr | Yes | BS / Receivables | n.a. | ar | OPERATING | REPO | ASC 450 policy election |
| 1210 | Prepaid Expenses | A | Dr | | BS / Other assets | n.a. | prepaid | OPERATING | REPO | |
| 1310 | Due from Related Parties | A | Dr | | BS / IC | n.a. | ic_from | OPERATING | REPO | **Eliminates** vs `2310` |
| 1320 | Due from Affiliates (non-eliminating) | A | Dr | | BS / Other assets | n.a. | ar | OPERATING | NEW (proposed) | Keeps non-RCP related parties out of the E-1 filter |
| 1350 | Investment in Subsidiaries | A | Dr | | BS / Investments | n.a. | investment | INVESTING | REPO | HoldCo → OpCo; **not eliminated** |
| 1410 | Land | A | Dr | | BS / Real estate | n.a. | ppe | INVESTING | REPO | |
| 1420 | Building | A | Dr | | BS / Real estate | n.a. | ppe | INVESTING | REPO | |
| 1430 | Building Improvements | A | Dr | | BS / Real estate | n.a. | ppe | INVESTING | REPO | |
| 1440 | Site Improvements | A | Dr | | BS / Real estate | n.a. | ppe | INVESTING | REPO | |
| 1450 | Furniture, Fixtures & Equipment | A | Dr | | BS / Real estate | n.a. | ppe | INVESTING | REPO | |
| 1460 | Construction in Progress | A | Dr | | BS / Real estate | n.a. | cip | INVESTING | REPO | Capex lands here |
| 1490 | Accumulated Depreciation | A | Cr | Yes | BS / Real estate | n.a. | ppe | NONE | REPO | |
| 1999 | Suspense — Unmapped Import | A | Dr | | BS / Suspense | n.a. | suspense† | NONE | NEW (proposed) | Must be zero at soft close |
| 2010 | Accounts Payable | L | Cr | | BS / Current liab. | n.a. | ap | OPERATING | REPO | |
| 2020 | Accrued Expenses | L | Cr | | BS / Current liab. | n.a. | accrual | OPERATING | REPO | |
| 2030 | Accrued Interest Payable | L | Cr | | BS / Current liab. | n.a. | accrual | OPERATING | NEW (proposed) | Tie to servicer |
| 2035 | Accrued Real Estate Taxes | L | Cr | | BS / Current liab. | n.a. | accrual | OPERATING | NEW (proposed) | |
| 2040 | Prepaid Rent / Unearned Revenue | L | Cr | | BS / Current liab. | n.a. | prepaid_rent | OPERATING | REPO | Resident credits |
| 2050 | Tenant Security Deposits | L | Cr | | BS / Current liab. | n.a. | deposits | OPERATING | REPO | |
| 2110 | Mortgage Payable — Current | L | Cr | | BS / Debt | n.a. | debt_current | FINANCING | REPO | UPB tie uses 2110 + 2210 |
| 2210 | Mortgage Payable — Long Term | L | Cr | | BS / Debt | n.a. | debt_lt | FINANCING | REPO | |
| 2215 | Unamortized Debt Issuance Costs | L | Dr | Yes | BS / Debt (contra) | n.a. | debt_lt | FINANCING | NEW (proposed) | ASC 835-30-45-1A. **Exclude from UPB tie.** REPO `principalPaydownFromLines` sums `debt_lt`, so it must be changed to exclude `2215` first. |
| 2310 | Due to Related Parties | L | Cr | | BS / IC | n.a. | ic_to | OPERATING | REPO | **Eliminates** vs `1310` |
| 2320 | Due to Affiliates (non-eliminating) | L | Cr | | BS / Current liab. | n.a. | ap | OPERATING | NEW (proposed) | |
| 3010 | Members' Contributions | Q | Cr | | BS / Equity | n.a. | contrib | FINANCING | REPO | Verified: contributions |
| 3020 | Members' Distributions | Q | Dr | Yes | BS / Equity | n.a. | distrib | FINANCING | REPO | Verified: distributions |
| 3100 | Retained Earnings | Q | Cr | | BS / Equity | n.a. | re | NONE | REPO | Year-end close target |
| 3900 | Current Year Earnings (close) | Q | Cr | | BS / Equity | n.a. | ni_close | NONE | REPO | Unused while period open |
| 4010 | Gross Potential Rent | R | Cr | | IS / Rental revenue | Above | gpr | OPERATING | REPO | At market |
| 4015 | Loss/Gain to Lease | R | Dr | Yes | IS / Rental revenue | Above | ltl† | OPERATING | NEW (proposed) | Signed; credit balance = gain |
| 4020 | Vacancy Loss | R | Dr | Yes | IS / Rental revenue | Above | vacancy | OPERATING | REPO | |
| 4030 | Concessions / Free Rent | R | Dr | Yes | IS / Rental revenue | Above | concessions | OPERATING | REPO | |
| 4040 | Non-Revenue Units | R | Dr | Yes | IS / Rental revenue | Above | nru† | OPERATING | NEW (proposed) | Model / employee / admin |
| 4050 | Bad Debt, net of Recoveries | R | Dr | Yes | IS / Rental revenue | Above | bad_debt† | OPERATING | NEW (proposed) | ASC 842 collectibility |
| 4100 | Other Income | R | Cr | | IS / Other income | Above | other_income | OPERATING | REPO | Parent / catch-all |
| 4110 | Utility Reimbursement / RUBS | R | Cr | | IS / Other income | Above | other_income | OPERATING | NEW (proposed) | |
| 4120 | Late / NSF Fees | R | Cr | | IS / Other income | Above | other_income | OPERATING | NEW (proposed) | |
| 4130 | Application / Admin / Lease Fees | R | Cr | | IS / Other income | Above | other_income | OPERATING | NEW (proposed) | |
| 4140 | Parking / Garage | R | Cr | | IS / Other income | Above | other_income | OPERATING | NEW (proposed) | |
| 4150 | Storage | R | Cr | | IS / Other income | Above | other_income | OPERATING | NEW (proposed) | |
| 4160 | Pet Rent / Pet Fees | R | Cr | | IS / Other income | Above | other_income | OPERATING | NEW (proposed) | |
| 4170 | Laundry / Vending | R | Cr | | IS / Other income | Above | other_income | OPERATING | NEW (proposed) | |
| 4180 | Damages / Cleaning / Forfeited Deposits | R | Cr | | IS / Other income | Above | other_income | OPERATING | NEW (proposed) | |
| 4190 | Miscellaneous Other Income | R | Cr | | IS / Other income | Above | other_income | OPERATING | NEW (proposed) | Optional; else use 4100 |
| 5110 | Payroll | X | Dr | | IS / OpEx controllable | Above | opex_payroll | OPERATING | REPO | |
| 5120 | Payroll Taxes & Benefits | X | Dr | | IS / OpEx controllable | Above | opex_payroll | OPERATING | NEW (proposed, optional) | |
| 5210 | Repairs & Maintenance | X | Dr | | IS / OpEx controllable | Above | opex_rm | OPERATING | REPO | |
| 5220 | Turnover / Make-Ready | X | Dr | | IS / OpEx controllable | Above | opex_rm | OPERATING | NEW (proposed) | |
| 5310 | Utilities | X | Dr | | IS / OpEx non-controllable (this std) | Above | opex_util | OPERATING | REPO | CONFLICT C-6 |
| 5320 | Utilities — Water & Sewer | X | Dr | | IS / OpEx non-controllable | Above | opex_util | OPERATING | NEW (proposed, optional) | Fannie 4254 separates W&S |
| 5330 | Utilities — Electric | X | Dr | | IS / OpEx non-controllable | Above | opex_util | OPERATING | NEW (proposed, optional) | |
| 5340 | Utilities — Gas / Fuel | X | Dr | | IS / OpEx non-controllable | Above | opex_util | OPERATING | NEW (proposed, optional) | |
| 5350 | Utilities — Trash | X | Dr | | IS / OpEx non-controllable | Above | opex_util | OPERATING | NEW (proposed, optional) | |
| 5410 | Contract Services | X | Dr | | IS / OpEx controllable | Above | opex_contracts | OPERATING | REPO | |
| 5510 | Marketing | X | Dr | | IS / OpEx controllable | Above | opex_marketing | OPERATING | REPO | |
| 5610 | Administrative | X | Dr | | IS / OpEx controllable | Above | opex_admin | OPERATING | REPO | Property-level G&A |
| 5710 | Insurance | X | Dr | | IS / OpEx non-controllable | Above | opex_ins | OPERATING | REPO | |
| 5810 | Real Estate Taxes | X | Dr | | IS / OpEx non-controllable | Above | opex_tax | OPERATING | REPO | |
| 5910 | Property Management Fees | X | Dr | | IS / OpEx controllable (this std) | **Above** | opex_pm | OPERATING | REPO | Not the AM fee |
| 5990 | Other Operating Expenses | X | Dr | | IS / OpEx controllable | Above | opex_other | OPERATING | REPO | |
| 6110 | Interest Expense | X | Dr | | IS / Below NOI | Below | interest | OPERATING | REPO | Cash coupon |
| 6120 | Interest — Amortization of Debt Issuance Costs | X | Dr | | IS / Below NOI | Below | interest | OPERATING | NEW (proposed) | Non-cash; add back in CF |
| 6210 | Depreciation Expense | X | Dr | | IS / Below NOI | Below | depreciation | OPERATING | REPO | |
| 6220 | Amortization — Other Intangibles | X | Dr | | IS / Below NOI | Below | depreciation | OPERATING | NEW (proposed, optional) | REPO CF adds back `is.depreciation`, so this group is added back automatically |
| 6310 | Asset Management Fees | X | Dr | | IS / Below NOI | **Below** | am_fee | OPERATING | REPO | LOCKED; eliminates vs `7010` |
| 6410 | Partnership / Entity-Level Costs | X | Dr | | IS / Below NOI | Below | entity_costs† | OPERATING | NEW (proposed) | |
| 7010 | Asset Management Fee Income | R | Cr | | IS / Below NOI (OpCo) | Below | am_income | OPERATING | REPO | OpCo only; eliminates vs `6310` |

**Implementation caution for NEW codes in existing groups.** Putting `6120` in the REPO `interest` group means REPO DSCR/breakeven, which read `is.interest`, would include non-cash amortization. The REPO calculators should be changed to read `6110` only for debt service before `6120` is enabled. Likewise, putting `2215` in `debt_lt` would distort REPO principal paydown and the UPB tie unless excluded. **No NEW code should be activated until the related REPO builder change ships.**

### 4.3 Statement mapping summary (codes → lines)

| Statement line (§2 / §3) | Codes |
| --- | --- |
| GPR (market) | 4010 |
| Loss/Gain to lease | 4015 |
| Vacancy / Concessions / NRU / Bad debt | 4020 / 4030 / 4040 / 4050 |
| Other income | 4100, 4110–4190 |
| Controllable OpEx | 5110, 5120, 5210, 5220, 5410, 5510, 5610, 5990, 5910 |
| Non-controllable OpEx | 5710, 5810, 5310, 5320–5350 |
| Below NOI (P&L) | 6310, 6410, 6110, 6120, 6210, 6220, (+7010 OpCo) |
| Real estate, net | 1410–1460, 1490 |
| Cash & restricted cash | 1010, 1020, 1030, 1040, 1050 |
| Receivables & other | 1110, 1120, 1130, 1190, 1210, 1310, 1320, 1350, 1999 |
| Liabilities | 2010, 2020, 2030, 2035, 2040, 2050, 2310, 2320, 2110, 2210, 2215 |
| Equity | 3010, 3020, 3100, 3900 |

---

## 5. Vendor label → RCP code crosswalk

### 5.1 Honesty statement (read first)
- **Yardi Voyager, RealPage (OneSite / Accounting), Entrata, and AppFolio charts of accounts are configured per client.** None publishes a single default multifamily CoA that could be verified here. Yardi's product page and a third-party Yardi consultant both describe client-defined GL account trees. No vendor-published default GL numbering was found in public sources.
- **redIQ** (now **Radix Underwriting**) maps uploaded operating statements to the **user's own chart of accounts**. Its SmartMap+ feature assigns confidence ratings to each automated mapping (Radix press page, Sep 2023). A public list of redIQ normalized T12 categories was **not found**. The redIQ column below uses typical underwriting category wording and is marked accordingly.
- Therefore the vendor columns contain **typical label wording** (common GL, T12, and rent-roll captions seen in the industry) and **no vendor account numbers**. Confidence per row: **T** = typical wording, not verified against a vendor-published list. **R** = wording also appears in REPO alias rules (`packages/properties/src/t12-map.ts`) or REPO sample files.
- Two public, numbered references **are** verifiable and are included for context: **HUD Handbook 4370.2 Rev-1 Ch. 4 Chart of Accounts** (numbers verified from the HUD PDF, dated 5/92) and **Fannie Mae Form 4254.DEF (Aug 2024)** line items. **Do not import HUD numbers as RCP codes.** They collide (§4.1 rule 4).
- **Standing rule:** *typical labels; client COAs vary; mapping is by label/keyword with manual review fallback.*

### 5.2 Crosswalk table: revenue

| RCP | Yardi Voyager (typical) | RealPage OneSite/Acctg (typical) | Entrata (typical) | AppFolio (typical) | redIQ / Radix T12 category (typical) | Conf. | HUD 4370.2 ref (verified) | Fannie 4254 line (verified) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4010 | "Gross Potential Rent", "Market Rent", "Rent - Residential", "Unit Rent" | "Gross Potential Rent", "Market Rent", "Rental Income" | "Gross Potential Rent", "Market Rent", "Rent" | "Rent Income", "Rent" | Gross Potential Rent | T, R | 5120 Rent Revenue – Apartments | A.1 GPR |
| 4015 | "Loss to Lease", "Gain/Loss to Lease", "Gain to Lease" | "Loss to Lease", "Gain to Lease" | "Loss to Lease" | (often absent; cash-style books) | Loss to Lease | T (REPO maps LTL → 4030, see C-3) | — | Within A.1 ("Gain/Loss to Lease must be added/subtracted from GPR") |
| 4020 | "Vacancy Loss", "Vacancy" | "Vacancy Loss", "Physical Vacancy" | "Vacancy Loss" | (often absent) | Vacancy / Physical Vacancy | T, R | 5220 Vacancies – Apartments | A.2 Vacancy Loss |
| 4030 | "Concessions", "Rent Concessions", "Move-In Concessions", "Free Rent" | "Concessions", "Rent Concession" | "Concessions", "Specials" | "Concession", "Rent Discount" | Concessions | T, R | Not in the 1992 list read here (later HUD/agency versions reportedly add a concessions account; verify version) | A.4 Concessions |
| 4040 | "Model Unit", "Employee Unit", "Admin/Office Unit", "Non-Revenue Units" | "Model/Office", "Employee Apartment", "Non-Revenue" | "Model", "Employee", "Non-Revenue Units" | (usually absent) | Non-Revenue Units | T | 6312 Office or Model Apartment Rent; 6331 Manager or Superintendent Rent Free (expense-side in HUD) | Not in A.2. Expensed in Payroll / G&A (B.2/B.3) |
| 4050 | "Bad Debt", "Bad Debt Expense", "Write-Offs", "Bad Debt Recovery", "Collection Loss" | "Bad Debt", "Write Off", "Recovery" | "Bad Debt", "Write Offs" | "Bad Debt", "Write-off" | Bad Debt / Credit Loss | T | 6370 Bad Debts (expense-side in HUD) | A.3 Bad Debt |
| 4110 | "Utility Reimbursement", "RUBS", "Water/Sewer Reimb", "Trash Reimb" | "Utility Reimbursement", "RUBS Income" | "Utility Income", "Utility Reimbursement" | "Utility Reimbursement", "Utility Billback" | Utility Reimbursement / RUBS | T, R | — | A.8 Other (Utility Income; Reimbursements) |
| 4120 | "Late Fees", "NSF Fees", "Late Charges" | "Late Fee", "NSF" | "Late Fees", "NSF Fees" | "Late Fee", "NSF Fee" | Fee Income | T | 5920 NSF and Late Charges | A.8 Other (Late Fees; Non-Sufficient Fund Fees) |
| 4130 | "Application Fees", "Admin Fees", "Lease Termination Fees" | "Application Fee", "Administrative Fee" | "Application Fee", "Admin Fee" | "Application Fee", "Admin Fee" | Fee Income | T | 5990 Other Revenue | A.8 Other (Application Fees; Non-Refundable Fees) |
| 4140 | "Parking Income", "Garage Rent", "Carport" | "Parking", "Garage" | "Parking" | "Parking Income" | Parking | T, R | 5170 Garage and Parking Spaces | A.6 Parking Income |
| 4150 | "Storage Income", "Storage Rent" | "Storage" | "Storage" | "Storage Income" | Other Income | T | 5990 Other Revenue | A.8 Other (Storage Income) |
| 4160 | "Pet Rent", "Pet Fees" | "Pet Rent", "Pet Fee" | "Pet Rent", "Pet Fee" | "Pet Rent", "Pet Fee" | Other Income | T, R | 5990 Other Revenue | A.8 Other (Pet Income) |
| 4170 | "Laundry Income", "Vending Income" | "Laundry", "Vending" | "Laundry" | "Laundry Income" | Laundry / Vending | T, R | 5910 Laundry and Vending Revenue | A.5 Laundry/Vending |
| 4180 | "Damages", "Cleaning Fees", "Forfeited Deposits" | "Damage Fee", "Forfeited Deposit" | "Damages", "Cleaning Fees" | "Damage Charges" | Other Income | T | 5930 Damages and Cleaning Fees; 5940 Forfeited Tenant Security Deposits | A.8 Other (Forfeited Security Deposits) |
| 4100 / 4190 | "Miscellaneous Income", "Other Income" | "Misc Income" | "Other Income" | "Other Income" | Other Income | T, R | 5990 Other Revenue (specify) | A.8 Other Income |
| 7010 | n/a at property; OpCo books only | | | | | — | — | — |

### 5.3 Crosswalk table: expenses and below NOI

| RCP | Yardi Voyager (typical) | RealPage (typical) | Entrata (typical) | AppFolio (typical) | redIQ / Radix category (typical) | Conf. | HUD 4370.2 ref (verified) | Fannie 4254 line (verified) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 5110 / 5120 | "Salaries - Office", "Salaries - Maintenance", "Payroll Taxes", "Employee Benefits", "Workers Comp" | "Payroll", "Benefits" | "Payroll", "Salaries" | "Payroll", "Salaries & Wages" | Payroll & Benefits | T, R | 6310 Office Salaries; 6330 Manager or Superintendent Salaries; 6510/6540 payroll lines; 6711 Payroll Taxes; 6722/6723 WC / Health | B.3 Payroll and Benefits |
| 5210 | "Repairs & Maintenance", "Plumbing", "Electrical", "HVAC Repairs", "Appliance Repairs" | "Repairs & Maintenance" | "Repairs & Maintenance" | "Repairs", "Maintenance" | Repairs & Maintenance | T, R | 6541 Repairs Material; 6542 Repairs Contract; 6546 Heating/Cooling Repairs | B.9 R&M |
| 5220 | "Make Ready", "Turnover", "Painting - Turnover", "Carpet Cleaning", "Unit Turn" | "Turnover", "Make Ready" | "Make Ready" | "Turnover" | Turnover / Make-Ready (often within R&M) | T, R | 6560 Decorating Payroll/Contract; 6561 Decorating Supplies | B.9 R&M (Make Ready; Turnover; Painting (Turnover)) |
| 5410 | "Landscaping", "Pest Control", "Security", "Elevator Contract", "Pool Service" | "Contract Services" | "Contract Services" | "Landscaping", "Pest Control" | Contract Services | T, R | 6517 / 6519 / 6530 / 6537 / 6545 / 6547 | B.9 R&M (Landscaping; Pest Control); B.2 G&A (Security Services) |
| 5510 | "Advertising", "Marketing", "Internet Listing", "Resident Relations" | "Marketing", "Advertising" | "Marketing" | "Advertising" | Marketing & Advertising | T, R | 6210 Advertising; 6250 Other Renting Expenses | B.6 Advertising and Marketing |
| 5610 | "Office Supplies", "Telephone", "Software", "Bank Fees", "Legal - Property", "Postage" | "Administrative", "G&A" | "Administrative" | "Office Expense", "Bank Fees" | General & Administrative | T, R | 6311 Office Supplies; 6340 Legal Expense – Project; 6350 Audit; 6360 Telephone; 6390 Misc Administrative | B.2 G&A; B.7 Professional Fees |
| 5910 | "Management Fees", "Property Management Fee" | "Management Fee" | "Management Fee" | "Management Fees" | Management Fee | T, R | 6320 Management Fee | B.1 Management Fees (Fannie includes AM fees here; see §2.8) |
| 5990 | "Other Operating", "Miscellaneous Expense" | "Other Expense" | "Other" | "Other Expense" | Other Expenses | T, R | 6590 Misc Operating & Maintenance | B.12 Other Expenses |
| 5710 | "Property Insurance", "Liability Insurance" | "Insurance" | "Insurance" | "Insurance" | Insurance | T, R | 6720 Property & Liability Insurance | B.10 Property Insurance |
| 5810 | "Real Estate Taxes", "Property Taxes" | "Real Estate Taxes" | "Property Tax" | "Property Tax" | Real Estate Taxes | T, R | 6710 Real Estate Taxes | B.11 Real Estate Taxes |
| 5310–5350 | "Electric", "Water", "Sewer", "Gas", "Trash Removal", "Vacant Utilities" | "Utilities" | "Utilities" | "Utilities", "Water", "Electric" | Utilities | T, R | 6450 Electricity; 6451 Water; 6452 Gas; 6453 Sewer; 6525 Garbage and Trash Removal | B.4 Utilities; B.5 Water and Sewer |
| 6310 | "Asset Management Fee" (owner books only) | "Asset Mgmt Fee" | "Asset Management" | "Asset Management Fee" | Asset Management (below NOI) | T | — | Within B.1 for lender purposes |
| 6410 | "Partnership Expense", "Entity Fees", "Audit/Tax - Entity", "Franchise Tax" | "Owner Expense", "Partnership" | "Owner Expenses" | "Owner Expense" | Below NOI / Non-operating | T | 7110–7190 entity expense accounts (e.g., 7190 Other Expenses (Entity)) | Omitted from G&A ("Entity Expenses"; "Partnership Fees") |
| 6110 | "Mortgage Interest", "Interest Expense" | "Interest" | "Interest Expense" | "Mortgage Interest" | Debt Service – Interest | T, R | 6820 Interest on Mortgage Payable | Omitted from OpEx; D.2 Debt Service |
| 6120 | "Amortization - Loan Costs", "Amortization of Financing Costs" | "Amortization" | "Amortization" | "Amortization" | Below NOI | T | — | Omitted ("Amortization"; "Financing Fees") |
| 6210 | "Depreciation" | "Depreciation" | "Depreciation" | "Depreciation" | Below NOI | T | 6600 series Depreciation | Omitted ("Depreciation") |
| Capex (BS 1460) | "Capital Expenditures", "Capital Improvements", "Replacements" | "Capital Expenditures" | "CapEx" | "Capital Improvements" | Capital Expenditures / Replacement Reserve | T | 1400 series Fixed Assets | C.1 CapEx (Replacement Reserve); C.2 Extraordinary CapEx |
| Principal (BS 2110/2210) | "Mortgage Principal" | "Principal" | "Principal" | "Mortgage Principal" | Debt Service – Principal | T | 2320 Mortgage Payable | Omitted from G&A ("Mortgage Loan principal payments") |

### 5.4 Vendor-specific notes (structure, not numbers)

| Vendor | Observed / documented structure | Source quality |
| --- | --- | --- |
| Yardi Voyager | "Rent Roll with Lease Charges" is a standard residential report exportable to Excel, summarized by unit (third-party export instructions). Nested charge-code lines per unit plus a per-unit "Total" row and metadata rows (as-of date, property) appear in the REPO sample `data/samples/hampton/RR_-_Hampton_Gardens_-_Lease_Charges.xlsx`, parsed by REPO dialect `yardi_lease_charges`. REPO sample T12 labels carry a numeric-prefix pattern (`NNNN-NNN Label`). REPO `mapYardiCodeToAccount` range heuristics come from that sample. **That numbering is client-specific, not a Yardi standard**, and it is subordinate to label matching. | Third-party help page + REPO sample (R) |
| RealPage OneSite / Accounting | Rent roll exports commonly include unit, status, sq ft, lease dates, market rent, and lease/actual rent, with subtotal bands that need stripping. No RealPage-published column spec was verified. | T (third-party summaries only) |
| Entrata | "Market Rent" vs "Lease Rent" / actual rent distinction is common in exports. No Entrata-published column spec was verified. | T |
| AppFolio | The Rent Roll report is customizable (add/remove columns; Report Builder combines data). The AppFolio blog confirms report customization. GL accounts are client-defined. Books may be cash-basis [CONV; verify per client]. | Vendor blog (customization) + T |
| redIQ / Radix Underwriting | Rent roll and operating-statement processors map to the **user's** chart of accounts with confidence ratings (SmartMap+). REPO dialect `redi_q_machine` recognizes redIQ machine headers (`UnitID`, `OccStatus`, `MktRent`, `InPlaceRent`, `NetSF`) per `docs/RCP_RENT_ROLL_DIALECTS.md`. | Vendor press page + REPO (R) |

---

## 6. Label matching rules (GL / T12 import normalization)

### 6.1 Pipeline

| Step | Rule |
| --- | --- |
| 1. Capture | Store raw label, raw account number (if any), source system, entity, period, section header context, and row index. Vault the original file byte-for-byte (REPO pattern for rent rolls). |
| 2. Split number | Detect a leading account number (REPO pattern: four digits, optional `-NNN` suffix, then label). Keep it as `sourceAccountNo`. **Do not use it for mapping unless step 4a has an approved client map.** |
| 3. Normalize text | Lowercase. `&` → "and". Strip punctuation except `/`. Collapse whitespace. Expand abbreviations from the synonym table §6.3. |
| 4. Match (precedence) | **4a** Approved client map `(client, sourceSystem, sourceAccountNo, normalizedLabel)` → code. **4b** Exact normalized-label dictionary. **4c** Ordered regex/keyword rules, most specific first (§6.2). **4d** Section-context tiebreak: the header above the row (Income / Expense / Other / Below NOI) constrains the allowed code classes. |
| 5. Skip | Subtotal and total rows (`total`, `subtotal`, `net operating income`, `noi`, `egi`, `effective gross`, `net income`, etc.) are **not** mapped. They are captured as **check totals** and compared to Σ mapped children (§6.4). REPO `SKIP_LABEL` implements part of this. |
| 6. Sign | Normalize to natural magnitude by class. Contra-revenue lines shown negative in the source are stored positive in the contra account. Recoveries within bad debt reduce `4050`. Log any sign flip. |
| 7. Unmapped | Post to `1999` Suspense (GL import) or hold in the import's `unmapped` list (T12/budget import, REPO pattern). Either way, raise a **close blocker** (§7.8). |
| 8. Review | Mapper output includes `confidence ∈ {EXACT, CLIENT_MAP, RULE, CONTEXT, NONE}`. All `RULE` and `CONTEXT` mappings on a new source require one-time controller approval, which then promotes them to `CLIENT_MAP`. |

### 6.2 Ordered keyword rules (specific → generic)

The first match wins. Patterns are case-insensitive substrings or regexes on normalized text.

| Order | Pattern | → Code | Resolves |
| --- | --- | --- | --- |
| 1 | `asset management`, `asset mgmt` | 6310 | Must precede generic "management fee" → 5910 |
| 2 | `property management`, `management fee`, `mgmt fee`, `pm fee` | 5910 | |
| 3 | `loss to lease`, `gain to lease`, `ltl`, `lease differential` | 4015 | REPO currently maps LTL → 4030 (C-3) |
| 4 | `model`, `employee unit`, `employee apt`, `admin unit`, `office unit`, `non revenue`, `nru`, `courtesy unit` (income section) | 4040 | Must precede payroll ("employee") and admin rules |
| 5 | `bad debt`, `write off`, `writeoff`, `collection loss`, `credit loss`, `recover` (income section) | 4050 | |
| 6 | `concession`, `free rent`, `move in special`, `rent discount`, `specials` | 4030 | |
| 7 | `vacancy`, `vacancy loss`, `physical vacancy` (NOT `vacant utilit`) | 4020 | "Vacant utilities" is an expense (5310) |
| 8 | `utility reimb`, `rubs`, `billback`, `water reimb`, `trash reimb`, `utility income` | 4110 | Must precede generic `utilit` → 5310 |
| 9 | `late fee`, `late charge`, `nsf` | 4120 | |
| 10 | `application fee`, `admin fee`, `administrative fee`, `lease break`, `termination fee` (income section) | 4130 | |
| 11 | `parking`, `garage`, `carport` (income section) | 4140 | Expense-section "parking lot repair" → 5210 |
| 12 | `storage` (income section) | 4150 | |
| 13 | `pet rent`, `pet fee` | 4160 | Refundable `pet deposit` → 2050 (BS) |
| 14 | `laundry`, `vending` | 4170 | |
| 15 | `damage`, `cleaning fee`, `forfeited deposit` (income section) | 4180 | |
| 16 | `interest income`, `investment income` | 4100 | Must precede `interest` → 6110 |
| 17 | `amortization` with `loan` / `financing` / `debt` | 6120 | |
| 18 | `depreciation`; other `amortization` | 6210; 6220 | |
| 19 | `interest`, `mortgage interest` | 6110 | |
| 20 | `principal`, `mortgage principal` | BS 2110/2210 (not P&L) | Management-view item only |
| 21 | `capital expenditure`, `capex`, `capital improvement`, `replacement` (non-R&M context) | BS 1460 | Must not go to 5210 |
| 22 | `partnership`, `entity`, `franchise tax`, `owner expense`, `investor reporting` | 6410 | |
| 23 | `make ready`, `turnover`, `unit turn`, `painting turnover`, `carpet clean` | 5220 | Must precede generic R&M |
| 24 | `payroll`, `salar`, `wage`, `bonus`, `benefit`, `payroll tax`, `workers comp`, `health insurance` | 5110 / 5120 | Must precede `insurance` → 5710 |
| 25 | `repair`, `maintenance`, `r and m`, `plumbing`, `electrical`, `hvac repair`, `appliance repair` | 5210 | |
| 26 | `landscap`, `pest`, `security`, `elevator`, `pool service`, `contract` | 5410 | |
| 27 | `marketing`, `advertis`, `promotion`, `resident relations` | 5510 | |
| 28 | `real estate tax`, `property tax`, `ad valorem` | 5810 | Must precede generic `tax` |
| 29 | `insurance` | 5710 | |
| 30 | `electric`, `water`, `sewer`, `gas`, `trash`, `utilit`, `vacant utilities` | 5310 (or 5320–5350) | |
| 31 | `office`, `admin`, `legal`, `professional`, `audit`, `telephone`, `software`, `bank fee`, `postage` | 5610 | Entity-level legal/audit → 6410 when tagged entity-level |
| 32 | `rent`, `gross potential`, `market rent`, `apartment rent`, `residential rent`, `unit rent`, `rental income` | 4010 | **Last** among revenue rules so that more specific rent-adjacent labels win |
| 33 | `other income`, `misc income`, `ancillary` | 4100 | |
| 34 | `other expense`, `misc expense` | 5990 | |
| — | anything else | **UNMAPPED → 1999 / blocker** | |

Differences from the REPO `t12-map.ts` alias order are listed in §10 (C-3, C-9). This standard does not change REPO code.

### 6.3 Normalization synonym table (excerpt; extend per client)

| Canonical token | Synonyms |
| --- | --- |
| repairs and maintenance | r&m, r & m, repairs/maint, maint & repairs |
| utility reimbursement | util reimb, rubs, ratio utility billing, utility billback, utility recovery |
| management fee | mgmt fee, mgt fee, pm fee |
| concession | conc, special, free rent, move-in special |
| non-revenue unit | nru, model, admin unit, employee unit, courtesy unit, office unit |
| bad debt | write-off, w/o, collection loss, credit loss |
| real estate tax | re tax, property tax, ad valorem tax |
| water and sewer | w/s, w&s, water/sewer |

### 6.4 Import control totals
- Each import must reconcile: Σ mapped lines + Σ unmapped lines = source grand total (per section when the source has section totals). A mismatch is a hard fail for that import.
- Source subtotals (e.g., source NOI) are compared to RCP-computed subtotals **after** mapping. A difference is a **warning** with a line-level explanation (usually classification, such as AM fee above NOI in the source).

### 6.5 Suspense handling
- `1999` must be **zero** at soft close and at hard lock. A non-zero balance blocks the transition.
- Each suspense posting carries the raw label and a ticket reference. Clearing entries reverse suspense and post to the resolved code. An approved mapping is saved as a client map (step 4a).

---

## 7. Month-end close controls

### 7.1 Alignment with the REPO close workflow
REPO (`packages/ledger/src/close.ts`, `docs/RCP_SPE_MONTHLY_CLOSE.md`):

`OPEN` → **soft close** (operating posts blocked; controller adjustments only) → checklist items `DONE`/`NA` → **hard lock** (`CLOSED`; all posts rejected) → **reopen** only with non-empty **reason + ticket**. Each transition is logged in `PeriodCloseEvent`.

This standard keeps those states and transitions unchanged. It adds tie-outs, tolerances, maker-checker, and a hard-fail/warning split. Existing REPO checklist codes are reused. New ones are marked NEW.

### 7.2 Rent roll → GL tie-outs

All rent-roll figures are **rent-roll sourced** from the unit master as of period end. REPO rule: never derive occupancy from `4020`.

| ID | Tie-out | Rent-roll side | GL side | Tolerance param | Severity on breach |
| --- | --- | --- | --- | --- | --- |
| RR-1 | GPR (market) | Σ market rent of rentable units (DOWN excluded; REPO definition) | `4010` period | `tol.gpr` | Warning above tolerance. Hard fail if the rent roll is missing for an SPE with units (REPO checklist `rent_roll`). |
| RR-2 | Scheduled (lease) rent | Σ lease rent on occupied units | `4010` − `4015` (NEW) | `tol.sched_rent` | Warning |
| RR-3 | Loss/Gain to lease | Σ (market − lease rent) on occupied units, signed | `4015` | `tol.ltl` | Warning. REPO KPI floors at zero (in-place above market ignored). This standard proposes signed GTL (C-3). |
| RR-4 | Vacancy | Σ market rent of vacant rentable units (prorated for days vacant if the GL is prorated; state the method) | `4020` | `tol.vacancy` | Warning |
| RR-5 | Concessions | Σ concessions recognized in period per rent roll / concession schedule | `4030` (+ Δ `1130` if straight-lined) | `tol.concession` | Warning |
| RR-6 | Non-revenue units | Σ market rent of MODEL / EMPLOYEE / ADMIN units (if in GPR) | `4040` | `tol.nru` | Warning |
| RR-7 | Tenant AR / delinquency | Σ resident balances > 0, by aging bucket (§8.1) | `1110` (gross); `1190` reviewed against the oldest bucket and collectibility assessments | `tol.ar` | **Gated.** The REPO has no charge/receipt subledger, so aging cannot be tied. Until a subledger or rent-roll balance column is ingested, the item is `NA` with the note "delinquency stub". Once available: warning above tolerance. |
| RR-8 | Security deposits (liability) | Σ deposits held per rent roll (resident + other deposits) | `2050` | `tol.deposit` | **Hard fail** above tolerance (fiduciary balance) |
| RR-9 | Security deposits (restricted cash) | `2050` | `1040` bank balance | `tol.deposit_cash` | Warning (segregation is not required everywhere [CONV]). Hard fail if the entity policy flag `depositsSegregated = true`. |
| RR-10 | Prepaid rent / credits | Σ resident credit balances (negative balances) | `2040` | `tol.prepaid` | Warning |
| RR-11 | Unit count | Total units in rent roll = entity `unitCount`; occupied + vacant + down (+ sub-statuses) = total | Entity master | exact | **Hard fail** on count mismatch (structural) |
| RR-12 | As-of date | Rent-roll as-of date within `tol.asof_days` of period end | Period `endDate` | `tol.asof_days` | Warning. Hard fail if the rent roll is from a different month. |
| RR-13 | Charge lines vs unit totals | Σ charge lines per unit = per-unit "Total" row | Source file | exact | Warning (REPO already logs this for `yardi_lease_charges`) |

**Tolerance parameters.** All `tol.*` values are **configurable per entity** in a parameter table (NEW, proposed). Each parameter has an absolute form (`tol.<name>_cents`) and a relative form (`tol.<name>_bps`). The breach test is "either exceeded" unless configured otherwise. **No default values are set by this standard.** Initial values are `[tolerance_to_be_set_by_Principal]`. "Exact" means zero difference in integer cents or counts. This is not an invented threshold: the REPO already uses exact equality for TB, BS, cash-flow, and IC checks.

### 7.3 Period lock, soft → hard close, reopen (REPO-aligned)

| Stage | Allowed | Blocked | Evidence |
| --- | --- | --- | --- |
| OPEN | All postings | — | — |
| SOFT_CLOSED | Controller adjustments only (`allowControllerAdjustment`) | Operating posts (`PeriodSoftClosedError`) | `softClosedAt`; `PeriodCloseEvent(SOFT_CLOSE)` |
| CLOSED (hard lock) | Nothing | All posts (`PeriodLockedError`) | Requires every checklist item `DONE`/`NA` (`assertChecklistComplete`); `lockedAt` |
| Reopen | Transition to OPEN | Without reason + ticket (`ReopenRequiresReasonError`) | `reopenReason`, `reopenTicket`, `PeriodCloseEvent(REOPEN)` |

Additions (NEW, proposed):
- The hard lock requires **zero hard-fail findings** (§7.8), not only checklist status.
- A reopen of period *P* invalidates the "tied" status of later periods for the same entity and of all roll-ups containing it. Those re-run T-1 through T-8 before any pack is re-issued.
- Prior-period adjustments are posted in the **current open period** with a memo reference, unless the Principal approves a reopen.

### 7.4 Maker-checker and sign-off

| Role | Responsibility |
| --- | --- |
| Maker (preparer) | Posts journals, runs imports, completes checklist items, attaches evidence (statements, reconciliations). |
| Checker (reviewer) | A different person from the maker. Reviews each reconciliation and marks the item `DONE`/`NA` with notes. |
| Controller (LedgerForge) | Soft close, hard lock, approves client mappings and suspense clears. |
| Principal | Approves policy overrides (AM fee placement, tolerances, basis changes) and reopen of hard-locked periods where required. |

The REPO `CloseChecklistItem` has `status`, `notes`, `reviewedAt` but **no preparer/reviewer identity** (CONFLICT C-10). Proposed fields: `preparedBy`, `preparedAt`, `reviewedBy`, `reviewedAt`, `evidenceRef`. Rule: `preparedBy ≠ reviewedBy`. Journal-level maker-checker for manual journals above `tol.manual_je_review` is also proposed.

### 7.5 Required reconciliations checklist

REPO checklist codes appear in `code` font. New items are marked NEW.

| # | Reconciliation | Evidence | Maps to REPO code | Severity if not done |
| --- | --- | --- | --- | --- |
| 1 | Period row exists | Period record | `period_row` | Hard |
| 2 | Operating journals posted | Journal list | `operating_journals` | Hard |
| 3 | Cash applications posted | Deposits / AP payments | `cash_apps` | Hard |
| 4 | **Bank reconciliation** for every cash account (`1010`, `1020`, `1030`, `1040`, `1050`): GL = bank statement ± reconciling items; reconciling items aged | Bank statements | NEW `bank_rec` | Hard |
| 5 | **Reserves / escrows vs lender or servicer statements** (`1020`, `1030`, `1050`) | Servicer escrow statement | NEW `reserve_escrow_rec` | Hard |
| 6 | **Debt UPB** (`2110` + `2210`, gross of `2215`) = loan file UPB = servicer statement. **Accrued interest** (`2030`) = servicer interest accrued through period end. | Servicer statement, loan file | `debt_covenants` (extend) | Hard |
| 7 | Current/LT debt split = next-12-month scheduled principal | Amortization schedule | `debt_covenants` | Hard |
| 8 | Below-NOI items posted (interest, depreciation, AM fee) | Journals | `below_noi` | Hard |
| 9 | OpCo AM fee mirror posted | IC review | `am_mirror` | Hard |
| 10 | **IC balances match** (Σ SPE `2310` = OpCo `1310`; Σ `6310` = `7010`) | `reviewIntercompany` | `intercompany` | Hard |
| 11 | **Fixed asset / CIP roll-forward.** `1460`: beginning + additions − placed in service − disposals = ending. `1410`–`1450`: beginning + PIS additions − disposals = ending. Accumulated depreciation roll. | Capex project register | `capex_cip` (extend) | Hard |
| 12 | Capex vs R&M classification reviewed | Invoices above `tol.capex_review` | `capex_cip` | Warning |
| 13 | **AP / accruals**: `2010` control total vs open-invoice list (when available); `2020`/`2030`/`2035` supported by schedule | Accrual schedule | NEW `ap_accrual_rec` | Warning (REPO: AP is a control total only) |
| 14 | **Prepaid expenses** (`1210`) amortization schedule ties | Prepaid schedule | NEW `prepaid_rec` | Warning |
| 15 | **Security deposits** RR-8 / RR-9 | Rent roll | NEW `deposit_rec` | Hard (RR-8) |
| 16 | Rent roll confirmed; RR-1 to RR-13 run | Rent roll | `rent_roll` | Hard if missing |
| 17 | **Trial balance balances** | TB | `trial_balance` | Hard |
| 18 | Income statement: AM fee below NOI | IS | `income_statement` | Hard |
| 19 | Balance sheet balances (A = L + E) | BS | `balance_sheet` | Hard |
| 20 | Cash flow ties (beginning + net change = ending, total incl. restricted) | CF | `cash_flow` | Hard |
| 21 | **BS roll-forward**: prior-period ending balance = current-period beginning balance for every BS account (no posting into a locked prior period) | BS comparative | NEW `bs_rollforward` | Hard |
| 22 | GAAP ↔ management reconciliation ties (§2.4) | Recon schedule | NEW `mgmt_recon` | Hard |
| 23 | Budget loaded; variance reviewed; explanations for variances above `tol.variance_explain` | Variance report | `budget_os` | Warning |
| 24 | Breakeven occupancy reviewed | KPI | `breakeven` | Warning |
| 25 | Suspense `1999` = 0 | TB | NEW `suspense_zero` | Hard |
| 26 | Basis flag set; cash-basis conversions posted (§7.6) | Basis memo | NEW `basis_flag` | Hard if unset |

### 7.6 Accrual vs cash basis handling

| Situation | Ingest behavior | Required accrual adjustments (if entity basis = ACCRUAL) |
| --- | --- | --- |
| Property manager provides an **accrual** GL/T12 | Map directly. Label `sourceBasis = ACCRUAL`. | None beyond standard close. |
| Property manager provides a **cash** GL/T12 | Label `sourceBasis = CASH`. The statement header prints "Source: cash basis, converted" or "Source: cash basis, not converted". | (1) **AP accrual:** Dr expense / Cr `2020` for goods and services received but unpaid; reverse next period. (2) **Prepaids:** Dr `1210` / Cr expense for amounts paid covering future periods; amortize. (3) **Tenant AR:** Dr `1110` / Cr rent revenue for charges billed but uncollected; assess collectibility (§2.9). (4) **Prepaid rent:** Dr revenue / Cr `2040` for cash received for future periods. (5) **Accrued interest:** Dr `6110` / Cr `2030`. (6) **Accrued RE taxes:** Dr `5810` / Cr `2035`. (7) **Depreciation**, if absent. |
| Entity basis = CASH or MODIFIED_CASH (by policy) | Keep as provided. | None. Every statement header prints the basis. **The combined roll-up cannot mix bases.** A mixed-basis roll-up is a **hard fail** unless all cash-basis members are converted. |

The REPO has no basis field. Add `Entity.defaultBasis` and `Period.basis` (NEW, proposed). Conversions post as a single labeled journal per period (`source = "basis_conversion"`) so they can be reversed and audited.

### 7.7 Budget and variance governance
- Budgets are loaded per account per month (REPO `BudgetLine`, natural magnitude).
- NEW accounts that are not budgeted show budget = 0 and variance % = "—".
- Budget roll-up for parent lines (e.g., `4100` + `41xx`) sums children.

### 7.8 Close blockers: hard fails vs warnings

| Class | Findings | Effect |
| --- | --- | --- |
| **HARD FAIL** | TB out of balance; BS out of balance; cash-flow tie failure; IC mismatch (T-2/T-3); elimination net ≠ 0 (T-4); suspense `1999` ≠ 0; unmapped import lines; import control total mismatch; unit-count mismatch (RR-11); rent roll missing for an SPE with units, or from the wrong month; security deposit liability breach (RR-8); bank rec not complete or unreconciled difference; UPB ≠ servicer or loan file; BS roll-forward break; GAAP ↔ management reconciliation ≠ 0; basis flag unset or mixed-basis roll-up; AM fee not below NOI on the primary statement (absent a recorded override); any checklist item `PENDING`. | Blocks hard lock. A roll-up with any member in hard fail prints a "NOT CLOSED" banner. |
| **WARNING** | RR-1 to RR-7, RR-9 (unless segregation is required), RR-10, RR-12 (same month), RR-13; source-subtotal vs RCP-subtotal differences; variance explanations above threshold; capex/R&M review items; AP/accrual/prepaid support gaps where the REPO has no subledger; partial ownership in roll-up. | Requires a comment. Does not block. |
| **INFORMATIONAL** | `1350` not eliminated in the combined roll-up; T12 incomplete (REPO rule: do not annualize and call it T12); delinquency gated. | Banner only. |

---

## 8. Rent roll ingest: canonical tenant/lease schema

### 8.1 Minimum fields

The REPO field column refers to `CanonicalUnit` / `Unit` in `packages/properties/src/rent-roll-canonical.ts` and `prisma/schema.prisma`. NEW means the field is not in the REPO canonical model (today it can only be stored in `extras`).

| # | Field | Type | Req. | REPO field | Notes |
| --- | --- | --- | --- | --- | --- |
| F1 | `property_code` (SPE code) | string | Req | entity context | |
| F2 | `as_of_date` | date | Req | `meta.asOfDate` | §8.3 detection |
| F3 | `unit_code` | string | Req | `unitCode` | Unique per property |
| F4 | `building` | string | Opt | `section` / extras | |
| F5 | `unit_type` / `floorplan` | string | Req | `unitType` / `floorplan` | |
| F6 | `beds`, `baths` | int / tenths | Opt | `beds`, `bathsTenths` | |
| F7 | `sqft` | int | Req | `sqft` | |
| F8 | `unit_status` (RCP 3-state) | enum `OCCUPIED` / `VACANT` / `DOWN` | Req | `status` | REPO enum. Drives GPR and rentable count. |
| F9 | `unit_substatus` | enum (§8.2) | Req (NEW) | extras | Preserves notice / vacant-rented / model / employee detail. |
| F10 | `resident_id` | string | Req if occupied | `residentId` | **PII**, see §8.5 |
| F11 | `resident_name` | string | Opt | `residentName` | **PII**. Masked in exports by default. |
| F12 | `lease_start` | date | Req if occupied | `leaseStart` (fed from `moveIn` in canonical → snapshot) | CONFLICT C-11: keep lease start and move-in separate. |
| F13 | `lease_end` | date | Req if occupied and not MTM | `leaseExpiration` / `leaseEnd` | |
| F14 | `move_in_date` | date | Req if occupied | `moveIn` | |
| F15 | `move_out_date` | date | Opt | `moveOut` | Past or scheduled |
| F16 | `notice_date` | date | Opt (NEW) | extras | Date notice to vacate was given |
| F17 | `market_rent` | cents | Req | `marketRentCents` | |
| F18 | `lease_rent` (contract) | cents | Req if occupied | `inPlaceRentCents` | REPO forces zero unless `OCCUPIED` |
| F19 | `recurring_charges[]` | list of {`charge_code_raw`, `charge_class`, `amount_cents`} | Req (if in source) | `charges[]` (`CanonicalCharge`) | `charge_class` extends the REPO {rent, concession, other} to the §8.4 classes (NEW) |
| F20 | `concession_amount` (monthly recognized) | cents | Opt | `concessionCents` | |
| F21 | `concession_type` | enum {FREE_RENT_UPFRONT, RECURRING_DISCOUNT, ONE_TIME_CREDIT, OTHER} | Opt (NEW) | — | |
| F22 | `concession_total`, `concession_start`, `concession_end`, `amortization_method` {AS_GRANTED, STRAIGHT_LINE} | cents / date / enum | Opt (NEW) | — | Drives `1130` (§2.9) |
| F23 | `security_deposit_held` | cents | Req | `residentDepositCents` (+ `otherDepositCents`) | Sum ties to `2050` (RR-8) |
| F24 | `balance_total` | cents (signed) | Req (if in source) | `balanceCents` | Positive = owed; negative = credit (prepaid) |
| F25 | `aging_current`, `aging_0_30`, `aging_31_60`, `aging_61_90`, `aging_90_plus` | cents | Opt (NEW) | — | Bucket boundaries are days past due. "Current" = charges not yet past due per the client's definition, which is stored in meta. Σ buckets = positive `balance_total`. |
| F26 | `prepaid_balance` | cents | Opt (NEW) | derived from negative `balanceCents` | Ties to `2040` (RR-10) |
| F27 | `mtm_flag` | bool | Req (NEW) | — | True if lease_end < as_of_date and the resident is still in place, or the source flags MTM |
| F28 | `renewal_status` | enum {NONE, OFFERED, ACCEPTED, SIGNED, DECLINED, NOTICE} | Opt (NEW) | — | |
| F29 | `source_rows[]`, `extras{}`, `dialect` | meta | Req | `sourceRows`, `extras`, `meta.dialect` | REPO no-data-loss rule |

### 8.2 Unit sub-status → RCP 3-state mapping

| Sub-status (NEW) | Meaning | RCP `unit_status` (REPO) | In rentable? | In GPR? | Occupancy treatment |
| --- | --- | --- | --- | --- | --- |
| OCCUPIED | Leased and in possession, no notice | OCCUPIED | Yes | Yes | Occupied |
| OCCUPIED_NOTICE | In possession, notice given; may be pre-leased | OCCUPIED | Yes | Yes | Occupied (REPO maps notice → OCCUPIED) |
| VACANT_RENTED | Vacant, future lease signed (pre-leased) | VACANT | Yes | Yes | Vacant (physical); counts as leased for the leased-% metric |
| VACANT_UNRENTED | Vacant, not leased | VACANT | Yes | Yes | Vacant |
| MODEL | Model unit | **REPO: DOWN.** This standard offers an option (C-4). | REPO: No | REPO: No / option: Yes, with `4040` deduction | Non-revenue |
| EMPLOYEE | Employee-occupied at reduced or zero rent | **REPO: DOWN.** Option C-4. | as above | as above | Non-revenue (Fannie Mae counts NRU as occupied) |
| ADMIN / OFFICE | Used as office or storage | **REPO: DOWN.** Option C-4. | as above | as above | Non-revenue |
| DOWN | Offline (rehab, casualty) | DOWN | No | No | Excluded |

Physical occupancy (REPO) = occupied ÷ rentable. **Leased %** (NEW, definition only) = (occupied units not on notice + occupied-notice units that are pre-leased + vacant-rented units) ÷ rentable.

### 8.3 Dialect normalization rules

| Rule | Description | REPO status |
| --- | --- | --- |
| Dialect detection | Score-based detector. The highest score wins. Output is always the same canonical model. Never special-case a property name. | REPO (`rent-roll-dialects.ts`) |
| Header synonyms | Normalize headers (lowercase, `#` → "number", strip punctuation), then match against a field alias table. Examples: unit ("unit", "apt", "unit #"); market rent ("market rent", "mkt rent", "asking rent"); lease rent ("lease rent", "actual rent", "current rent", "charged rent"); lease end ("lease exp", "lease expiration", "lease to"); sqft ("sq ft", "net sf", "sf"). | REPO `FIELD_ALIASES` in `rent-roll-map.ts`. Extend with: notice date ("ntv date", "notice given"), move-out ("move out", "mo date"), deposit ("deposit", "sec dep", "resident deposit"), balance ("balance", "amt balance", "past due"), aging bucket headers. NEW |
| Two-row / split headers | Merge stacked header rows before matching. | REPO (`broker_flat`, `yardi_lease_charges`) |
| Charge-line layout (multiple rows per unit) | Unit attributes are on the first row. Subsequent rows carry a charge code and amount. Aggregate by charge class and keep charge detail. The per-unit "Total" row is a check total (RR-13). | REPO `yardi_lease_charges` |
| One-row-per-unit layout | Charges are in columns. Map each charge column to a charge class via §8.4. | REPO `broker_flat`, `canonical_csv` |
| Subtotal / summary stripping | Drop rows whose first non-empty cell or charge column is total / subtotal / grand total. Drop section header rows (e.g., "Current Residents", "Notice Residents", "Vacant Units", "Future Residents"), but capture the header text as `section` to help infer sub-status. | REPO (`looksLikeTotalRow`, section-header regex) |
| Summary blocks after the unit list | Stop unit parsing at the first summary block (e.g., occupancy summary, charge-code summary). Store the block in meta for reconciliation. | NEW (formalize) |
| As-of date detection | Search title/meta rows for "as of" + date, "month/year", or "transaction date". If none is found, use the filename date. If still none, require user entry. The as-of date must fall in the close period (RR-12). | REPO (`as of` regex in `yardi_lease_charges`) |
| Future / applicant rows | A future-resident row on a vacant unit sets VACANT_RENTED on that unit. Applicant, denied, canceled, and waitlist rows are dropped and logged. | NEW (formalize) |
| Duplicate units | If the same unit appears twice (e.g., current + future resident), merge per the rule above. Any other duplicate `unit_code` is a hard fail. | NEW |
| Money parsing | Parentheses = negative. Strip `$` and `,`. Store integer cents. No floating point. | REPO (`parseUsdToCents`) |
| Vendor dialects | **Yardi** Rent Roll with Lease Charges: charge-line layout (REPO dialect #1). **RealPage OneSite, Entrata, AppFolio**: typically one row per unit with charge columns or a charges sub-table; handled by `broker_flat` or new dialects with the same canonical output. **redIQ machine headers**: REPO `redi_q_machine`. No vendor column spec is assumed beyond the header synonyms (T). | REPO + T |

### 8.4 Charge-code normalization (rent-roll charge classes)

| Charge class (NEW; extends REPO `rent` / `concession` / `other`) | Typical raw codes / captions (T; the REPO sample uses `r-`-prefixed Yardi-style codes) | GL target |
| --- | --- | --- |
| RENT | rent, r-rent, base rent, apartment rent, unit rent | 4010 / lease rent |
| CONCESSION | conc, concession, free rent, discount, special, recurring credit | 4030 |
| EMPLOYEE_CREDIT | emp credit, employee discount | 4040 |
| PET | pet, pet rent | 4160 |
| PARKING | parking, garage, carport | 4140 |
| STORAGE | storage | 4150 |
| UTILITY | rubs, water, sewer, trash, util, pest (billback) | 4110 |
| FEE_RECURRING | monthly admin fee, amenity fee, technology/cable package | 4130 or 4100 |
| LAUNDRY | laundry, w/d rental, r-laundr | 4170 |
| OTHER | anything else | 4100 + warning |

Classification precedence: concession/credit keywords come **before** rent (REPO `classifyChargeCode` already does this). REPO `classifyChargeCode` also classifies "losstolease" as a concession (C-3).

### 8.5 PII handling
- `resident_name` and any contact fields are PII. Store them only where needed for tie-outs. Mask them in packs, LP/lender exports, and logs by default (show `resident_id` or a hash).
- Original rent-roll files are vaulted (REPO) with access limited to controller/Principal roles.
- Do not send resident-level data to external AI services without Principal approval.
- Retention follows the entity document-retention policy [CONV].

---

## 9. Lease expiration and lease term summaries (definitions only)

### 9.1 Population
- **Base population:** units with `unit_status = OCCUPIED` (including notice) as of `as_of_date`. VACANT_RENTED future leases are reported in a separate column. Non-revenue and DOWN units are excluded from counts and rent, and shown as memo lines.
- **Denominators** (state which is used on the report):
  - `% of units` = bucket count ÷ **total rentable units** (default) or ÷ occupied units (alternate; label it).
  - `% of scheduled rent` = Σ bucket lease rent ÷ Σ lease rent of the base population.

### 9.2 Buckets

| Bucket | Rule (m = month offset from the as-of month) |
| --- | --- |
| MTM | `mtm_flag = true` |
| Expired, not MTM | lease_end < as_of_date and not flagged MTM. Data-quality warning bucket; should normally be empty. |
| Month 1 … Month 12 | lease_end falls in calendar month (as-of month + m), for m = 0 … 11. Label each by `YYYY-MM`. The as-of month is Month 1 [CONV; state the convention on the report]. |
| 13+ months | lease_end after Month 12 |
| No lease end date | Occupied with no lease_end and not MTM. Data-quality warning. |

**Columns per bucket:** `count`, `% of units`, `Σ lease rent (cents)`, `% of scheduled rent`, optional `Σ market rent`, optional split by `floorplan`, optional sub-column "of which on notice". **Totals row:** the count equals the base population, and the % columns sum to the whole of the chosen denominator (structural check).

### 9.3 Formulas

For occupied lease *i*: lease rent *Rᵢ*, lease start *Sᵢ*, lease end *Eᵢ*, as-of date *A*. Month differences are computed either in whole calendar months or as days ÷ a days-per-month convention. State which.

| Metric | Formula |
| --- | --- |
| Remaining term *Tᵢ* | max(0, *Eᵢ* − *A*) in months. MTM leases: *Tᵢ* = 0, or excluded (state which). |
| Average remaining lease term (unweighted) | Σ *Tᵢ* ÷ *n* over the base population (non-MTM unless stated) |
| Rent-weighted average remaining term | Σ (*Tᵢ* × *Rᵢ*) ÷ Σ *Rᵢ* |
| Average lease term (original) | Σ (*Eᵢ* − *Sᵢ*) ÷ *n* over leases with both dates |
| Rent-weighted average lease term | Σ ((*Eᵢ* − *Sᵢ*) × *Rᵢ*) ÷ Σ *Rᵢ* |
| MTM share | count(MTM) ÷ denominator; Σ *R*(MTM) ÷ Σ *R* |
| Next-12-month rollover exposure | (Σ counts in Months 1–12 + MTM count) ÷ denominator; same calculation on rent |

All intermediate values are integer cents and integer basis points, rounded half-up at the final step only [CONV; state the rounding rule].

---

## 10. Conflicts and gaps vs the repo (for Principal decision)

| ID | Topic | REPO today | This standard | Severity | Recommendation |
| --- | --- | --- | --- | --- | --- |
| C-1 | CFADS / BTCF terminology | `cfads` = NOI − PPE additions − reserve requirement; `BTCF` = NOI − interest − principal; neither deducts the AM fee | CFBDS and Cash Flow After Debt Service, both after AM fee and entity costs | High (labels on LP/lender packs) | Principal picks canonical names. Until then, print the formula text on tiles. |
| C-2 | Rental revenue hierarchy | GPR − vacancy − concessions = "Effective Gross Rent" | Adds LTL, NRU, bad debt; subtotal "Net Rental Income" | Medium | Add `4015` / `4040` / `4050` and builder groups in a future phase. |
| C-3 | Loss-to-lease | KPI only (floored at zero). T12 alias maps "loss to lease" / "ltl" → `4030`. Charge classifier treats LTL as a concession. | Separate signed `4015`. LTL ≠ concession. | Medium | Remap in the next importer change. |
| C-4 | Model / employee / admin units | Parsed as `DOWN` (excluded from rentable and GPR) | Option to keep them in GPR and deduct via `4040`. This matches the Fannie GPR definition ("as if all units were 100% occupied", including model, office, maintenance, and employee units). DOWN stays excluded. | Medium | Principal chooses. REPO behavior stays the default until changed. |
| C-5 | Below-NOI line order | interest, depreciation, AM fee | AM fee, entity costs, interest, amortization, depreciation | Low | Presentation only |
| C-6 | Controllable tags | Controllable includes utilities `5310`. PM fee `5910` is tagged "contractual, disclosed separately". | Utilities = non-controllable (per the requested format). PM fee in controllable. | Medium (changes the `controllable_opex` ratio) | Principal decides. REPO ratio unchanged until then. |
| C-7 | Equity presentation | Retained = `3100` + `3900` + all prior-period NI. "Current Period Net Income" = selected month only. | Q3 = prior years; Q4 = current-year (YTD) earnings | Medium | Split at the fiscal-year boundary once the year-end close job exists (the REPO notes it is not implemented). |
| C-8 | Cash presentation | One "Cash" line sums `1010`–`1040` (restricted included) | Separate restricted lines; subtotal ties to ASC 230 | Low | Presentation only; totals unchanged |
| C-9 | T12 alias order | The `4010` rule is first and includes broad "rent" / "rental income". "Utility reimb" → 4100. "Interest" → 6110 with no interest-income guard. "Benefits" → 5110. | Ordered specific → generic (§6.2) | Medium | Re-order in the next importer change |
| C-10 | Maker-checker | Checklist has `reviewedAt`, `notes`; no user identity | `preparedBy` / `reviewedBy`, preparer ≠ reviewer | Medium | Schema addition |
| C-11 | Lease start vs move-in | Canonical → snapshot maps `moveIn` into `leaseStart` | Separate fields | Low | Schema addition |
| C-12 | Basis flag, tolerances, suspense | None exist | `accountingBasis`, `tol.*` table, `1999` | Medium | Schema addition |
| C-13 | Debt issuance costs, accrued interest | No `2215` / `6120` / `2030`. UPB tie = `2110` + `2210`. | Add them. Exclude `2215` from UPB and paydown. | Medium | Change builders before enabling |
| C-14 | Delinquency / AR aging | Gated (no subledger) | Schema fields F25 defined; RR-7 gated until data exists | Info | Consistent with the REPO "do not invent" rule |
| C-15 | Investment elimination | `1350` not eliminated | Same (combined roll-up); E-3 documented as the consolidation-only step | None | Consistent |

**Verified REPO codes (no conflict):**
- `1310` Due from Related Parties (IC receivable; OpCo side of the AM fee)
- `2310` Due to Related Parties
- `1460` Construction in Progress
- `3010` Members' Contributions and `3020` Members' Distributions (verified in that order)
- `3100` Retained Earnings
- `3900` Current Year Earnings (close)
- `6110` Interest Expense
- `6210` Depreciation Expense
- `6310` Asset Management Fees (below NOI)
- `7010` Asset Management Fee Income (OpCo)

**Correction to the prior-QC assumption.** `4010` / `4020` / `4030` are **not** three rental revenue lines. They are `4010` Gross Potential Rent, `4020` Vacancy Loss (contra), and `4030` Concessions / Free Rent (contra), all tied to the rent roll via REPO KPIs. The repo wins.

---

## 11. Sources

Authority flags: [AUTH] = FASB authoritative GAAP. The Codification text itself is at asc.fasb.org (basic view requires free registration). Secondary summaries from PwC, Deloitte, KPMG, and BDO are cited where they quote or paraphrase the Codification or ASU text. [AGENCY], [IND-STD], and [CONV] are as defined in §0.

### 11.1 FASB / GAAP
1. **ASC 842, Leases (lessor operating leases; straight-line; collectibility)** [AUTH]
   - Codification: https://asc.fasb.org/842/tableOfContent
   - Straight-line and collectibility (ASC 842-30-25-11 to 25-13), summarized in PwC Viewpoint *Leases* §4.3: https://viewpoint.pwc.com/dt/us/en/pwc/accounting_guides/leases/leases__4_US/chapter_4_accounting_US/43_initial_recogniti_US.html
2. **ASC 326, Credit Losses: operating lease receivables excluded from 326-20 (ASU 2018-19)** [AUTH]
   - Codification: https://asc.fasb.org/326/tableOfContent
   - Scope exclusion and the 842 collectibility model: Deloitte Financial Reporting Alert 19-1, https://dart.deloitte.com/USDART/home/publications/archive/deloitte-publications/financial-reporting-alerts/2019/19-1-assessing-collectibility-operating-lease
   - General reserve under ASC 450 as a policy election (FASB, July 2019): PwC Viewpoint *Leases* §8.8, https://viewpoint.pwc.com/dt/us/en/pwc/accounting_guides/leases/leases__4_US/chapter_8_other_topi_US/88_lessor_operating.html
   - KPMG *Handbook: Credit impairment* (quotes ASU 2018-19 BC13): https://kpmg.com/kpmg-us/content/dam/kpmg/frv/pdf/2024/handbook-credit-impairment.pdf
3. **ASC 360, Property, Plant, and Equipment (capitalization, depreciation)** [AUTH]
   - https://asc.fasb.org/360/tableOfContent
   - *Specific ASC 360 paragraph citations were not individually verified. Only the Topic-level reference is cited.*
4. **ASC 835-30, Imputation of Interest: debt issuance costs as a direct deduction from debt (ASU 2015-03); line-of-credit exception (ASU 2015-15)** [AUTH]
   - Codification: https://asc.fasb.org/835/tableOfContent
   - ASU 2015-03 full text (835-30-45-1A): https://viewpoint.pwc.com/dt/us/en/fasb_financial_accou/asus_fulltext/2015/asu_201503interestim/asu_201503interestim_US/asu_201503interestim_US.html
   - ASU 2015-15: https://viewpoint.pwc.com/dt/us/en/fasb_financial_accou/asus_fulltext/2015/asu_201515interestim/asu_201515interestim_US/asu_201515interestim_US.html
   - Amortization reported as interest expense: BDO Flash Report, https://www.bdo.com/insights/assurance/fasb-flash-report-april-2015
5. **ASC 810, Consolidation (VIE and voting interest models)** [AUTH]
   - https://asc.fasb.org/810/tableOfContent
   - Deloitte Roadmap: Consolidation, §1.1: https://dart.deloitte.com/USDART/home/codification/broad-transactions/asc810-10/roadmap-consolidation/chapter-1-overview-consolidation-models/1-1-which-consolidation-model-apply
6. **ASC 230, Statement of Cash Flows: restricted cash (ASU 2016-18)** [AUTH]
   - https://asc.fasb.org/230/tableOfContent
   - ASU 2016-18 full text: https://viewpoint.pwc.com/dt/us/en/fasb_financial_accou/asus_fulltext/2016/asu_201618statement_/asu_201618statement__US/asu_201618statement__US.html
   - Deloitte Heads Up (Nov 2016): https://dart.deloitte.com/USDART/home/publications/archive/deloitte-publications/heads-up/2016/fasb-issues-guidance-restricted-cash-nov

### 11.2 Industry reporting standards [IND-STD]
7. **NCREIF PREA Reporting Standards**
   - Overview: https://ncreif.org/standards/
   - Site: https://reportingstandards.info/
   - Handbook Vol. II, Performance & Risk Manual (NOI = "Net operating income (before interest expense)"): https://reportingstandards.info/wp-content/uploads/2022/04/rs-handbook-vol-ii-manuals-performance-and-risk.pdf
   - Fair Value Accounting Policy Manual (operating measures exclusive of capitalizable expenditures; reserves set aside from NOI): https://reportingstandards.info/wp-content/uploads/2026/01/rs-handbook-vol-ii-manuals-fv-accounting-policy.pdf
   - Adopting release with AM.06 Debt Yield and AM.07 DSCR (NOI ÷ principal and interest): https://reportingstandards.info/wp-content/uploads/2025/08/rs-handbook-vol-ii-adopting-release.pdf
8. **IREM income/expense analysis categories**
   - IREM Income/Expense IQ (with NAA and BOMA): https://www.irem.org/tools/income-expense-iq
   - 2024 National Summary: https://www.irem.org/file%20library/globalnavigation/learning/tools/irem-income-expense-iq-national-summary-24.pdf
   - The legacy 2019 IREM *Income/Expense Analysis: Conventional Apartments* states its chart of accounts "is aligned with the HUD Chart of Accounts" (copy hosted by a county appraiser): https://www.bcpao.us/docs/misc/ceaa/Exhibits/Chapter_10/Exhibit%2010-6.4%20%20%20IREM%20Report.pdf
   - **Not verified:** a standalone published "NAA/IREM standard chart of accounts". NAA appears only as a data partner of IREM I/E IQ. Any reference to an NAA/IREM CoA in this document is **general industry practice**.

### 11.3 Agency / regulator references [AGENCY]
9. **Fannie Mae Form 4254.DEF (Aug 2024), Multifamily Analysis of Operations line-item definitions.** Covers:
   - GPR including non-revenue units and gain/loss to lease; vacancy excluding NRU; bad debt; concessions
   - other-income include/omit lists
   - management fees including asset management fees
   - entity and partnership expenses omitted from G&A
   - fixture replacement at turnover classed as capex
   - NCF and DSCR definitions
   - URL: https://multifamily.fanniemae.com/media/35991/display
10. **HUD Handbook 4370.2 Rev-1, Chapter 4, HUD Chart of Accounts (5/92).** The numbered accounts cited in §5 were read from this PDF: https://archives.hud.gov/offices/adm/hudclips/handbooks/hsgh/43702c4HSGH.PDF. *A rental-concessions account (5250) appears in later HUD/state-agency versions according to search results, but it is not in the 1992 list read here. Verify the version before relying on it.*

### 11.4 Vendor public materials (structure only; no vendor GL numbers cited)
11. **Yardi Voyager Residential** product page: https://www.yardi.com/product/voyager-residential/. "Rent Roll with Lease Charges" export steps (third-party help center): https://979itwvqf1xdp85.productfruits.help/en/article/pms-rent-roll-export-instructions-voyager-yardi
12. **RealPage** property management software: https://www.realpage.com/property-management-software/. *No public OneSite rent-roll column spec or default GL list was verified.*
13. **Entrata** accounting: https://www.entrata.com/products/accounting. *No public rent-roll column spec or default GL list was verified.*
14. **AppFolio** report customization (blog): https://www.appfolio.com/blog/tips-and-tricks-for-customizing-your-appfolio-reports. Product: https://www.appfolio.com/property-manager. *No public default GL list was verified.*
15. **redIQ / Radix Underwriting.** SmartMap+ operating-statement mapping to the user's chart of accounts with confidence ratings: https://www.rediq.com/resource/rediq-introduces-smartmap-expedited-mapping-of-operating-statements/. Product: https://radix.com/radix-underwriting/. *A public list of redIQ normalized T12 categories was not found. The redIQ column in §5 is typical wording (T).*

### 11.5 Repository (read-only)
16. `AVWJR/AVWJR-rcp-portfolio-control` @ `main`, files read:
    - `docs/RCP_COA_OUTLINE.md`, `docs/RCP_SPE_MONTHLY_CLOSE.md`, `docs/RCP_TAX_BRIDGE.md`, `docs/RCP_INTERCOMPANY.md`, `docs/RCP_OPERATING_KPIS.md`, `docs/RCP_RATIO_DICTIONARY_STUB.md`, `docs/RCP_REPORT_CATALOG.md`, `docs/RCP_DEBT.md`, `docs/RCP_CAPEX.md`, `docs/RCP_RENT_ROLL_DIALECTS.md`
    - `packages/ledger/src/{types,coa,reports,close,intercompany}.ts`
    - `packages/reporting/src/variance.ts`
    - `packages/properties/src/{types,rent-roll-canonical,rent-roll-map,t12-map}.ts`
    - `prisma/schema.prisma`

### 11.6 Claims that are convention, not authority [CONV]
- Controllable vs non-controllable OpEx split.
- PM fee above NOI as an operating expense. This is consistent with Fannie Mae and HUD placing management fee in operating expenses, but the "controllable" label is convention.
- The replacement-reserve deposit vs spend presentation choice.
- Aging bucket boundaries and the definition of "current".
- The Month-1 convention for lease expirations.
- Security-deposit segregation (state law varies; not researched here).
- Cash-basis defaults at PMS vendors.
- Triggers for when consolidated statements become necessary.
- Rounding conventions.

---

*End of standard. Structure only. No figures. Changes to REPO behavior require a separate implementation phase and Principal approval.*
