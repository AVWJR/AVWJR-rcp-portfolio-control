# RCP Chart of Accounts Outline

Master template cloned onto every HoldCo, OpCo, and SPE. Numbered practical multifamily CoA. Amounts are USD.

| Code | Name | Type | Notes |
| --- | --- | --- | --- |
| **1000s Assets** | | | |
| 1010 | Cash — Operating | Asset | |
| 1020 | Cash — Replacement Reserve | Asset | |
| 1030 | Cash — Escrow / Impound | Asset | |
| 1040 | Cash — Security Deposits | Asset | Restricted cash |
| 1110 | Accounts Receivable — Tenant | Asset | |
| 1190 | Allowance for Doubtful Accounts | Contra-asset | |
| 1210 | Prepaid Expenses | Asset | |
| 1310 | Due from Related Parties | Asset | Intercompany |
| 1350 | Investment in Subsidiaries | Asset | HoldCo → OpCo |
| 1410 | Land | Asset | |
| 1420 | Building | Asset | |
| 1430 | Building Improvements | Asset | |
| 1440 | Site Improvements | Asset | |
| 1450 | Furniture, Fixtures & Equipment | Asset | |
| 1460 | Construction in Progress | Asset | CapEx until placed in service |
| 1490 | Accumulated Depreciation | Contra-asset | |
| **2000s Liabilities** | | | |
| 2010 | Accounts Payable | Liability | |
| 2020 | Accrued Expenses | Liability | |
| 2040 | Prepaid Rent / Unearned Revenue | Liability | |
| 2050 | Tenant Security Deposits | Liability | |
| 2110 | Mortgage Payable — Current | Liability | |
| 2210 | Mortgage Payable — Long Term | Liability | |
| 2310 | Due to Related Parties | Liability | Intercompany |
| **3000s Equity** | | | |
| 3010 | Members' Contributions | Equity | |
| 3020 | Members' Distributions | Contra-equity | |
| 3100 | Retained Earnings | Equity | Used at year-end close |
| 3900 | Current Year Earnings (close) | Equity | Close target; unused while period is open |
| **4000s / 7000s Revenue** | | | |
| 4010 | Gross Potential Rent | Revenue | |
| 4020 | Vacancy Loss | Contra-revenue | |
| 4030 | Concessions / Free Rent | Contra-revenue | |
| 4100 | Other Income | Revenue | |
| 7010 | Asset Management Fee Income | Revenue | OpCo only |
| **5000s Operating expenses (in NOI)** | | | |
| 5110 | Payroll | Expense | |
| 5210 | Repairs & Maintenance | Expense | |
| 5310 | Utilities | Expense | |
| 5410 | Contract Services | Expense | |
| 5510 | Marketing | Expense | |
| 5610 | Administrative | Expense | |
| 5710 | Insurance | Expense | |
| 5810 | Real Estate Taxes | Expense | |
| 5910 | Property Management Fees | Expense | On-site / 3rd-party PM — **in NOI** |
| 5990 | Other Operating Expenses | Expense | |
| **6000s Below NOI** | | | |
| 6110 | Interest Expense | Expense | Below NOI |
| 6210 | Depreciation Expense | Expense | Below NOI |
| 6310 | Asset Management Fees | Expense | **Below NOI** (locked policy) |

## Policy

- Property management fees (`5910`) are operating and sit **in** NOI.
- OpCo asset management fees (`6310`) sit **below** NOI on the SPE. Do not reclassify into OpEx.
- OpCo records the reciprocal as `7010` Asset Management Fee Income and `1310` Due from Related Parties.
- Vacancy and concessions are contra-revenue, not operating expenses.

See `packages/ledger/src/coa.ts` for the machine-readable template.
