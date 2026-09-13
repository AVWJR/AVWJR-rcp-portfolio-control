# Harrington Park sample workbooks

Recreated from the Principal redIQ / Yardi files (those attachments are not in git). Same sheet names, header rows, and unit count the importer expects.

| File | Sheets | What to map |
| --- | --- | --- |
| `RR_-_Harrington_-_12.31.19_-_Resi.xlsx` | Floor Plan, **Rent Roll**, Source Data, Sheet2, About | Prefer **Rent Roll**. Human headers on R8 (`Unit No.`, `Status(occupancy)`, `Rent(market)`). **Machine headers on R9** (`UnitID`, `OccStatus`, `MktRent`, `InPlaceRent`, `NetSF`, `Bed`, `Bath`). Data from R10 (`A-01` …). **175 units**. Alternate: `Source Data` R12 (`UnitID` … `Code1` = actual rent). Skip title rows 1–8. Do not require first-sheet-first-row `unit_id`. |
| `T12_NOI_-_Life_at_Harrington_-_11.2019.xlsx` | Cover + **`ext`** | Yardi monthly P&L, title “The Life at Harrington Park”, Dec 2018–Nov 2019, months + Total. `4022-000 Unit Rent` → 4010; `41xx` → 4100; expenses by range/label. |
| `PL_-_The_Life_at_Harrington_Park_-_Dec_2018_to_Nov_2019.xlsx` | **`Report1`** | Same period / cash-book codes. |

Cash-book codes are not RCP CoA. Ingest writes `broker_t12` budget lines and labeled `broker_t12_overlay` journals on the demo period so EGI/NOI leave $0. Those journals are an imported overlay, not audited books.

Regenerate:

```bash
npx tsx scripts/write-harrington-samples.ts
```
