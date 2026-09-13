# Add Deal — guided SPE intake

Principal path to onboard a **new property SPE** under OpCo. New deals are never a second HoldCo.

Route: [`/deals/new`](/deals/new) · list: [`/deals`](/deals)

## Modes

| Mode | Status | Notes |
| --- | --- | --- |
| 1. Upload files | **Live** | Multi-file dropzone → intake draft → vault after SPE create. Max **10 MB** per file (same as vault). Larger OMs: note and add later on `/vault`. |
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
- `POST /api/deals/intake/files` — multipart upload → intake store (and vault after SPE exists)  
- `POST /api/deals/intake/import` — `action=create_entity` or apply CSVs/loan (`confirmReplace`)  
- `GET|POST /api/deals/intake/from-dropbox`  
- `GET|POST /api/deals/intake/from-email`  
- `GET|POST /api/deals/intake/scan-mailbox`  
- `GET /api/deals/providers` — configured flags for the UI  

Intake routes are rate-limited (40 / minute / IP). Tokens never go to the client.

## Follow-on

- Choose the RCP ingest mailbox address and set `RCP_INGEST_MAILBOX`  
- Dropbox / Gmail / Microsoft OAuth product polish  
- Object-store replication for vault blobs on Vercel  

Sample CSVs: [`data/samples/rent-roll.csv`](../data/samples/rent-roll.csv), [`data/samples/budget.csv`](../data/samples/budget.csv).
