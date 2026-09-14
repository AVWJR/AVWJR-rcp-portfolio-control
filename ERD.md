# Phase A–F Entity-Relationship Diagram

Roche Capital Partners ledger + unit master + debt + CIP + close — book basis, USD cents (`BigInt`), `America/New_York`.

```mermaid
erDiagram
  Entity ||--o{ Entity : parent
  Entity ||--o{ Account : has
  Entity ||--o{ Period : has
  Entity ||--o{ Journal : posts
  Entity ||--o{ Unit : rent-roll
  Entity ||--o{ BudgetLine : budgets
  Entity ||--o{ Loan : mortgages
  Entity ||--o{ CapexProject : capex
  Period ||--o{ Journal : contains
  Period ||--o{ CloseChecklistItem : checklist
  Period ||--o{ PeriodCloseEvent : audit
  Loan ||--o{ LoanPayment : schedule
  CapexProject ||--o{ CapexCost : costs
  Journal ||--|{ JournalLine : splits
  Account ||--o{ JournalLine : posted-to
  Entity ||--o{ TaxAdjustment : tax-overlay
  Entity ||--o{ Partner : members
  Partner ||--o{ PartnerCapitalActivity : rollforward
  Entity ||--o{ VendorPayment : 1099-overlay
  Entity ||--o{ VaultDocument : vault
  Entity ||--o{ ReportJob : scheduled-packs
  Entity ||--o{ DealIntake : add-deal
  DealIntake ||--o{ DealIntakeFile : files
  ReportJob ||--o{ ReportJobRun : runs

  Entity {
    string id PK
    string code UK
    string name
    enum type "HOLDCO | OPCO | SPE"
    string parentId FK
    int ownershipBps "10000 = 100%"
    int unitCount "SPE only"
    enum strategy "VALUE_ADD_GARDEN | STABILIZED | LIGHT_REHAB"
    enum lifecycleStatus "LIVE | ARCHIVED"
    datetime archivedAt "soft-archive only"
    string archivedBy
    datetime restoredAt
    string restoredBy
    string currency "USD"
    string locale "en-US"
    string timezone "America/New_York"
  }

  Account {
    string id PK
    string entityId FK "null = master template"
    string code
    string name
    enum type "ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE"
    enum normalBalance "DEBIT | CREDIT"
    bool isContra
    bool isTemplate
    bool isBelowNoi "6310 AM fee locked below NOI"
    bool isCash
    string reportGroup
    enum cashFlowClass
  }

  Period {
    string id PK
    string entityId FK
    int year
    int month
    datetime startDate
    datetime endDate
    enum status "OPEN | SOFT_CLOSED | CLOSED"
    datetime softClosedAt
    datetime lockedAt
    string reopenReason
    string reopenTicket
  }

  Loan {
    string id PK
    string entityId FK
    string lenderName
    bigint originalPrincipalCents
    bigint currentUpbCents
    int interestRateBps
    bigint paymentCents
    datetime maturityDate
    int dscrThresholdBps
    int debtYieldThresholdBps
  }

  CapexProject {
    string id PK
    string entityId FK
    enum classification "CAPEX | REPAIRS_MAINTENANCE"
    enum status "OPEN | CIP | PLACED_IN_SERVICE | CLOSED"
    bigint budgetCents
    bigint spentCents
    bigint cipCents
    bigint placedInServiceCents
  }

  Journal {
    string id PK
    string entityId FK
    string periodId FK
    datetime date
    string memo
    enum status "DRAFT | POSTED"
    datetime postedAt
  }

  JournalLine {
    string id PK
    string journalId FK
    string accountId FK
    bigint debit "USD cents"
    bigint credit "USD cents"
  }

  Unit {
    string id PK
    string entityId FK
    string unitCode
    string floorplan
    int beds
    int bathsTenths "10 = 1.0"
    int sqft
    enum status "OCCUPIED | VACANT | DOWN"
    bigint marketRent
    bigint inPlaceRent
    datetime leaseStart
    datetime leaseEnd
    bigint concessionCents
    datetime asOfDate
  }

  BudgetLine {
    string id PK
    string entityId FK
    int year
    int month
    string accountCode
    bigint amount "natural-magnitude cents"
  }
```

## Tree

```
Roche Capital Partners HoldCo
└── RCP Operating Company LLC
    ├── Willow Bend Gardens LLC          (SPE, 264 units, value-add garden, 100%)
    ├── Crestview Commons LLC            (SPE, 192 units, stabilized, 100%)
    └── Harbor Court Residences LLC      (SPE, 84 units, light rehab, 100%)
```

Wholly owned **LIVE** SPEs roll into OpCo as a **combined roll-up**. `ARCHIVED` SPEs leave that roll-up and the live Deals list; books and vault stay for study on `/archive`. Intercompany `1310`/`2310` and AM fee `6310`/`7010` eliminate on that view. Occupancy KPIs come from `Unit`, never from the GL.

## Posting rule

A journal may move from `DRAFT` to `POSTED` only when:

- at least two lines exist
- no line carries both a debit and a credit
- `sum(debit) == sum(credit)` (integer cents)
- every account belongs to the journal’s entity CoA
- the period is `OPEN` (soft-closed periods allow controller adjustments only; `CLOSED` rejects all posts)

Master CoA template rows have `entityId = null` and `isTemplate = true`. Creating an entity clones the template onto that entity.
