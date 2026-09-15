# RCP Books-to-tax, capital, and 1099 hooks

Phase F CPA-export support. Integer USD cents. Per legal entity.

**Books-to-tax worksheets and K-1-oriented exports support CPA preparation. Roche Capital Partners Portfolio Control does not file federal or state returns, does not produce a filed Form 1065/K-1 or 1099, and does not replace CPA or counsel.**

## Books-to-tax worksheet

`/tax` · `GET /api/tax/bridge?entity=SPE-WBG&period=2026-08` · `&format=csv|xls`

Every line is labeled **BOOKS**, **TAX**, or **BRIDGE**.

| Column | Meaning |
| --- | --- |
| Books | Book GL / income statement (NI, 6210 dep, 6110 interest, 6310 AM fees below NOI, 7010 AM income) |
| Tax | MACRS lives hook or CPA overlay |
| Tax − books | Signed adjustment used in the worksheet |

Taxable income (worksheet) = book NI − (tax dep − book dep) ± seeded overlays.

MACRS hooks (not a full engine — no bonus, §179, mid-quarter, or placed-in-service month tables):

| Account | Class | Life | Convention |
| --- | --- | --- | --- |
| 1410 | Land | n/a | NA |
| 1420 | Residential rental building | 27.5 | MM |
| 1430 | Building improvements | 27.5 | MM |
| 1440 | Site improvements | 15 | HY |
| 1450 | FF&E | 5 | HY |
| 1460 | CIP | n/a until PIS | NA |

Monthly tax dep hook = cost basis ÷ (years × 12), integer cents.

Seed sample adjustments exist on **SPE-WBG** and **RCP-OPCO** for 2026-08 (meals addback; WBG prepaid timing). Combined roll-up is labeled **not a tax consolidation** and **not a GAAP consolidation**.

163(j) is a reserved TAX column. The demo does not compute a limitation.

## Partner capital / K-1-oriented export

`/tax/k1` · `GET /api/tax/k1?entity=SPE-WBG&period=2026-08` · `&format=csv|xls`

Identity (must hold):

**beginning + contributions − distributions ± book NI = ending**

Beginning comes from 3010 / 3020 through period start. Period contrib / dist from those accounts. Book NI is allocated by ownership bps (seed SPEs remain 100% owned).

### Limitations (printed on the export)

- Not a filed Schedule K-1 (Form 1065).
- Book-basis capital only. No 704(c), §743(b), special allocations, guaranteed payments, 199A, at-risk, or PAL worksheets.
- K-1 export does not apply the deal LP/GP waterfall (book capital rollforward only). OpCo cash/CFADS do, when a template is saved.
- Combined roll-up is not a tax consolidation.

## 1099 vendor hooks

`/vendors` · `GET /api/vendors/1099?entity=SPE-WBG&year=2026&month=8`

Phase A AP (`2010` / `2020`) is a control total with **no vendor invoice subledger**. The vendor master plus a coded payment overlay is a CPA hook. If no overlay exists, the export is empty and says so. This is not a filed 1099-NEC/MISC.

## Source

`@rcp/tax-bridge` · `src/lib/tax-bridge.ts` · `src/lib/capital.ts` · `src/lib/vendors.ts`
