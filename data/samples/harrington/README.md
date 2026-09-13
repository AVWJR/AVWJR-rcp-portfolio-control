# Harrington Park rent-roll sample

Recreated from the Principal’s redIQ export (same sheet names, header rows, and unit count). T12 / P&L cash-book mapping stays on PR #15 — this file is the rent-roll contract only.

| File | Sheets | What to map |
| --- | --- | --- |
| `RR_-_Harrington_-_12.31.19_-_Resi.xlsx` | Floor Plan, **Rent Roll**, Source Data, Sheet2, About | Prefer sheet **`Rent Roll`**. Human headers on R8 (`Unit No.`, `Status(occupancy)`, `Rent(market)`). **Machine headers on R9:** `UnitID`, `PlanID`, `NetSF`, `Bed`, `Bath`, `OccStatus`, `MktRent`, `InPlaceRent`. Data from **R10** (`A-01` …), **~175 units**, `OccStatus` title-case `Occupied` / `Vacant`. Alternate: `Source Data`. Skip title rows 1–8. Do not require first-sheet-first-row `unit_id`. |
