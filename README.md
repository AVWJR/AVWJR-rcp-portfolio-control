# Roche Capital Partners — Portfolio Control

OpCo accounting / portfolio control for **Roche Capital Partners**. Phase A is the book ledger. Phase B is the property operating package. Phase C adds the debt file, CapEx/CIP, intercompany matching, and period-close workflow. Phase D is the live ratio dictionary plus OpCo and property dashboards with formula drill-down. Phase E is the chart / infographic layer, five-audience narratives, and PDF / PPTX report packs. **Phase F (final)** is books-to-tax worksheets, K-1-oriented capital exports, 1099 vendor hooks, the document vault, and scheduled pack generation.

**This system does not file taxes and does not replace CPA or counsel.** Books-to-tax and K-1 exports support CPA preparation only.

Locked stack: TypeScript, Next.js App Router, Prisma, PostgreSQL in production, **SQLite for local demo**. Server actions + API routes. USD, `en-US`, `America/New_York`. Integer cents. Double-entry intact.

Entity tree: **HoldCo → OpCo → Property SPE/LLC**. Seed SPEs are 100% owned. OpCo asset management fees sit **below NOI** on the SPE. OpCo’s multi-SPE view is a **combined roll-up** (eliminates IC `1310`/`2310` and AM `6310`/`7010`) — not a GAAP consolidation. See [docs/RCP_INTERCOMPANY.md](./docs/RCP_INTERCOMPANY.md).

## Local (SQLite) vs Vercel (Neon Postgres)

Prisma cannot put `sqlite` and `postgresql` in one schema file. This repo keeps **SQLite as the committed default** so a non-technical Principal can run the demo on a laptop. A generate step (`scripts/prisma-prepare.mjs`) copies `prisma/schema.prisma` → `prisma/schema.active.prisma` for local, or writes a PostgreSQL `prisma/schema.prod.prisma` (pooled `DATABASE_URL` + unpooled `DIRECT_URL`) when the URL is `postgres://` / `postgresql://` or when Vercel builds.

`npm run build` only runs `prisma generate` (no live database). Vercel’s build command is `npm run vercel-build`, which also runs `prisma db push` against Neon so the first deploy creates tables.

### Local SQLite demo

```bash
cp .env.example .env
npm install
npm run db:reset    # prisma db push && seed (wipes demo rows)
npm test
npm run verify:f    # Phase F tax / vault / scheduler
npm run verify      # Phase A through F
npm run reports:run -- --pack=monthly_investor --entity=SPE-WBG --period=2026-08
npm run dev
```

App: [http://localhost:3000](http://localhost:3000)

### RCP Expert coach

Every page mounts a lower-right **Expert** FAB that opens a miniature coaching dialogue (not a generic chatbot). The Expert reads the current **entity** and **period** from the URL, speaks first with where you are and three next-move chips, and can audit missing data, errant journals, and anomalous KPIs from the **same** dashboard / close / rent-roll / loan math as the rest of the app.

- **Offline (default)** — no model key required. The panel still opens, shows a gold banner (“Offline coach — add key”), and answers from live tools (`getEntitySummary`, `getPeriodStatus`, `getKpiSnapshot`, `getDataCompleteness`, `getAnomalies`, `listNavTargets`). It will not invent GL balances or covenants.
- **Live Grok (go-live)** — set server-only **`AI_GATEWAY_API_KEY`** and **`EXPERT_MODEL=spacexai/grok-4.6`** (current Vercel AI Gateway Grok text slug from `GET https://ai-gateway.vercel.sh/v1/models`). Older docs use **`xai/grok-4.6`** — that alias is rewritten to `spacexai/`. The panel streams and shows a green **Grok connected** banner. Optional fallback: **`XAI_API_KEY`** (alias **`GROK_API_KEY`**) against `https://api.x.ai/v1` with **`grok-4.6`**. If both keys are set, Gateway wins. Keys never go in `NEXT_PUBLIC_*`. If no key is set, gold **Offline coach — add key**. If a key is set but the Gateway/xAI call fails, the panel keeps an offline reply as last resort and shows a one-line **why** in the error strip (not a silent green “connected” lie).
- Conversation is stored in `localStorage` keyed by entity + period. **New chat** clears that thread. `Esc` closes the panel; focus returns to the FAB.
- `GET /api/expert/context?entity=SPE-WBG&period=2026-08&pathname=/dashboard/SPE-WBG` · `POST /api/expert/chat` (JSON `{ context, messages?, intent?, stream? }`). The chat route is rate-limited and read-only. Live Grok replies stream as NDJSON when `stream: true`.

#### Turn on Grok (Principal — Vercel click-path)

Primary: they added a Vercel AI Gateway card. Use the Gateway key.

1. Open the Vercel project → **Settings** → **Environment Variables**.
2. Add **`AI_GATEWAY_API_KEY`** (from the AI Gateway card / project AI settings). Never prefix `NEXT_PUBLIC_`.
3. Add **`EXPERT_MODEL`** = **`spacexai/grok-4.6`** (working Gateway Grok text model as of the public catalog; default if omitted on the Gateway path). Also accepted: **`xai/grok-4.6`** (rewritten to `spacexai/`).
4. Apply to **Production** and **Preview**. **Redeploy** (Deployments → ⋯ → Redeploy).
5. Open any page → lower-right **Expert**. Banner should read **Grok connected**, and the first reply should be from Grok (source **+ Grok**), not **(offline coach)**. If live fails, a gold strip explains why.

Optional fallback (both paths stay working): set **`XAI_API_KEY`** (or **`GROK_API_KEY`**) and **`EXPERT_MODEL=grok-4.6`**. Used only when `AI_GATEWAY_API_KEY` is unset. Calls `https://api.x.ai/v1`.

Without a key, Expert still opens: gold **Offline coach — add key**, live completeness / anomaly tools, no invented GL / LTV / delinquency / tax filing.
- Partner demo links stay read-only (see **Partner viewer link**). The Expert is a read-only coach on the seeded ledger. This is not multi-tenant auth.

### Add Deal (new property SPE)

Guided intake for a **new SPE under OpCo** (usually `RCP-OPCO`). Gold nav **Deals** → **Add Deal**, or Overview → Add Deal. Route: [`/deals/new`](http://localhost:3000/deals/new) · SPE list: [`/deals`](http://localhost:3000/deals). Expert chip: **Add a new deal**.

| Mode | This release |
| --- | --- |
| 1. Upload files | **Live** — multi-file dropzone (CSV, **XLSX/XLS**, PDF, images), classify, vault + rent-roll / budget import |
| 2. Dropbox | Provider + UI. List/import when `DROPBOX_ACCESS_TOKEN` is set; otherwise a **Connect Dropbox** empty state |
| 3. Email attachment | Upload `.eml` / attachment files, or fetch when `GMAIL_ACCESS_TOKEN` / `MICROSOFT_ACCESS_TOKEN` is set |
| 4. RCP mailbox | Architecture + stub. `RCP_INGEST_MAILBOX` is a placeholder. **Mailbox address is not decided yet.** **Scan RCP inbox** no-ops with an honest message |

Drafts persist (`DealIntake`). **Upload-first:** drop files with no identity keystrokes. The wizard auto-creates an **Untitled deal** draft, infers name/code from filenames, uploads **one file at a time**, then auto-ingests (create SPE + vault + broker rent-roll XLSX → Unit rows). T12/P&L workbooks are vaulted, not invented into the GL. File cap **32 MB**. **Add Deal and the document vault** send files over ~3.5 MB through **Vercel Blob client upload** (not the serverless body). Without Blob on Vercel a 5.5 MB OM shows “OM is 5.5 MB — add `BLOB_READ_WRITE_TOKEN`…” instead of a naked HTTP 413 or a stuck **Uploading…**. Durable store: **local `data/vault/`**, **Neon `StoredBlob`** for small Vercel uploads, or **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`, **required** for OM PDFs over ~3.5 MB).

Sample files: [`data/samples/rent-roll.csv`](./data/samples/rent-roll.csv), [`data/samples/rent-roll.xlsx`](./data/samples/rent-roll.xlsx), [`data/samples/budget.csv`](./data/samples/budget.csv), [`data/samples/budget.xlsx`](./data/samples/budget.xlsx). Spec: [docs/RCP_ADD_DEAL.md](./docs/RCP_ADD_DEAL.md).

APIs: `POST /api/deals` · `POST /api/deals/intake` · `POST /api/deals/intake/files` · `POST /api/deals/intake/blob` · `POST /api/deals/intake/import` · `POST /api/deals/intake/from-dropbox` · `POST /api/deals/intake/from-email` · `POST /api/deals/intake/scan-mailbox`

Sample: [http://localhost:3000/dashboard/SPE-WBG?entity=SPE-WBG&period=2026-08&expert=1](http://localhost:3000/dashboard/SPE-WBG?entity=SPE-WBG&period=2026-08&expert=1)

Screenshots: [FAB](./docs/expert/expert_fab.png) · [opener](./docs/expert/expert_panel_opener.png) · [SPE-WBG flags](./docs/expert/expert_anomaly_spe_wbg.png) · [mobile](./docs/expert/expert_mobile_sheet.png)

`.env` default:

```
DATABASE_URL="file:./dev.db"
TZ=America/New_York
NEXT_PUBLIC_RCP_CURRENCY=USD
NEXT_PUBLIC_RCP_LOCALE=en-US
NEXT_PUBLIC_RCP_TIMEZONE=America/New_York
```

Prisma resolves `file:./dev.db` relative to `prisma/`, so the file is `prisma/dev.db`. Do **not** point local `.env` at Neon unless you intend to work against that database.

### Vercel + Neon Postgres

1. Create a Vercel project from this GitHub repo (framework: Next.js; this repo ships `vercel.json` with `buildCommand: npm run vercel-build`).
2. Provision Neon (preferred: [Vercel Marketplace](https://vercel.com/marketplace) → Neon, or `vercel integration add neon`). Copy the **pooled** and **unpooled** connection strings.
3. Set the environment variables below on **Production** and **Preview**.
4. Deploy. The build generates a PostgreSQL Prisma client and pushes the schema.
5. Open `https://<your-app>/admin/seed`, paste `SEED_SECRET`, and load demo data once. Or:

```bash
curl -X POST "https://<your-app>/api/admin/seed" \
  -H "Authorization: Bearer $SEED_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

If rows already exist, the route does nothing unless you send `{ "force": true }` (wipes the demo database). Wrong or missing `SEED_SECRET` is rejected; if `SEED_SECRET` is unset, the route returns 404.

### Partner viewer link (optional)

This is **not** multi-tenant auth. When `PARTNER_VIEW_TOKEN` (or `VIEWER_PASSWORD`) and/or `PRINCIPAL_PASSWORD` are set (8+ characters), the public URL defaults to **partner view**: dashboards, narratives, and packs are readable; Add Deal, `/admin/seed`, intake uploads, and other writes return 403. Local `npm run dev` stays Principal if those vars are unset.

**Share with an LP / lender:** `https://<your-app>/?share=<PARTNER_VIEW_TOKEN>` (or `/partner`). A gold **Partner view — read only** banner appears.

**Principal writes:** open `/unlock` and enter `PRINCIPAL_PASSWORD`, or `https://<your-app>/?unlock=<PRINCIPAL_PASSWORD>`.

Alternatively, lock the whole deployment with [Vercel Deployment Protection](https://vercel.com/docs/security/deployment-protection) and only give the Vercel password to people who should open the app at all; then use the partner token so LPs still cannot mutate.

Seed data is **demo books and sample tax-bridge rows only**. This system does not file taxes.

#### Environment variables to set on Vercel

| Name | Required | Value |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Neon **pooled** URL (`-pooler` in the hostname), e.g. `postgresql://USER:PASSWORD@ep-xxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require` |
| `DIRECT_URL` | Yes | Neon **unpooled** URL (no `-pooler`) for `prisma db push` |
| `SEED_SECRET` | Yes (to seed) | Random string, **at least 16 characters**. Protects `POST /api/admin/seed` |
| `TZ` | Yes | `America/New_York` |
| `NEXT_PUBLIC_RCP_CURRENCY` | Yes | `USD` |
| `NEXT_PUBLIC_RCP_LOCALE` | Yes | `en-US` |
| `NEXT_PUBLIC_RCP_TIMEZONE` | Yes | `America/New_York` |
| `AI_GATEWAY_API_KEY` | No (primary for live Grok) | Vercel AI Gateway key. Offline coach works without it |
| `EXPERT_MODEL` | No | Gateway default **`spacexai/grok-4.6`** (alias **`xai/grok-4.6`** is rewritten). Direct xAI fallback **`grok-4.6`** |
| `XAI_API_KEY` / `GROK_API_KEY` | No | Optional direct xAI fallback (`https://api.x.ai/v1`, model `grok-4.6`) |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | No | Alternate server-only keys for live Expert replies |
| `DROPBOX_ACCESS_TOKEN` | No | Enables Dropbox file pick on Add Deal (server-only) |
| `DROPBOX_APP_KEY` / `DROPBOX_APP_SECRET` | No | Reserved for Dropbox OAuth follow-on |
| `GMAIL_ACCESS_TOKEN` / `MICROSOFT_ACCESS_TOKEN` | No | Optional mailbox connectors for email-attachment intake |
| `RCP_INGEST_MAILBOX` | No | Placeholder for the RCP-owned ingest inbox (**address TBD**) |
| `RCP_DEFAULT_OPCO` | No | Parent OpCo code for new deals, default `RCP-OPCO` |
| `BLOB_READ_WRITE_TOKEN` | **Required on Vercel for OM / files over ~3.5 MB** | Vercel Blob read-write token. Without it, a 5.5 MB OM gets a Principal message — not a naked 413. Small files still persist in Neon (`StoredBlob`) |
| `RCP_FILE_STORE` | No | Force `blob`, `db`, or `fs`. Default: Blob when the token is set, `db` on Vercel, `fs` on a laptop |
| `PARTNER_VIEW_TOKEN` / `VIEWER_PASSWORD` | No | 8+ chars. Turns the public URL into partner view (share `/?share=<token>`). Alias: `VIEWER_PASSWORD` |
| `PRINCIPAL_PASSWORD` | No | 8+ chars. Unlock writes at `/unlock` or `/?unlock=<password>` |

Accepted aliases if the Marketplace names differ: `POSTGRES_PRISMA_URL` or `POSTGRES_URL` for the pooled URL; `DATABASE_URL_UNPOOLED` or `POSTGRES_URL_NON_POOLING` for the direct URL.

Runtime uses `@prisma/adapter-neon` (Prisma 6.16 driver adapters, GA) with the pooled URL. The Prisma CLI uses `DIRECT_URL` so migrations / `db push` never go through PgBouncer.

Laptop seed against Neon (optional): put the same URLs in `.env` and run `npm run db:reset`. That **wipes** the remote database — prefer `/admin/seed` for a first empty deploy.

#### Connect Vercel Blob (Principal — required for a 5.5 MB OM)

The app cap is **32 MB per file**. Vercel’s function **request body** is still ~**4.5 MB** on typical Hobby/Pro requests, so `Life_at_Harrington_Park_OM_….pdf` at **5,605 KB** 413s if the bytes go through `/api/deals/intake/files` or `/api/vault` as multipart. After Blob is connected, **Add Deal and `/vault`** upload those bytes with `@vercel/blob` `upload()` / `handleUpload` (token routes `/api/deals/intake/blob` and `/api/vault/blob`).

1. Open [vercel.com](https://vercel.com) and select this project.
2. Click **Storage**.
3. Click **Create Database** (or **Create**) → choose **Blob**.
4. Create the store and **connect** it to this project (Production + Preview).
5. Confirm the env var name is exactly **`BLOB_READ_WRITE_TOKEN`** (Vercel injects it when the store is connected). If you created the token by hand: Settings → Environment Variables → add `BLOB_READ_WRITE_TOKEN` for Production and Preview.
6. **Redeploy** the latest production deployment (Deployments → ⋯ → Redeploy) so the token is in the running function.
7. Retry Add Deal or `/vault?entity=SPE-HRP3`: drop the three small xlsx first if you want, then the OM — or drop all four. The OM should store instead of HTTP 413 / a stuck **Uploading…**. Vault filenames with `_OM_` store as kind **OM / CIM**.

## Seed entities

| Code | Name | Notes |
| --- | --- | --- |
| RCP-HOLD | Roche Capital Partners HoldCo | Parent |
| RCP-OPCO | RCP Operating Company LLC | Combined roll-up parent for SPEs |
| SPE-WBG | Willow Bend Gardens LLC | 264 units · value-add garden |
| SPE-CVC | Crestview Commons LLC | 192 units · stabilized |
| SPE-HCR | Harbor Court Residences LLC | 84 units · light rehab |

Books: opening **2026-07**, operating month **2026-08**. Switch entity and period in the navy header. On OpCo, choose **Combined roll-up** to stack wholly owned SPEs.

Sample SPE to click: **Willow Bend Gardens (`SPE-WBG`)**  
http://localhost:3000/tax?entity=SPE-WBG&period=2026-08  
http://localhost:3000/tax/k1?entity=SPE-WBG&period=2026-08  
http://localhost:3000/vault?entity=SPE-WBG&period=2026-08  
http://localhost:3000/scheduler?entity=SPE-WBG&period=2026-08  
http://localhost:3000/narratives?entity=SPE-WBG&period=2026-08  
http://localhost:3000/narratives/packs/monthly_investor?entity=SPE-WBG&period=2026-08  
http://localhost:3000/dashboard  
http://localhost:3000/dashboard/SPE-WBG?entity=SPE-WBG&period=2026-08  
http://localhost:3000/dashboard/ratios/noi_period?entity=SPE-WBG&period=2026-08  
http://localhost:3000/properties/SPE-WBG?entity=SPE-WBG&period=2026-08  
http://localhost:3000/debt?entity=SPE-WBG&period=2026-08  
http://localhost:3000/capex?entity=SPE-WBG&period=2026-08  
http://localhost:3000/close?entity=SPE-WBG&period=2026-07
http://localhost:3000/deals
http://localhost:3000/deals/new

Close demo: WBG `2026-07` is **hard locked**. CVC `2026-07` is **soft closed**. August stays open.

## Phase F — tax bridges, vault, scheduled reporting

- **Books-to-tax** — `/tax` worksheet per entity: book NI, 6210 depreciation, 6110 interest, 6310 AM fees (below NOI) vs tax columns. MACRS lives hooks (27.5-year residential, 15-year site, 5-year FF&E). Every line labeled **BOOKS** / **TAX** / **BRIDGE**. Sample adjustments seeded on SPE-WBG and RCP-OPCO. Combined roll-up is **not a tax consolidation**.
- **Partner capital / K-1 export** — `/tax/k1` rollforward `beg + contrib − dist ± book NI = end`. CSV / Excel for CPA K-1 prep. **Not a filed Schedule K-1.** Seed SPEs stay 100% owned.
- **1099 vendor hooks** — `/vendors` master (form, TIN last4) plus reportable-payment overlay. Phase A AP (`2010`/`2020`) has no invoice subledger; empty overlay stubs honestly. Not a filed 1099.
- **Document vault** — `/vault` stores metadata plus file blobs (leases, loans, K-1s, draws, insurance, OMs) linked to an entity. **Laptop:** `data/vault/`. **Vercel:** Neon `StoredBlob` for small multipart files, or private Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set. **Vault and Add Deal** both use Blob client upload for files over ~3.5 MB (required for OM PDFs). Filenames with `_OM_` / offering memo prefer kind `om_cim`. The serverless filesystem is not used for durable uploads. Upload / list / download.
- **Scheduled reporting** — `/scheduler` job defs for monthly investor and quarterly lender packs. CLI `npm run reports:run -- --pack=...`. Writes PDF/PPTX under `data/reports/` and persists last-run status. No email send.

Docs: [docs/RCP_TAX_BRIDGE.md](./docs/RCP_TAX_BRIDGE.md) · [docs/RCP_DOCUMENT_VAULT.md](./docs/RCP_DOCUMENT_VAULT.md) · [docs/RCP_SCHEDULER.md](./docs/RCP_SCHEDULER.md) · [VERIFY_PHASE_F.md](./VERIFY_PHASE_F.md).

API: `GET /api/tax/bridge` · `GET /api/tax/k1` · `GET /api/vendors/1099` · `GET|POST /api/vault` · `GET /api/vault/{id}` · `GET /api/scheduler` · `POST /api/scheduler/run`

## Phase E — infographics, narratives, report packs

- **Chart layer** — Recharts (light/dark RCP themes) plus print-ready PDF vectors and PPTX Office charts: GPR→NOI→BTCF waterfall; NOI / book-occupancy / OpEx ratio / DSCR trends; OpEx composition; CapEx vs reserves; debt maturity wall; NOI concentration and SPE heatmap; actual vs budget bridge; BS composition.
- **Narrative engine** — First-class `AudienceBrief` per LP, GP, Investment Committee, Lender, and Management Committee (CRE Sentinel matrix). Switching audience on `/narratives` changes **section outline, KPI chips, and infographics** — not just the title. Shared KPI chips are only ids on 3+ audiences. Every NOI tile carries a `noiDefinition`. Copy is plain professional English and cites key numbers with units. Regenerates when entity or period changes. IC memo includes a deterministic go / hold / kill. Seed / incomplete-T12 disclaimer stays on SPE-WBG demo months.
- **Packs** — Monthly Investor Pack (LP), Quarterly Lender Pack, IC Memo Pack, Management Flash. Export **PDF** and **PPTX**. Catalog: [docs/RCP_REPORT_CATALOG.md](./docs/RCP_REPORT_CATALOG.md).
- **UI** — `/narratives` replaces the Phase D stub. Pack preview at `/narratives/packs/{id}`. Alias `/reports/packs`.
- **API** — `GET /api/narratives?entity=SPE-WBG&period=2026-08` · `&audience=lp` · `GET /api/packs` · `GET /api/packs/monthly_investor?entity=SPE-WBG&period=2026-08&format=pdf|pptx|json`

BTCF = period NOI − interest − principal (AM stays below NOI). CFADS remains the Phase D distributions proxy. T12 is not silently annualized. LTV and delinquency stay gated.

## Phase D — OpCo + property ratio dashboards

- **Live dictionary** — `@rcp/analytics` implements [docs/RCP_RATIO_DICTIONARY_STUB.md](./docs/RCP_RATIO_DICTIONARY_STUB.md) with explicit formulas, units, and NOI definition labels (**period** vs **T12** vs **annualized period**). T12 is incomplete on the two-month demo seed and is not silently annualized.
- **Property dashboard** — `/dashboard/[entityCode]` (e.g. `SPE-WBG`): period NOI, NOI/unit, EGI, OpEx ratio, tagged controllable OpEx, CapEx vs reserves, CFADS and CFADS/DSCR, cash, NOI budget variance, rent-roll physical occupancy / loss-to-lease / book economic occupancy / breakeven, loan DSCR / debt yield / UPB / maturity. Delinquency and LTV stay gated.
- **OpCo dashboard** — `/dashboard` → `RCP-OPCO` combined: properties/units, look-through NOI and NOI/unit, liquidity months, look-through UPB / DSCR / debt yield (not LTV), fee income, G&A%, covenant watchlist, NOI concentration. Combined roll-up is labeled **not a GAAP consolidation**.
- **Drill-down** — every tile opens `/dashboard/ratios/[id]` with the formula, NOI label, contributing accounts or rent-roll fields, and links to OS / TB / debt / rent roll / CapEx.
- **Phase E** — live at `/narratives` (this release).

API: `GET /api/dashboard?entity=SPE-WBG&period=2026-08` · `GET /api/ratios`

## Phase C — debt, capex, close

- **Debt** — one first mortgage per SPE (lender, original/UPB, rate, payment, maturity, reserve requirement). August interest/principal match GL `6110` and mortgage paydown. Helpers for amortization, debt-service journals, and LT → current reclass. DSCR and debt yield stored + computed. Portfolio maturity schedule at `/debt`.
- **CapEx / CIP** — `1460` Construction in Progress. CapEx vs R&M classified. Journals move CIP → fixed asset. Monthly depreciation `6210`/`1490` unchanged. Seed: WBG value-add interiors (CIP + partial PIS) and an R&M tracker.
- **Intercompany** — unmatched SPE `2310` vs OpCo `1310` (and AM `6310`/`7010`) hard-fails `verify:c`.
- **Period close** — `OPEN` → soft close → controller checklist → hard lock. Posts to locked periods are rejected. Reopen requires reason + ticket.

Formulas: [docs/RCP_DEBT.md](./docs/RCP_DEBT.md), [docs/RCP_CAPEX.md](./docs/RCP_CAPEX.md), [docs/RCP_SPE_MONTHLY_CLOSE.md](./docs/RCP_SPE_MONTHLY_CLOSE.md).

## Phase B — property operating package

- **Operating statement / NOI bridge** — GPR → vacancy/concessions → EGR → other income → EGI → OpEx groups → NOI → interest, depreciation, AM fees → NI. Budget vs actual ($ and %) and prior-period / MoM when the prior month exists.
- **Rent roll / unit master** — unit id, floorplan, beds/baths, sqft, status, market rent, in-place rent, lease start/end, concession. Seeded to match SPE unit counts and August GL GPR / vacancy / concessions.
- **Budgets** — monthly by CoA account, integer cents. Seeded for **2026-08** on each SPE and OpCo.
- **KPIs (rent-roll sourced, gated)** — physical occupancy, loss-to-lease, rent-roll vacancy and concessions. **Book economic occupancy = EGI / GPR**. Breakeven occupancy from GL OpEx + debt service. Delinquency is stubbed (no charge/receipt data).

Formulas: [docs/RCP_OPERATING_KPIS.md](./docs/RCP_OPERATING_KPIS.md).

### Import paths

CSV import **replaces** the SPE’s current rent roll or that month’s budget. The UI requires a confirm checkbox. CLI requires `--replace`. API requires `confirmReplace=true` when rows already exist.

```bash
npm run import:rent-roll -- --entity=SPE-WBG --file=data/samples/rent-roll.csv --replace
npm run import:budget -- --entity=SPE-WBG --period=2026-08 --file=data/samples/budget.csv --replace
```

UI import lives on the property page (rent roll) and operating statement (budget). API:

- `POST /api/rent-roll` (multipart `entity` + `file` + `confirmReplace=true`)
- `GET /api/rent-roll?entity=SPE-WBG` · `&format=csv` to download
- `POST /api/budgets` (multipart `entity`, `period`, `file`, `confirmReplace=true`)
- `GET /api/budgets?entity=SPE-WBG&period=2026-08`
- `GET /api/debt` · `GET /api/capex` · `GET /api/close`
- `GET /api/reports/os?entity=SPE-WBG&period=2026-08`
- `GET /api/reports/kpis?entity=SPE-WBG&period=2026-08`
- `GET /api/reports/{tb|is|bs|cf}?entity=SPE-WBG&period=2026-08`
- OpCo combined roll-up: `?entity=RCP-OPCO&view=combined`

CSV headers:

```
unit_id,floorplan,beds,baths,sqft,status,market_rent,in_place_rent,lease_start,lease_end,concession
account_code,amount
```

Rents and budget amounts are USD in the file; the importer stores integer cents. Status is `OCCUPIED` | `VACANT` | `DOWN`.

## Statements

- Operating Statement — Phase B NOI bridge + variance
- Trial Balance — as-of period end
- Income Statement — book P/L (same NOI math, no budget columns)
- Balance Sheet — as-of, including unclosed NI and CIP `1460`
- Cash Flow — indirect; ending cash ties to the balance sheet
- Debt maturity / covenants — Phase C
- CapEx / CIP register — Phase C
- Period close board — Phase C

## Packages

| Package | Role |
| --- | --- |
| `@rcp/ledger` | CoA, double-entry, TB / IS / BS / CF, close rules, IC match |
| `@rcp/debt` | Loan amort, covenants, debt-service / CIP / current-portion journals |
| `@rcp/properties` | Unit master, rent-roll CSV, occupancy / loss-to-lease |
| `@rcp/reporting` | Operating statement + variance + chart suite + five-audience narratives + pack assembly |
| `@rcp/analytics` | Live ratio dictionary + formula helpers; LTV and delinquency still gated |
| `@rcp/rcp-brand` | Institutional brand tokens + chart themes |
| `@rcp/entities` | HoldCo / OpCo / SPE types |
| `@rcp/tax-bridge` | Books-to-tax worksheet, MACRS hooks, capital / K-1 export, 1099 overlay |
| `@rcp/documents` | PDF / PPTX packs + document vault + scheduled job catalog |

## Docs

- [ERD.md](./ERD.md)
- [VERIFY_PHASE_A.md](./VERIFY_PHASE_A.md)
- [VERIFY_PHASE_B.md](./VERIFY_PHASE_B.md)
- [VERIFY_PHASE_C.md](./VERIFY_PHASE_C.md)
- [VERIFY_PHASE_D.md](./VERIFY_PHASE_D.md)
- [VERIFY_PHASE_E.md](./VERIFY_PHASE_E.md)
- [VERIFY_PHASE_F.md](./VERIFY_PHASE_F.md)
- [docs/RCP_COA_OUTLINE.md](./docs/RCP_COA_OUTLINE.md)
- [docs/RCP_SPE_MONTHLY_CLOSE.md](./docs/RCP_SPE_MONTHLY_CLOSE.md)
- [docs/RCP_DEBT.md](./docs/RCP_DEBT.md)
- [docs/RCP_CAPEX.md](./docs/RCP_CAPEX.md)
- [docs/RCP_INTERCOMPANY.md](./docs/RCP_INTERCOMPANY.md)
- [docs/RCP_OPERATING_KPIS.md](./docs/RCP_OPERATING_KPIS.md)
- [docs/RCP_RATIO_DICTIONARY_STUB.md](./docs/RCP_RATIO_DICTIONARY_STUB.md)
- [docs/RCP_REPORT_CATALOG.md](./docs/RCP_REPORT_CATALOG.md)
- [docs/RCP_TAX_BRIDGE.md](./docs/RCP_TAX_BRIDGE.md)
- [docs/RCP_DOCUMENT_VAULT.md](./docs/RCP_DOCUMENT_VAULT.md)
- [docs/RCP_ADD_DEAL.md](./docs/RCP_ADD_DEAL.md)
- [docs/RCP_SCHEDULER.md](./docs/RCP_SCHEDULER.md)

## Out of scope

No live PMS or bank feed. No promote waterfall. No IRS e-file / SSO. No full AP invoice subledger (1099 overlay only). No BigBrainRE underwriting. No LTV from book cost. Does not file taxes. Does not choose the final RCP ingest mailbox address. Dropbox / Gmail OAuth product polish waits on partner credentials.
