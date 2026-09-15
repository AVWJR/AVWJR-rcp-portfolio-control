import { withContext } from "./nav";
import type { ExpertClientContext, ExpertChip, ExpertSuggestedAction } from "./types";

/** Durable Q→click-path playbook. Offline coach, chips, and live Grok share this. */

export type HowToTopic =
  | "reupload_t12"
  | "t12_incomplete_metric"
  | "reapply_rent_roll"
  | "download_canonical"
  | "delete_deal"
  | "restore_deal"
  | "vault_upload"
  | "screens_map"
  | "add_deal"
  | "narratives_packs"
  | "partner_limits";

function href(path: string, ctx: ExpertClientContext): string {
  return withContext(path, ctx.entityCode, ctx.periodLabel, ctx.view);
}

function mdLink(path: string, ctx: ExpertClientContext, label: string): string {
  return `[${label}](${href(path, ctx)})`;
}

function dashboardPath(ctx: ExpertClientContext): string {
  return ctx.entityCode.startsWith("SPE-") || ctx.entityCode === "RCP-OPCO" ? `/dashboard/${ctx.entityCode}` : "/dashboard";
}

function partnerPrefix(ctx: ExpertClientContext, action: string): string {
  if (ctx.accessRole !== "viewer") return "";
  return `You are in **partner view** — dashboards, narratives, packs, and this coach only. You cannot ${action}. Unlock writes at **/unlock** (or \`/?unlock=\`). Here is the Principal click path:\n\n`;
}

export function isT12FileToken(q: string): boolean {
  return /\b(t-?12|t12)\b|\bp\s*&\s*l\b|\bp\/l\b|\bpnl\b|profit\s*(and|&)\s*loss/.test(q);
}

export function isUploadVerb(q: string): boolean {
  return /\b(re-?upload|reupload|replace|upload|drop|ingest|store|re-?map|file)\b/.test(q);
}

export function isT12UploadQuery(q: string): boolean {
  const t = q.toLowerCase();
  if (!isT12FileToken(t)) return false;
  if (/\brent[-\s]?roll\b|\brentroll\b/.test(t) && !isUploadVerb(t)) return false;
  if (isUploadVerb(t)) return true;
  return /how (do i|can i|to).{0,40}\b(t-?12|t12|p&l|p\/l|pnl)\b/.test(t);
}

export function isT12MetricQuery(q: string): boolean {
  const t = q.toLowerCase();
  if (!/\b(t-?12|t12)\b/.test(t)) return false;
  if (isT12UploadQuery(t)) return false;
  return /(incomplete|2\s*\/\s*12|12\s*\/\s*12|not annuali[sz]|what is|what does|why (is|does)|mean\b|ready t12|t12 noi|trailing twelve)/.test(
    t,
  );
}

export function isRentRollHowToQuery(q: string): boolean {
  const t = q.toLowerCase();
  if (isT12UploadQuery(t)) return false;
  const named = /\b(rent[-\s]?roll|rentroll|unit master|lease charges|units written)\b/.test(t) || /\b\*rr\*\b/.test(t);
  if (!named) return false;
  return /how (do i|can i|to)|where (do i|can i|is)|i need to|\b(re-?apply|apply|import|upload|replace|download|dialect|kind other|xlsx)\b/.test(
    t,
  );
}

export function isDownloadCanonicalQuery(q: string): boolean {
  const t = q.toLowerCase();
  return /canonical xlsx|original workbook|download (the )?(canonical|original|rent-?roll)|export (the )?(canonical|original|rent-?roll)/.test(
    t,
  );
}

export function isDeleteDealQuery(q: string): boolean {
  return /(delete|remove|undo|get rid of|kill|archive|hide|restore)\b.{0,40}\b(deal|spe|propert|intake|draft)\b|\b(deal|spe|propert)\b.{0,20}\b(delete|remove|archive|hide|restore)\b|deal archive|archived deals?/i.test(
    q,
  );
}

export function isRestoreDealQuery(q: string): boolean {
  const t = q.toLowerCase();
  if (!isDeleteDealQuery(t)) return false;
  return /\brestore\b/.test(t) || (/deal archive|archived deals?/.test(t) && !/\bdelete\b/.test(t));
}

export function isAddDealQuery(q: string): boolean {
  return /add (a )?new deal|new deal|add deal|onboard (a )?(deal|spe|property)|new (spe|property)/i.test(q);
}

export function isVaultUploadQuery(q: string): boolean {
  const t = q.toLowerCase();
  if (isT12UploadQuery(t) || isRentRollHowToQuery(t) || isDeleteDealQuery(t)) return false;
  if (/difference between|vault vs|deals vs|properties vs/.test(t)) return false;
  return /vault|document store|store in vault|file (a |the )?(lease|om|loan|insurance|k-?1|cim)/.test(t);
}

export function isScreensMapQuery(q: string): boolean {
  const t = q.toLowerCase();
  if (isT12UploadQuery(t) || isRentRollHowToQuery(t) || isDeleteDealQuery(t) || isAddDealQuery(t)) return false;
  return (
    /vault vs|deals vs|properties vs|dashboard vs|difference between|which screen|what is (the )?(vault|deals|properties|dashboard|narratives) for/.test(
      t,
    ) ||
    /where (do i|can i|is).{0,24}(vault|deals|properties|dashboard|narratives|packs?)/.test(t) ||
    /how do i (get to|open) (vault|deals|properties|dashboard)/.test(t)
  );
}

export function isNarrativesPackQuery(q: string): boolean {
  const t = q.toLowerCase();
  if (isT12UploadQuery(t) || isRentRollHowToQuery(t) || isDeleteDealQuery(t)) return false;
  return /lender pack|lp pack|investor pack|lp narrative|narratives|audience tone|monthly investor|quarterly lender/.test(
    t,
  );
}

export function isPartnerLimitsQuery(q: string): boolean {
  return /partner (view|limit|can)|what can (a )?partner|viewer (gate|link|limit)|unlock|principal vs partner/.test(
    q.toLowerCase(),
  );
}

export function matchHowTo(raw: string): HowToTopic | null {
  const q = raw.trim().toLowerCase();
  if (!q) return null;
  if (isRestoreDealQuery(q)) return "restore_deal";
  if (isDeleteDealQuery(q)) return "delete_deal";
  if (isT12UploadQuery(q)) return "reupload_t12";
  if (isT12MetricQuery(q)) return "t12_incomplete_metric";
  if (isDownloadCanonicalQuery(q)) return "download_canonical";
  if (isRentRollHowToQuery(q)) return "reapply_rent_roll";
  if (isAddDealQuery(q)) return "add_deal";
  if (isPartnerLimitsQuery(q)) return "partner_limits";
  if (isNarrativesPackQuery(q)) return "narratives_packs";
  if (isScreensMapQuery(q)) return "screens_map";
  if (isVaultUploadQuery(q)) return "vault_upload";
  return null;
}

export function isHowToQuery(raw: string): boolean {
  return matchHowTo(raw) !== null;
}

function t12Copy(ctx: ExpertClientContext): string {
  const vault = mdLink("/vault", ctx, "Vault");
  const deals = mdLink("/deals", ctx, "Deals");
  const add = mdLink("/deals/new", ctx, "Add Deal");
  const os = mdLink("/reports/operating-statement", ctx, "Operating Statement");
  const props = mdLink(ctx.entityCode.startsWith("SPE-") ? `/properties/${ctx.entityCode}` : "/properties", ctx, "Properties");
  return `${partnerPrefix(ctx, "upload or replace a T12")}**Re-upload the T12 / P&L workbook** — that is a file drop, not a pack export.

1. Gold nav **Vault** — ${vault}. Set the header **Entity** to this SPE.
2. On the **Upload** card, set **Kind**. There is **no T12 kind**. A T12 / T-12 / P&L workbook stores as **Other** (you may label it **Budget** if you want that tag). Choose the XLSX, then **Store in vault**.
3. To **map** it (not only store it): gold nav **Deals** — ${deals} → **Add Deal** — ${add}. Drop the same workbook on **Upload files**. Filenames like \`T12_…\`, \`T-12\`, or \`P&L\` classify as **T12 / P&L workbook**. Auto-ingest **reuses** this SPE when the name matches.
4. After a good map: monthly **budget** lines (broker T12 overlay) and labeled overlay journals on the demo period. Those dollars are an honest overlay — not audited books. If columns fail you see **could not map columns** plus **Detected headers**. The file stays in Vault. There is **no separate mapper screen**.
5. The pack / dashboard line **T12 incomplete 2/12** is **posted book months**, not this workbook. Replacing the T12 file does **not** turn two demo months into a full 12/12 T12 NOI.

${props} is rent-roll import / re-apply — not a T12 drop. ${os} **Replace monthly budget CSV** is CoA budget rows, not the T12 mapper.`;
}

function t12MetricCopy(ctx: ExpertClientContext): string {
  const os = mdLink("/reports/operating-statement", ctx, "Operating Statement");
  const dash = mdLink(dashboardPath(ctx), ctx, "Dashboard");
  return `**T12 incomplete 2/12** means this SPE does not yet have twelve posted operating months. It is **not** a pack-export problem, and it is **not** cleared by generating PDF / PPTX.

True T12 NOI needs 12/12 posted months. The demo seed has two months; incomplete T12 is **not** annualized or labeled ready T12.

If you meant **replace the T12 / P&L workbook**, that is a Vault / Add Deal file drop — I can walk that path. The overlay updates budget lines; it does not invent 12 posted months.

Open ${dash} or ${os} to read period NOI versus the T12 warning.`;
}

function rentRollCopy(ctx: ExpertClientContext): string {
  const dest = mdLink(
    ctx.entityCode.startsWith("SPE-") ? `/properties/${ctx.entityCode}` : "/properties",
    ctx,
    ctx.entityCode.startsWith("SPE-") ? "this SPE’s Properties page" : "Properties",
  );
  const vault = mdLink("/vault", ctx, "Vault");
  const dash = mdLink(dashboardPath(ctx), ctx, "Dashboard");
  const add = mdLink("/deals/new", ctx, "Add Deal");
  return `${partnerPrefix(ctx, "import or re-apply a rent roll")}**Rent roll — Import vs Re-apply**

**Re-apply** reads a workbook **already in Vault**. **Import** replaces from a **new** file.

1. Gold nav **Properties** — ${dest}. (Same buttons also sit on ${vault} and on ${dash} when units are 0.)
2. If the rent roll is already vaulted — including Kind **Other** when the filename has \`RR\`, rent roll, or lease charges — click **Re-apply rent roll** (or **Apply / Re-apply rent roll** when unit count is 0). That is a full replace of Unit rows. Do **not** re-upload unless you have a new file.
3. New file: on the property page use **Replace rent-roll CSV / XLSX**, check **Replace existing rows (cannot undo)**. Keep the workbook as XLSX when it already maps. Or drop it on ${add}, or ${vault} **Upload** with Kind **Rent roll** (filenames with RR / lease charges store as Rent roll even if Kind was left on Other).
4. A gold banner should say we **detected** the dialect (Yardi Lease Charges, redIQ, broker/Yardi-MRI flat, or RCP template) and **normalized** it. The done line must match the workbook — **Rent roll — N units written**. Never invent units. Failures say **could not map columns** plus **Detected headers**.
5. Downloads on the property page: **Download canonical XLSX** and **Download original workbook**.`;
}

function downloadCopy(ctx: ExpertClientContext): string {
  const dest = mdLink(
    ctx.entityCode.startsWith("SPE-") ? `/properties/${ctx.entityCode}` : "/properties",
    ctx,
    "Properties",
  );
  const vault = mdLink("/vault", ctx, "Vault");
  return `**Download the canonical XLSX or the original workbook**

1. Gold nav **Properties** — ${dest} — open this SPE.
2. **Download canonical XLSX** is the normalized template (Canonical / Charge Detail / Meta / Original sheets).
3. **Download original workbook** is the bytes you uploaded, unchanged.
4. On ${vault}, each row also has **Download**.

If those links are missing, the SPE has no vaulted rent roll yet — Import or Re-apply first.`;
}

function deleteCopy(ctx: ExpertClientContext): string {
  const list = mdLink("/deals", ctx, "Deals");
  const archive = mdLink("/archive", ctx, "Deal Archive");
  const vault = mdLink("/vault", ctx, "Vault");
  return `${partnerPrefix(ctx, "Delete or Restore a deal")}**Delete a deal** is a **soft-archive**, not a hard wipe.

1. Gold nav **Deals** — ${list}. On the live SPE row click **Delete**. (Same **Delete** on that SPE’s ${vault} — that is the deal, not a file.)
2. Two-step confirm: read the impact (leaves live Deals and the OpCo combined roll-up; books, ledgers, and vault stay studyable), then **type the SPE code**.
3. Find it on gold nav **Deal Archive** — ${archive}. There is no Archive tab under Deals.
4. From Deal Archive: **Study vault** / **Study books**, then **Restore** with the same two-step (impact + type the SPE code).

Permanent demo SPEs (\`SPE-WBG\`, \`SPE-CVC\`, \`SPE-HCR\`) cannot be deleted. Removing a **vault document** is not deleting the deal. Partners cannot Delete or Restore.`;
}

function restoreCopy(ctx: ExpertClientContext): string {
  const archive = mdLink("/archive", ctx, "Deal Archive");
  const list = mdLink("/deals", ctx, "Deals");
  return `${partnerPrefix(ctx, "Restore a deal")}**Restore** lives on gold nav **Deal Archive** — ${archive} — not a tab under Deals.

1. Open **Deal Archive**. Live SPEs stay on ${list}.
2. On the archived SPE click **Restore**.
3. Two-step confirm: read the impact, then **type the SPE code**. The SPE returns to live Deals and the OpCo roll-up.

Books and vault were never wiped. Partners cannot Restore — \`/archive\` redirects home.`;
}

function vaultUploadCopy(ctx: ExpertClientContext): string {
  const vault = mdLink("/vault", ctx, "Vault");
  return `${partnerPrefix(ctx, "store a vault file")}Gold nav **Vault** — ${vault} — is the entity document store.

1. Set the header **Entity** to the SPE (or OpCo) that owns the file.
2. **Upload**: Title, **Kind** (Lease, Loan, K-1 / capital packet, Draw / funding, Insurance, Rent roll, Budget, OM / CIM, Other), Notes, File → **Store in vault**.
3. OM / offering-memo filenames store as **OM / CIM**. Filenames with RR, rent roll, or lease charges store as **Rent roll** even if Kind was left on Other. T12 / P&L workbooks store as **Other** — there is no T12 kind.
4. Files over ~3.5 MB on Vercel need Blob. Max **32 MB** each.

You can **Download** a row. Removing a vault file is not deleting the SPE. **Delete** on a live SPE’s Vault is the deal soft-archive.`;
}

function screensMapCopy(ctx: ExpertClientContext): string {
  return `Use the **gold nav** names that exist. I will not invent a screen.

- **Dashboard** — ${mdLink("/dashboard", ctx, "Dashboard")} — KPI tiles for this SPE or the OpCo roll-up.
- **Deals** — ${mdLink("/deals", ctx, "Deals")} — live SPEs and **Add Deal**. Delete on a row is a soft-archive.
- **Deal Archive** — ${mdLink("/archive", ctx, "Deal Archive")} — deleted SPEs for study and **Restore**. Not a tab under Deals.
- **Properties** — ${mdLink("/properties", ctx, "Properties")} — SPE list, rent roll / unit master, Import, Re-apply, canonical downloads.
- **Vault** — ${mdLink("/vault", ctx, "Vault")} — document store (OM, rent roll, T12, loan). Upload with Kind. Not a bank or PMS feed.
- **Operating Statement** — ${mdLink("/reports/operating-statement", ctx, "Operating Statement")} — NOI bridge; SPE **Replace monthly budget CSV** is CoA rows, not the T12 mapper.
- **Narratives** — ${mdLink("/narratives", ctx, "Narratives")} — audience tones and pack PDF / PPTX. **Not** where you upload a T12 or rent roll.

Header **Entity** and **Period** sit in the navy bar. Deep links keep \`?entity=\` and \`?period=\`.`;
}

function addDealCopy(ctx: ExpertClientContext): string {
  const start = mdLink("/deals/new", ctx, "Add Deal");
  const list = mdLink("/deals", ctx, "Deals");
  const vault = mdLink("/vault", ctx, "Vault");
  const props = mdLink("/properties", ctx, "Properties");
  return `${partnerPrefix(ctx, "run Add Deal")}**Add Deal is upload-first**

1. Gold nav **Deals** — ${list} → **Add Deal** — ${start}.
2. Drop OM / rent-roll / T12 files on **Upload files**. Files go **one at a time**, max **32 MB** each. **XLSX is first-class.** Naming the SPE is optional — filenames infer Life at Harrington Park → \`SPE-HRP\`. On Vercel, files over ~3.5 MB need \`BLOB_READ_WRITE_TOKEN\`.
3. Rent-roll XLSX writes Unit rows. Confirm replace if units already exist. T12 / P&L maps a broker overlay (budget + labeled journals). Files also land in ${vault}.
4. Then open ${props} and Dashboard for the new \`SPE-xxx\`. Occupancy comes from the rent roll, not GL 4020.

RCP mailbox address is **not decided yet**. **Scan RCP inbox** is an honest no-op until it exists.`;
}

function narrativesCopy(ctx: ExpertClientContext): string {
  return `Gold nav **Narratives** — ${mdLink("/narratives", ctx, "Narratives")} — five audience tones (LP / GP / IC / Lender / Mgmt) from the **same** period snapshot.

Export PDF / PPTX from the matching pack (cover → KPI strip → thesis → visuals → risks → appendix). Soft-archived SPEs stay out of live packs.

This is **not** where you re-upload a T12 or re-apply a rent roll. Those are **Vault** / **Add Deal** / **Properties**. Scheduler writes pack files; it does not email.`;
}

function partnerCopy(): string {
  return `**Partner / viewer** links are read-only: dashboards, narratives, packs, and this coach.

You cannot Add Deal, Vault upload, Import / Re-apply, Delete, or Restore. **Deal Archive** redirects home (403 on the APIs).

Unlock writes at **/unlock** with \`PRINCIPAL_PASSWORD\`, or \`/?unlock=\`. Share an LP link with \`/?share=\` plus the partner token. This is not multi-tenant auth.`;
}

const COPY: Record<HowToTopic, (ctx: ExpertClientContext) => string> = {
  reupload_t12: t12Copy,
  t12_incomplete_metric: t12MetricCopy,
  reapply_rent_roll: rentRollCopy,
  download_canonical: downloadCopy,
  delete_deal: deleteCopy,
  restore_deal: restoreCopy,
  vault_upload: vaultUploadCopy,
  screens_map: screensMapCopy,
  add_deal: addDealCopy,
  narratives_packs: narrativesCopy,
  partner_limits: partnerCopy,
};

export function howToAnswer(topic: HowToTopic, ctx: ExpertClientContext): string {
  return COPY[topic](ctx);
}

export function howToAnswerForQuery(userText: string, ctx: ExpertClientContext): string | null {
  const topic = matchHowTo(userText);
  return topic ? howToAnswer(topic, ctx) : null;
}

export function howToActions(topic: HowToTopic, ctx: ExpertClientContext): ExpertSuggestedAction[] {
  const viewer = ctx.accessRole === "viewer";
  const nav = (id: string, label: string, path: string): ExpertSuggestedAction => ({
    id,
    kind: "navigate",
    label,
    href: path.startsWith("/") ? href(path, ctx) : path,
  });
  switch (topic) {
    case "reupload_t12":
      return viewer
        ? [nav("act_vault", "Open Vault", "/vault"), nav("act_os", "Open Operating Statement", "/reports/operating-statement")]
        : [nav("act_vault", "Open Vault", "/vault"), nav("act_add_deal", "Open Add Deal", "/deals/new")];
    case "t12_incomplete_metric":
      return [
        nav("act_os", "Open Operating Statement", "/reports/operating-statement"),
        nav("act_vault", "Open Vault", "/vault"),
      ];
    case "reapply_rent_roll":
      return [
        nav("act_properties", "Open Properties", ctx.entityCode.startsWith("SPE-") ? `/properties/${ctx.entityCode}` : "/properties"),
        nav("act_vault", "Open Vault", "/vault"),
      ];
    case "download_canonical":
      return [
        nav("act_properties", "Open Properties", ctx.entityCode.startsWith("SPE-") ? `/properties/${ctx.entityCode}` : "/properties"),
        nav("act_vault", "Open Vault", "/vault"),
      ];
    case "delete_deal":
      return viewer
        ? [nav("act_deals", "Open Deals", "/deals")]
        : [nav("act_deals", "Open Deals", "/deals"), nav("act_archive", "Open Deal Archive", "/archive")];
    case "restore_deal":
      return viewer
        ? [nav("act_deals", "Open Deals", "/deals")]
        : [nav("act_archive", "Open Deal Archive", "/archive"), nav("act_deals", "Open Deals", "/deals")];
    case "vault_upload":
    case "screens_map":
      return [nav("act_vault", "Open Vault", "/vault"), nav("act_deals", "Open Deals", "/deals")];
    case "add_deal":
      return viewer
        ? [nav("act_deals", "Open Deals", "/deals")]
        : [nav("act_add_deal", "Open Add Deal", "/deals/new"), nav("act_vault", "Open Vault", "/vault")];
    case "narratives_packs":
      return [
        nav("act_narratives", "Open Narratives", "/narratives"),
        nav("act_lp_pack", "Open Monthly Investor Pack", "/narratives/packs/monthly_investor"),
      ];
    case "partner_limits":
      return [nav("act_dash", "Open Dashboard", dashboardPath(ctx))];
    default:
      return [];
  }
}

export function howToChips(topic: HowToTopic): ExpertChip[] {
  switch (topic) {
    case "reupload_t12":
      return [
        {
          id: "t12_vault",
          label: "Walk Vault upload",
          prompt: "How do I reupload the T12 for this SPE? Vault Kind and Add Deal drop. Do not talk about pack PDF or LP narrative.",
        },
      ];
    case "reapply_rent_roll":
      return [
        {
          id: "rr_reapply",
          label: "Walk Re-apply",
          prompt: "How do I re-apply the rent roll from Vault, including Kind Other *RR* files? Import vs Re-apply.",
        },
      ];
    case "delete_deal":
    case "restore_deal":
      return [
        {
          id: "deals_list",
          label: "Open Deals list",
          prompt: "Show me the Delete click path on Deals. Then where the SPE goes on Deal Archive.",
        },
        {
          id: "deal_archive",
          label: "Open Deal Archive",
          prompt: "Where is Deal Archive, and how do I Restore a deleted SPE?",
        },
      ];
    default:
      return [];
  }
}

export function lookupHowToPlaybook(topicQuery?: string): {
  topic: HowToTopic | null;
  titles: { id: HowToTopic; title: string }[];
  note: string;
} {
  const titles: { id: HowToTopic; title: string }[] = [
    { id: "reupload_t12", title: "Re-upload / replace T12 or P&L workbook (Vault + Add Deal)" },
    { id: "t12_incomplete_metric", title: "T12 incomplete 2/12 is posted book months, not pack export" },
    { id: "reapply_rent_roll", title: "Re-apply vs Import rent roll (Vault Kind Other *RR*)" },
    { id: "download_canonical", title: "Download canonical XLSX / original workbook" },
    { id: "delete_deal", title: "Delete deal (soft-archive) + Deal Archive + Restore" },
    { id: "restore_deal", title: "Restore from Deal Archive (two-step SPE code)" },
    { id: "vault_upload", title: "Vault upload with Kind" },
    { id: "screens_map", title: "Vault vs Deals vs Properties vs Dashboard vs Narratives" },
    { id: "add_deal", title: "Add Deal upload-first" },
    { id: "narratives_packs", title: "Narratives / pack PDF PPTX — not file ingest" },
    { id: "partner_limits", title: "Partner vs Principal limits" },
  ];
  const topic = topicQuery?.trim() ? matchHowTo(topicQuery) : null;
  return {
    topic,
    titles,
    note: "How-to answers use these click paths. Current page (including Monthly Investor Pack) does not override them.",
  };
}

/** Compact rules injected into the live Grok system prompt. */
export const HOW_TO_SYSTEM_SECTION = `## How-to / navigation (authoritative — beats current page)
Users do **not** have S2. You are the expert on RCP **click paths**. If they ask how to do a job, answer that job first with a **numbered gold-nav path**. Do **not** answer from the current pack / narrative page unless they asked about packs.

**Never invent screens.** Real gold nav: Dashboard, Ratios, Narratives, Overview, Operating Statement, Deals, Deal Archive, Properties, Debt, CapEx, Close, Tax, Vault, Scheduler, 1099, Trial Balance, Income Statement, Balance Sheet, Cash Flow. Header: **Entity** and **Period**. Call \`getHowToPlaybook\` when unsure.

Distinguish two different “T12”s:
- **T12 / P&L workbook** (file) → Vault / Add Deal. Not pack PDF.
- **T12 incomplete 2/12** (metric) → posted book months. Generating PDF/PPTX does not fix it. Replacing the workbook does not invent 12 posted months.

### Re-upload / replace T12 (and P&L)
1. Gold nav **Vault** (header Entity = this SPE) → **Upload** → **Kind** (no T12 kind; store as **Other**, or **Budget** if they want that tag) → File → **Store in vault**.
2. To map overlay, not only store: **Deals** → **Add Deal** → drop the XLSX on **Upload files**. \`T12_\` / T-12 / P&L filenames classify as **T12 / P&L workbook**. Auto-ingest reuses the SPE.
3. After map: monthly budget lines (broker T12 overlay) + labeled overlay journals. Failures: **could not map columns** + **Detected headers**. No separate mapper screen.
4. **Properties** has rent-roll import, not T12 drop. Operating Statement **Replace monthly budget CSV** is CoA budget, not the T12 mapper.

### Re-apply rent roll
**Re-apply** = vaulted file (Kind **Other** counts when filename is \`*RR*\` / lease charges). **Import** = new file on Properties **Replace rent-roll CSV / XLSX** (check replace) or Add Deal / Vault Kind **Rent roll**.
Buttons: **Re-apply rent roll** or **Apply / Re-apply rent roll** on Properties, Vault, Dashboard (0 units). Dialect banner: detected format and normalized. Unit count must match the workbook. Downloads: **Download canonical XLSX**, **Download original workbook**.

### Delete deal + Restore
**Delete** on live **Deals** row or that SPE’s **Vault** = soft-archive (two-step: impact, then type SPE code). Gold nav **Deal Archive** (\`/archive\`) — **not** a tab under Deals. **Restore** from Deal Archive, same two-step. Demo \`SPE-WBG\`, \`SPE-CVC\`, \`SPE-HCR\` cannot be deleted. Removing a vault **file** is not deleting the deal.

### Screen map
Vault = documents. Deals = live SPEs + Add Deal. Deal Archive = deleted SPEs. Properties = rent roll / units. Dashboard = KPI tiles. Narratives = tones + pack export — **not** ingest.

### Partner vs Principal
Partner / viewer: dashboards, narratives, packs, this coach. No Add Deal, Vault upload, Import/Re-apply, Delete, Restore. Unlock at /unlock. When accessRole is unset, treat as Principal.

### Chips
For T12/rent-roll/delete how-tos, \`proposeSuggestedActions\` must deep-link **Vault**, **Properties**, **Add Deal**, **Deals**, or **Deal Archive** — never Monthly Investor Pack / LP narrative chips unless they asked about packs.
`;
