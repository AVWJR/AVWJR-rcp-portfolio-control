# Add Deal — guided SPE intake

Principal path to onboard a **new property SPE** under OpCo. New deals are never a second HoldCo.

Route: [`/deals/new`](/deals/new) · list: [`/deals`](/deals)

## Modes

| Mode | Status | Notes |
| --- | --- | --- |
| 1. Upload files | **Live** | **Upload-first:** drop files with no name/code keystrokes. An **Untitled deal** draft is auto-created; filenames infer SPE name / `SPE-HRP`-style code / as-of dates / file roles (`RR_` rent-roll, `OM_` CIM, `T12_`/`PL_` workbooks). After sequential one-file uploads, **auto-ingest** creates or **reuses** the SPE, vaults files, and **maps broker rent-roll XLSX → Unit rows**. **redIQ** `Rent Roll` uses machine headers on **R9** (`UnitID`, `OccStatus`, `MktRent`, `InPlaceRent`, `NetSF`) — not the human R8 row and not first-sheet-first-row `unit_id`. Alternate sheet `Source Data` is accepted. A classified rent roll that maps **0 units fails** (`could not map columns: … Detected headers: …`) — never a silent vault-only success. **Re-apply rent roll** on Properties / Dashboard / deal-done re-reads the vaulted RR. Yardi T12/P&L (`ext`, `Report1`, cash-book `4022-000 Unit Rent`) map to a **broker T12 overlay** (monthly budget + labeled `broker_t12_overlay` journals on the demo period). Cash-book codes ≠ RCP CoA — labels stay honest. Max **32 MB per file** (never the sum of a multi-file drop). A 5.5 MB OM is under the app cap. Files **under ~3.5 MB** stay on multipart. Files **over ~3.5 MB** use **@vercel/blob client upload** so bytes never enter the ~4.5 MB Vercel function body. Without `BLOB_READ_WRITE_TOKEN`: “OM is 5.5 MB — add BLOB_READ_WRITE_TOKEN in Vercel (Storage → Blob) or upload Excel first and add OM after Blob is connected” — never a naked 413. Oversized vs 32 MB → `File too large (max 32 MB)`. |
| 2. Dropbox | **Hook + UI** | “Connect Dropbox” when `DROPBOX_ACCESS_TOKEN` is missing. List/download when the server token is set. OAuth app keys (`DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`) are reserved for a follow-on login. |
| 3. Email attachment | **Hook + UI** | Always accept `.eml` / attachment uploads. Optional Gmail or Microsoft Graph fetch when `GMAIL_ACCESS_TOKEN` or `MICROSOFT_ACCESS_TOKEN` is set. |
| 4. RCP mailbox auto-ingest | **Stub** | `DealFileSource = rcp_mailbox`. Set `RCP_INGEST_MAILBOX` when the inbox exists. **The mailbox address is not decided yet — do not hardcode one.** **Scan RCP inbox** is an honest no-op until mailbox + connector exist. |

## Wizard steps

1. Goal (stabilize / value-add / light rehab) + target period  
2. Identity (legal name, `SPE-XXX`, units, parent OpCo)  
3. Source files (modes above)  
4. Classify (`rent_roll_csv`, `budget_csv`, `loan_doc`, `lease`, `om_cim`, `insurance`, `other`)  
5. Create SPE + clone master CoA + open periods  
6. Apply rent-roll / budget (confirm replace) + optional loan file  
7. Completeness (same Expert tools)  
8. Done — dashboard, properties, debt, vault, narratives  

Drafts persist in `DealIntake` / `DealIntakeFile` so refresh does not lose work.

## APIs

- `GET|POST /api/deals` — list SPEs / create SPE (unique code, parent OpCo must exist)  
- `GET|POST /api/deals/intake` — create or update a draft (`?id=` / `{ id }`)  
- `POST /api/deals/intake/files` — **one file per request** (client). Missing `intakeId` creates an **Untitled deal** draft. Small files: multipart. Large files: JSON `{ blobUrl, filename, mimeType, byteSize }` after client Blob upload.  
- `POST /api/deals/intake/blob` — `@vercel/blob` `handleUpload` token endpoint (`BLOB_READ_WRITE_TOKEN`)  
- `POST /api/deals/intake/import` — `action=create_entity` or apply CSVs/loan (`confirmReplace`)  
- `GET|POST /api/deals/intake/from-dropbox`  
- `GET|POST /api/deals/intake/from-email`  
- `GET|POST /api/deals/intake/scan-mailbox`  
- `GET /api/deals/providers` — configured flags for the UI  

Intake routes are rate-limited (40 / minute / IP). Tokens never go to the client.

## Follow-on

- Choose the RCP ingest mailbox address and set `RCP_INGEST_MAILBOX`  
- Dropbox / Gmail / Microsoft OAuth product polish  
- Vercel Blob is **required on Vercel for files over ~3.5 MB** (typical OM PDFs). See the click-by-click in the README.  

Sample files: [`data/samples/rent-roll.csv`](../data/samples/rent-roll.csv), [`data/samples/rent-roll.xlsx`](../data/samples/rent-roll.xlsx), [`data/samples/budget.csv`](../data/samples/budget.csv), [`data/samples/budget.xlsx`](../data/samples/budget.xlsx), redIQ Harrington fixtures in [`data/samples/harrington/`](../data/samples/harrington/).
