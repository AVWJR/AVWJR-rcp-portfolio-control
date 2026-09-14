# Rent-roll dialects

Upload ingest is a **dialect detector + parsers**, not a single flat-row assumption. Every dialect writes the same canonical model. Dashboard occupancy / NOI uses that model (`Unit` rows: market rent, in-place rent, status, sqft, lease dates). Labels and non-financial inputs are **reorganized, never silently dropped**.

## Supported dialects

| Id | When it wins | Source shape |
| --- | --- | --- |
| `yardi_lease_charges` | Nested **Rent Roll with Lease Charges** (Hampton Gardens / Yardi-style): split headers, `r-rent` / `r-laundr` / … charge lines, per-unit **Total**, metadata rows | Dialect **#1** |
| `redi_q_machine` | redIQ sheet **Rent Roll** machine headers (`UnitID`, `OccStatus`, `MktRent`, `InPlaceRent`, `NetSF`) | Existing path |
| `broker_flat` | Broker / Yardi-MRI **flat** unit rows (title rows, two-row headers, `Charges` column, duplicate charge rows) | Existing path |
| `canonical_csv` | RCP template `unit_id,floorplan,beds,baths,sqft,status,market_rent,in_place_rent,lease_start,lease_end,concession` | Existing path |

Detection is score-based. A future PMS format is a new dialect with the **same canonical output** — do not special-case a property name.

## Canonical workbook (no data loss)

On ingest the original file is vaulted **byte-for-byte**. A second vault workbook `rent-roll-canonical.xlsx` is written with:

1. **Canonical** — one analysis row per unit (resident, deposits, balance, move-in/exp/out, in-place = `r-rent` when present, other charges separately, `extras` JSON).
2. **Charge Detail** — one row per charge code.
3. **Meta** — report title, property, as-of, transaction date, month/year, dialect, unmapped cells, warnings.
4. **Original** — faithful copy of the selected source sheet (other tabs copied as `Src …`).

Anything not mapped to a first-class column is stored in **extras** / the Meta unmapped list.

Principal click-path: **Deals → Add Deal** → drop `data/samples/hampton/RR_-_Hampton_Gardens_-_Lease_Charges.xlsx` (or Properties → import XLSX) → **Properties / Dashboard** for the new SPE. Banner: detected Yardi Lease Charges. Downloads: canonical XLSX + original workbook. Expert: “we detected X format and normalized it.”

## How to add another dialect

1. Add an id to `RENT_ROLL_DIALECT_IDS` in `packages/properties/src/rent-roll-canonical.ts` and a human `RENT_ROLL_DIALECT_LABELS` string.
2. Add `packages/properties/src/dialects/<name>.ts` with `score(rows)` and `parse(rows) → NormalizedRentRoll`.
3. Register it in `RENT_ROLL_DIALECTS` (`packages/properties/src/rent-roll-dialects.ts`). Higher score wins; keep lease-charges nested signals distinct from flat `Charges` columns.
4. Fixture + tests: unit count, charge totals, and at least one unmapped/meta field retained. Keep an existing non-Hampton dialect test green (redIQ or broker_flat).
5. Expert copy and this table — one line each.

Do not flatten nested charge blocks through CSV before parsing. `parseRentRollSource` in `src/lib/deals/workbook.ts` runs dialects on sheet AOA.
