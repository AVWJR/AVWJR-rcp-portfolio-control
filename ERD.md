# Phase A Entity-Relationship Diagram

Roche Capital Partners ledger — book basis, USD cents (`BigInt`), `America/New_York`.

```mermaid
erDiagram
  Entity ||--o{ Entity : parent
  Entity ||--o{ Account : has
  Entity ||--o{ Period : has
  Entity ||--o{ Journal : posts
  Period ||--o{ Journal : contains
  Journal ||--|{ JournalLine : splits
  Account ||--o{ JournalLine : posted-to

  Entity {
    string id PK
    string code UK
    string name
    enum type "HOLDCO | OPCO | SPE"
    string parentId FK
    int ownershipBps "10000 = 100%"
    int unitCount "SPE only"
    enum strategy "VALUE_ADD_GARDEN | STABILIZED | LIGHT_REHAB"
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
    enum status "OPEN | CLOSED"
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
```

## Tree

```
Roche Capital Partners HoldCo
└── RCP Operating Company LLC
    ├── Willow Bend Gardens LLC          (SPE, 264 units, value-add garden, 100%)
    ├── Crestview Commons LLC            (SPE, 192 units, stabilized, 100%)
    └── Harbor Court Residences LLC      (SPE, 84 units, light rehab, 100%)
```

Wholly owned SPEs consolidate into OpCo. Intercompany `1310`/`2310` and AM fee `6310`/`7010` eliminate on the OpCo consolidated view.

## Posting rule

A journal may move from `DRAFT` to `POSTED` only when:

- at least two lines exist
- no line carries both a debit and a credit
- `sum(debit) == sum(credit)` (integer cents)
- every account belongs to the journal’s entity CoA
- the period is `OPEN`

Master CoA template rows have `entityId = null` and `isTemplate = true`. Creating an entity clones the template onto that entity.
