import { composeExpertChrome, pageProcessLead, rankChips, rankSuggestedActions } from "./actions";
import { isClearHowToQuery, isDeleteDealQuery, isVagueQuery } from "./feature-intents";
import { describePage, listNavTargets, withContext } from "./nav";
import { formatContextChip } from "./period";
import type {
  AnomalyFlag,
  CompletenessItem,
  ExpertClientContext,
  ExpertMessage,
  OfflineBundle,
} from "./types";

export type { OfflineBundle };

function isErr(value: unknown): value is { ok: false; error: string } {
  return Boolean(value && typeof value === "object" && "ok" in value && (value as { ok: unknown }).ok === false);
}

function newId(): string {
  return `exp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function link(path: string, ctx: ExpertClientContext, label?: string): string {
  const href = withContext(path, ctx.entityCode, ctx.periodLabel, ctx.view);
  return `[${label ?? path}](${href})`;
}

function blockers(flags: AnomalyFlag[]): AnomalyFlag[] {
  return flags.filter((f) => f.severity === "blocker");
}

function missingItems(items: CompletenessItem[]): CompletenessItem[] {
  return items.filter((item) => item.status === "missing" || item.status === "partial");
}

function coachChrome(
  ctx: ExpertClientContext,
  bundle: OfflineBundle,
  userText = "",
): Pick<ExpertMessage, "chips" | "actions"> {
  return composeExpertChrome(rankSuggestedActions(ctx, bundle, userText), rankChips(ctx, bundle, userText));
}

function whereTheyAre(ctx: ExpertClientContext, bundle: OfflineBundle): string {
  const page = describePage(ctx.pathname);
  const entity = isErr(bundle.entity) ? ctx.entityCode : `${bundle.entity.name} (${bundle.entity.code})`;
  const type = isErr(bundle.entity) ? "" : ` · ${bundle.entity.type}`;
  const period = isErr(bundle.period)
    ? ctx.periodLabel
    : `${bundle.period.periodLabel} (${bundle.period.statusLabel.toLowerCase()})`;
  const view = ctx.view === "combined" ? " Combined roll-up — not a GAAP consolidation." : "";
  return `You are on **${page.title}** looking at **${entity}**${type}, period **${period}**.${view}`;
}

function pageRelevantBlocker(flags: AnomalyFlag[], ctx: ExpertClientContext): AnomalyFlag | null {
  const path = ctx.pathname;
  const hits = blockers(flags).filter((flag) => {
    const hay = `${flag.id} ${flag.title} ${flag.href}`.toLowerCase();
    if (path === "/") return /tb_|bs_|cf_|ic_fail|draft|no_period|statement/.test(flag.id);
    if (path.startsWith("/debt")) return /dscr|debt|yield|maturity/.test(hay);
    if (path.startsWith("/properties")) return /unit|occupancy|rent/.test(hay);
    if (path.startsWith("/close")) return /check|period|lock|ic|journal|tb_|bs_|cf_|draft/.test(hay);
    if (path.startsWith("/tax")) return /tax/.test(hay);
    if (path.startsWith("/reports/trial")) return /tb_|journal|draft|balance/.test(hay);
    if (path.includes("operating")) return /noi|variance/.test(hay);
    if (path.startsWith("/dashboard")) return /tb_|bs_|cf_|ic_fail|draft|no_period|dscr|debt_yield|watch_/.test(flag.id);
    return /tb_|bs_|cf_|ic_fail|draft|no_period|statement/.test(flag.id);
  });
  return hits[0] ?? null;
}

function greetFor(ctx: ExpertClientContext): string {
  if (ctx.entityCode === "SPE-WBG") return "I'm with you on Willow Bend.";
  if (ctx.entityCode === "RCP-OPCO") return "I'm with you on the OpCo roll-up.";
  if (/hrp|harrington/i.test(ctx.entityCode)) return "I'm with you on Harrington.";
  return "I'm right here with you.";
}

export function buildOpener(ctx: ExpertClientContext, bundle: OfflineBundle): ExpertMessage {
  const flags = isErr(bundle.anomalies) ? [] : bundle.anomalies.flags;
  const blocker = pageRelevantBlocker(flags, ctx);
  const next = blocker
    ? `One blocker on this page: **${blocker.title}**. Open [${blocker.title}](${blocker.href}) when you want to unwind it.`
    : pageProcessLead(ctx);
  const partner =
    ctx.accessRole === "viewer"
      ? " You are in **partner view** — dashboards and packs only. I will not send you to Add Deal."
      : "";
  const content = `${greetFor(ctx)} ${whereTheyAre(ctx, bundle)} ${next}${partner}`;
  return {
    id: newId(),
    role: "expert",
    content,
    ...coachChrome(ctx, bundle),
    sources: ["From live Expert context tools"],
    mode: "offline",
    createdAt: new Date().toISOString(),
  };
}

function tour(ctx: ExpertClientContext): string {
  const page = describePage(ctx.pathname);
  const hints = page.hints.map((h, i) => `${i + 1}. ${h}`).join("\n");
  return `**Guided tour — ${page.title}** (${formatContextChip(ctx.entityCode, ctx.periodLabel)})

Header controls: **Entity** and **Period** sit in the navy bar (demo periods 2026-07 and 2026-08). On OpCo, **Combined roll-up** stacks wholly owned SPEs and eliminates IC 1310/2310 and AM 6310/7010 — it is not a GAAP consolidation.

${hints}

Left nav is the gold/navy strip under the wordmark. I will not invent a menu item that is not in this app.`;
}

function checklistMode(ctx: ExpertClientContext, bundle: OfflineBundle): string {
  const period = isErr(bundle.period) ? null : bundle.period;
  const close = link("/close", ctx, "Period Close");
  const os = link("/reports/operating-statement", ctx, "Operating Statement");
  const rr = link(ctx.entityCode.startsWith("SPE-") ? `/properties/${ctx.entityCode}` : "/properties", ctx, "Rent roll");
  const debt = link("/debt", ctx, "Debt");
  const capex = link("/capex", ctx, "CapEx");
  const dash = link(ctx.entityCode.startsWith("SPE-") || ctx.entityCode === "RCP-OPCO" ? `/dashboard/${ctx.entityCode}` : "/dashboard", ctx, "Dashboard");
  const tax = link("/tax", ctx, "Tax bridge");
  const open = period?.openItems?.length
    ? period.openItems.map((item) => `- ${item.label} (${item.status})`).join("\n")
    : period?.checklistTotal
      ? "Checklist items are DONE / N/A."
      : "Checklist has not been started.";
  return `**Checklist mode — month-end ${formatContextChip(ctx.entityCode, ctx.periodLabel)}**

Period status: **${period?.statusLabel ?? "unknown"}**. ${open}

Work the sequence — do not skip to packs if the books do not foot:

1. Confirm journals posted — ${link("/reports/trial-balance", ctx, "Trial Balance")} (debits = credits).
2. Confirm rent roll / units — ${rr}. Occupancy is not derived from GL 4020.
3. Review budget vs actual — ${os}. AM fees sit **below NOI**.
4. Debt service vs loan file — ${debt}. Use loan-file DSCR / debt yield thresholds only. LTV stays gated.
5. CapEx vs R&M and CIP 1460 — ${capex}.
6. Soft close → controller checklist → hard lock — ${close}. Reopen needs a reason **and** ticket.
7. KPI review — ${dash}.
8. Narratives / packs when the snapshot is honest.
9. CPA-only tax bridge — ${tax}. This system does **not** file taxes.

Demo reminder: SPE-WBG 2026-07 is hard locked; 2026-08 stays open.`;
}

const NAMED_ASSETS: { match: RegExp; code: string; name: string }[] = [
  { match: /harrington|spe-hrp|\bhrp\b/, code: "SPE-HRP", name: "Harrington" },
  { match: /willow|spe-wbg|\bwbg\b/, code: "SPE-WBG", name: "Willow Bend" },
  { match: /canyon|spe-cvc|\bcvc\b/, code: "SPE-CVC", name: "Canyon View" },
  { match: /harbor|spe-hcr|\bhcr\b/, code: "SPE-HCR", name: "Harbor Court" },
];

function mentionedAsset(text: string): { code: string; name: string } | null {
  const q = text.toLowerCase();
  return NAMED_ASSETS.find((row) => row.match.test(q)) ?? null;
}

function itemMatchesAsset(item: CompletenessItem, asset: { code: string; name: string }): boolean {
  const hay = `${item.id} ${item.label} ${item.href} ${item.detail}`.toLowerCase();
  return hay.includes(asset.code.toLowerCase()) || hay.includes(asset.name.toLowerCase());
}

function completenessCopy(ctx: ExpertClientContext, bundle: OfflineBundle, userText = ""): string {
  if (isErr(bundle.completeness)) {
    const named = mentionedAsset(userText);
    if (named) {
      return `I cannot score **${named.name}** yet: ${bundle.completeness.error}. Open Properties or the dashboard for \`${named.code}\` — I will not invent gaps.`;
    }
    return `I cannot score completeness: ${bundle.completeness.error}.`;
  }
  const c = bundle.completeness;
  const named = mentionedAsset(userText);
  const gaps = c.items.filter((item) => item.status === "missing" || item.status === "partial");
  const focused = named ? gaps.filter((item) => itemMatchesAsset(item, named)) : gaps;
  if (named && !focused.length) {
    return `Nothing in the live completeness list is tagged to **${named.name}** (\`${named.code}\`) for ${formatContextChip(c.entityCode, c.periodLabel)}. I will not invent Harrington units or other SPE gaps. Open [${named.name} dashboard](/dashboard/${named.code}?entity=${named.code}&period=${ctx.periodLabel}) if you want to switch onto that SPE.`;
  }
  const rows = focused
    .map((item) => `- **${item.label}** — ${item.status}. ${item.detail} [${item.label}](${item.href})`)
    .join("\n");
  const who = named ? ` for **${named.name}**` : ` for ${formatContextChip(c.entityCode, c.periodLabel)}`;
  const next = focused[0]
    ? `Open **${focused[0].label}** next.`
    : "Nothing looks missing on this completeness pass.";
  return `${named ? `${named.name} gaps` : "What's missing"}${who}: ${focused.length} open item(s) (score ${c.score}/100).

${rows || "No missing or partial rows."}

${next} I will not invent balances to fill them.`;
}

function anomaliesCopy(ctx: ExpertClientContext, bundle: OfflineBundle): string {
  if (isErr(bundle.anomalies)) return `I cannot read anomalies: ${bundle.anomalies.error}.`;
  const flags = bundle.anomalies.flags;
  if (!flags.length) {
    return `No rule-based flags for ${formatContextChip(ctx.entityCode, ctx.periodLabel)}. That is not a clean-bill certificate — LTV and delinquency stay gated, and T12 is only as complete as the books.`;
  }
  return `**Live flags** for ${formatContextChip(ctx.entityCode, ctx.periodLabel)}:

${flags
  .map((f) => `- **${f.severity.toUpperCase()} · ${f.title}** — ${f.detail} (${f.source}) [Open](${f.href})`)
  .join("\n")}

Thresholds come from the loan file or a labeled coaching heuristic. I will not invent covenants.`;
}

function pageAudit(ctx: ExpertClientContext, bundle: OfflineBundle): string {
  const page = describePage(ctx.pathname);
  const flags = isErr(bundle.anomalies) ? [] : bundle.anomalies.flags;
  const items = isErr(bundle.completeness) ? [] : missingItems(bundle.completeness.items);
  const relevant = flags.filter((flag) => {
    const path = ctx.pathname;
    if (path.startsWith("/debt")) return /dscr|debt|maturity|ltv/i.test(flag.id);
    if (path.startsWith("/properties")) return /unit|occupancy|rent/i.test(flag.id);
    if (path.startsWith("/close")) return /check|period|lock|ic|journal/i.test(flag.id);
    if (path.startsWith("/tax")) return /tax/i.test(flag.id);
    if (path.startsWith("/vault")) return /vault/i.test(flag.id);
    if (path.includes("operating")) return /noi|variance/i.test(flag.id);
    if (path.startsWith("/dashboard")) return true;
    return flag.severity !== "info";
  });
  return `**What’s wrong on ${page.title}**

${tour(ctx)}

${relevant.length ? anomaliesCopy(ctx, { ...bundle, anomalies: { entityCode: ctx.entityCode, periodLabel: ctx.periodLabel, flags: relevant } }) : "No page-specific blockers from the live tools. Still review the completeness list."}

${items.length ? completenessCopy(ctx, bundle) : ""}`;
}

function packFlow(kind: "lp" | "lender", ctx: ExpertClientContext, bundle: OfflineBundle): string {
  const dest =
    kind === "lp"
      ? link("/narratives/packs/monthly_investor", ctx, "Monthly Investor Pack")
      : link("/narratives/packs/quarterly_lender", ctx, "Quarterly Lender Pack");
  const audience = kind === "lp" ? "LP / investor" : "lender";
  const extra =
    kind === "lender"
      ? "Lender pack emphasizes DSCR, debt yield, reserves, and the maturity wall. **LTV stays gated** — say that to the lender package rather than inventing a ratio."
      : "Investor pack uses period NOI, CFADS (distributions proxy), occupancy from the rent roll, and the GPR→NOI→BTCF waterfall. AM fees stay below NOI.";
  const gaps = !isErr(bundle.completeness)
    ? missingItems(bundle.completeness.items)
        .slice(0, 4)
        .map((item) => `- ${item.label}: ${item.detail} [Fix](${item.href})`)
        .join("\n")
    : "";
  return `**Prepare ${audience} pack** for ${formatContextChip(ctx.entityCode, ctx.periodLabel)}

1. Confirm books foot (TB / BS / CF) and IC 1310/2310 + AM 6310/7010 match.
2. Confirm rent roll + monthly budget so occupancy and variance are real.
3. Confirm the loan file so DSCR / debt yield use **product thresholds**, not invented covenants.
4. Open ${link("/narratives", ctx, "Narratives")} to read the ${audience} tone from the same snapshot.
5. Export PDF or PPTX from ${dest}.

${extra}

${gaps ? `Finish these inputs first:\n${gaps}` : "Completeness items look populated — still read the flags before you send a pack."}

Scheduled jobs live on ${link("/scheduler", ctx, "Scheduler")} (writes files; does not email).`;
}

function addDealFlow(ctx: ExpertClientContext): string {
  const start = link("/deals/new", ctx, "Add Deal");
  const list = link("/deals", ctx, "Deals");
  const vault = link("/vault", ctx, "Vault");
  const props = link("/properties", ctx, "Properties");
  return `**Add a new deal — upload-first, then open the new SPE**

Do this in the product — click paths only. Drop the broker **XLSX** on Add Deal. Do not make a spreadsheet conversion the default.

1. Gold nav **Deals** → ${list}, or Overview → **Add Deal**. Open ${start}.
2. Drop the OM / rent-roll / T12 files on **Upload files**. Naming the SPE is optional — filenames infer Life at Harrington Park → \`SPE-HRP\`. Files upload **one at a time** (max **32 MB each**). A 5.5 MB OM is valid. On Vercel, files over ~3.5 MB go through **Vercel Blob** so they do not hit HTTP 413. If you see “OM is 5.5 MB — add BLOB_READ_WRITE_TOKEN…”, connect Blob: Vercel → **Storage** → create **Blob** → confirm env **BLOB_READ_WRITE_TOKEN** → redeploy. Or upload the Excel files first and add the OM after Blob is connected.
3. **XLSX rent rolls are first-class.** Broker workbooks (\`RR_-_Harrington_-_…xlsx\`) auto-map redIQ **Rent Roll** R9 (\`UnitID\`, \`OccStatus\`, \`MktRent\`, \`InPlaceRent\`) and Yardi/MRI Resi headers. Auto-ingest creates or reuses the SPE and writes **Unit** rows. The done screen must say **Rent roll — N units written** or fail with detected headers — never silent 0 units.
4. If columns cannot be mapped you will see **could not map columns: … Detected headers: …** — not a silent vault-only success. Ask me with that header list. Do not invent units. Existing SPE-HRP* with 0 units: **Re-apply rent roll** on Properties / Dashboard.
5. After ingest, open ${props} and ${link("/dashboard", ctx, "Dashboard")} for the new \`SPE-xxx\` (header period **2026-08**). Occupancy / loss-to-lease come from the rent roll, not GL 4020.
6. T12 / P&L workbooks map to a **broker T12 overlay** (monthly budget + dashboard strip). Those dollars are **not** posted to the GL. The file also stays in ${vault}. Loan basics stay on Apply if you have them. If units already exist, **confirm replace**. Do not invent LTV.

RCP mailbox address is **not decided yet**. Until \`RCP_INGEST_MAILBOX\` and a connector exist, **Scan RCP inbox** is an honest no-op.

When the SPE exists, ask me for month-end checklist or “What’s missing for this SPE?”`;
}

function rentRollImportCopy(ctx: ExpertClientContext): string {
  const dest = ctx.entityCode.startsWith("SPE-")
    ? link(`/properties/${ctx.entityCode}`, ctx, "this SPE’s rent roll")
    : link("/properties", ctx, "Properties");
  const dash = ctx.entityCode.startsWith("SPE-")
    ? link(`/dashboard/${ctx.entityCode}`, ctx, `Dashboard for ${ctx.entityCode}`)
    : link("/dashboard", ctx, "Dashboard");
  return `**Import a rent roll — XLSX is the primary path**

1. **New SPE:** Add Deal → drop the broker workbook (CSV or **XLSX/XLS**). Upload-first auto-ingest classifies \`RR_\` / “rent roll” files, creates the SPE, and writes Unit rows. Then open ${dash} and ${dest}.
2. **Existing SPE:** **Re-apply rent roll** on ${dest} / Dashboard, or apply from Add Deal on that draft. Keep the workbook as XLSX when it already maps.
3. Canonical columns still work: \`unit_id,floorplan,beds,baths,sqft,status,market_rent,in_place_rent,lease_start,lease_end,concession\`. Broker aliases are mapped automatically (Unit, Unit Type, SF, Occupied/Vacant/Notice, Market Rent, Lease/In-place Rent, lease dates, concession). Title rows above the header are skipped.
4. If mapping fails you get **could not map columns: … Detected headers: …**. The file stays in the vault — I will not invent units.
5. Confirm replace if units already exist. Occupancy is not derived from GL 4020. Password-protected workbooks must be re-saved without a password.

I will not invent a rent roll from the income statement.`;
}

function taxCopy(ctx: ExpertClientContext): string {
  return `**Tax / K-1 — CPA export only**

This product builds a books-to-tax worksheet and a partner capital rollforward. It does **not** file a return, e-file, or produce a signed Form 1065 / K-1.

1. ${link("/tax", ctx, "Tax bridge")} — book NI, 6210 depreciation, 6110 interest, 6310 AM fees vs tax columns. Combined roll-up is **not** a tax consolidation.
2. ${link("/tax/k1", ctx, "K-1 export")} — beg + contrib − dist ± book NI = end. CSV / Excel for the CPA.
3. ${link("/vendors", ctx, "1099 hooks")} — vendor master only. Phase A AP has no invoice subledger.
4. File the CPA packet in ${link("/vault", ctx, "Vault")}.

If a number is missing, it is missing from the GL or the seeded adjustment rows — I will not invent MACRS depreciation.`;
}

function kpiCopy(ctx: ExpertClientContext, bundle: OfflineBundle, topic: string): string {
  if (isErr(bundle.kpis)) return `I cannot read KPIs: ${bundle.kpis.error}.`;
  const k = bundle.kpis;
  if (k.kind === "holdco") {
    return "HoldCo has no operating dashboard. Switch the header entity to **RCP-OPCO** (combined roll-up) or an SPE such as **SPE-WBG**.";
  }
  const wanted = /dscr/.test(topic)
    ? ["dscr", "cfads_dscr", "debt_yield", "upb"]
    : /occup|ltl|lease/.test(topic)
      ? ["physical_occupancy", "loss_to_lease", "economic_occupancy_book", "breakeven_occupancy"]
      : /noi|bridge/.test(topic)
        ? ["noi_period", "egi", "opex_ratio", "budget_variance_noi"]
        : k.tiles.slice(0, 6).map((t) => t.id);
  const rows = k.tiles
    .filter((t) => wanted.includes(t.id))
    .map((t) => `- **${t.id}** ${t.display}${t.gated ? " (gated)" : ""} — ${t.hint}`)
    .join("\n");
  const dash = link(
    k.kind === "opco" ? "/dashboard/RCP-OPCO" : `/dashboard/${k.entityCode}`,
    ctx,
    "Dashboard",
  );
  const notes = k.notes.filter((note) => !/watchlist|covenant|dscr/i.test(note));
  return `**Live KPIs** from ${dash} (${k.viewLabel}) for ${formatContextChip(k.entityCode, k.periodLabel)}:

${rows || "No matching tiles. Open the dashboard and pick a ratio tile for drill-down."}

${notes.join("\n")}

Click a tile → ${link("/dashboard/ratios", ctx, "ratio drill-down")} for the formula.`;
}

function explainNoi(ctx: ExpertClientContext, bundle: OfflineBundle): string {
  const name = isErr(bundle.entity) ? ctx.entityCode : bundle.entity.name;
  const type = isErr(bundle.entity) ? (ctx.entityCode === "RCP-OPCO" ? "OPCO" : "") : bundle.entity.type;
  const tile = !isErr(bundle.kpis)
    ? bundle.kpis.tiles.find((t) => t.id === "noi_period" || t.id.includes("noi"))
    : undefined;
  const figure = tile ? ` The card shows **${tile.display}** for ${ctx.periodLabel}.` : "";
  const os = link("/reports/operating-statement", ctx, "Operating Statement");
  if (type === "OPCO" || ctx.entityCode === "RCP-OPCO") {
    return `On this OpCo card, **NOI** is Net Operating Income — period operating profit after operating expenses, before debt service. AM fees sit **below** NOI, so they are not in this number.${figure}

This is the combined roll-up of the SPE stack after eliminating IC 1310/2310 and AM 6310/7010 — not a GAAP consolidation.

Open the ${os} for the GPR → EGI → NOI bridge, or click the NOI tile for the formula.`;
  }
  return `On this card, **NOI** is Net Operating Income for **${name}** — operating profit after operating expenses, before debt service. AM fees sit **below** NOI.${figure}

Open the ${os} for the bridge, or click the NOI tile for the formula. I will not invent a figure if the books are empty.`;
}

function clarifyCopy(userText: string): string {
  return `I want to stay on your question, and I am not sure what you need yet.

You asked: “${userText.trim()}”

Are you asking about a number on this page, something missing for this entity, or a click path?`;
}

function deleteDealCopy(ctx: ExpertClientContext): string {
  const list = link("/deals", ctx, "Deals");
  const archive = link("/archive", ctx, "Deal Archive");
  const vault = link("/vault", ctx, "Vault");
  return `Click **Delete** on a live ${list} row (or on that SPE’s ${vault} when a deal is selected). Two-step confirm: read the impact, then type the SPE code.

That is a **soft-archive**, not a hard wipe. The SPE leaves live Deals and the OpCo combined roll-up. Books, ledgers, and vault documents stay. Find it under gold nav **Deal Archive** — ${archive} — not a tab under Deals. There is no Archive tab under Deals.

From Deal Archive: study vault or books, then **Restore** with the same two-step confirm.

Permanent demo SPEs (\`SPE-WBG\`, \`SPE-CVC\`, \`SPE-HCR\`) cannot be deleted. Removing a **vault document** is not deleting the deal. Partners cannot Delete or Restore.`;
}

function vaultCopy(ctx: ExpertClientContext): string {
  const vault = link("/vault", ctx, "Vault");
  return `Gold nav **Vault** — ${vault} — is the entity document store (OM, rent roll, loan, lease, insurance). Drop a file there, or send it through **Add Deal** and it is vaulted on ingest.

You can remove a **vault document**. That does not delete the SPE. **Delete** on a live SPE’s Vault (or the Deals row) is the deal action — a soft-archive to gold nav **Deal Archive**. Files over ~3.5 MB on Vercel need \`BLOB_READ_WRITE_TOKEN\`. Not a bank or PMS feed.`;
}

function narrativesCopy(ctx: ExpertClientContext): string {
  return `Gold nav **Narratives** — ${link("/narratives", ctx, "Narratives")} — five audience tones (LP / GP / IC / Lender / Mgmt) from the **same** period snapshot. Pick the audience, then export PDF / PPTX from the matching pack.

It does not invent covenants or LTV. Scheduler (${link("/scheduler", ctx, "Scheduler")}) writes pack files; it does not email.`;
}

function schedulerCopy(ctx: ExpertClientContext): string {
  return `Gold nav **Scheduler** — ${link("/scheduler", ctx, "Scheduler")} — monthly investor and quarterly lender jobs. It **writes pack files**. It does **not** email anyone. Open Narratives if you want to read the tone first.`;
}

function unlockCopy(): string {
  return `Partner / viewer links are read-only. Unlock writes at **/unlock** with \`PRINCIPAL_PASSWORD\`, or \`/?unlock=\`. Share an LP link with \`/?share=\` plus the partner token. This is not multi-tenant auth.`;
}

function featureHowTo(q: string, ctx: ExpertClientContext): string {
  const targets = listNavTargets().filter((t) => {
    const hay = `${t.id.replace(/_/g, " ")} ${t.label} ${t.hint}`.toLowerCase();
    return hay.split(/\s+/).some((word) => word.length > 3 && q.includes(word));
  });
  if (targets[0]) {
    const t = targets[0];
    return `Open **${t.label}** — ${t.hint}. Gold nav or ${link(t.href, ctx, t.label)}. I will not invent a screen that is not in this app.`;
  }
  return `I can walk every real screen in this app. Gold nav: Overview, Dashboard, Deals, Deal Archive, Properties, Debt, CapEx, Close, Tax, Vault, Narratives, Scheduler.

Name the screen or the job (delete a deal, add deal, vault a file, export a pack, close the period) and I will give the click path.`;
}

function navHelp(text: string, ctx: ExpertClientContext): string {
  const q = text.toLowerCase();
  const targets = listNavTargets().filter(
    (t) => q.includes(t.id.replace("_", " ")) || q.includes(t.label.toLowerCase()) || q.includes(t.hint.toLowerCase()),
  );
  const pick = targets.length ? targets : listNavTargets().slice(0, 6);
  return `I will only send you real routes in this app:

${pick.map((t) => `- ${link(t.href, ctx, t.label)} — ${t.hint}`).join("\n")}

Header path: navy bar → **Entity** / **Period** → gold nav labels. Deep links keep \`?entity=${ctx.entityCode}&period=${ctx.periodLabel}\`.`;
}

export function answerOffline(
  userText: string,
  ctx: ExpertClientContext,
  bundle: OfflineBundle,
): ExpertMessage {
  const q = userText.trim().toLowerCase();
  let content: string;
  if (!q || q === "open" || q === "hello" || q === "hi") {
    return buildOpener(ctx, bundle);
  }
  if (isDeleteDealQuery(q)) {
    content = deleteDealCopy(ctx);
  } else if (/tour|this page|controls|lost|where am i/.test(q) && !/wrong/.test(q)) {
    content = tour(ctx);
  } else if (/add (a )?new deal|new deal|add deal|onboard (a )?(deal|spe|property)|new (spe|property)/.test(q)) {
    content = addDealFlow(ctx);
  } else if (/import rent roll|rent-?roll csv|xlsx|map columns|workbook/.test(q)) {
    content = rentRollImportCopy(ctx);
  } else if (/check ?list|month-end|month end|close books|soft close|hard lock/.test(q)) {
    content = checklistMode(ctx, bundle);
  } else if (/wrong on this page|audit/.test(q) || (q.includes("wrong") && q.includes("page"))) {
    content = pageAudit(ctx, bundle);
  } else if (/what does |what is |mean\b|explain /.test(q) && /noi/.test(q)) {
    content = explainNoi(ctx, bundle);
  } else if (/what.?s missing|missing for|missing data|completeness|gaps? for|score/.test(q)) {
    content = completenessCopy(ctx, bundle, userText);
  } else if (/anomal|dscr|debt yield|occupan|variance|what.?s wrong/.test(q)) {
    content = /dscr|debt yield|occupan|noi|bridge/.test(q)
      ? `${kpiCopy(ctx, bundle, q)}\n\n${anomaliesCopy(ctx, bundle)}`
      : anomaliesCopy(ctx, bundle);
  } else if (/lender pack/.test(q)) {
    content = packFlow("lender", ctx, bundle);
  } else if (/lp pack|investor pack|lp narrative/.test(q)) {
    content = packFlow("lp", ctx, bundle);
  } else if (/tax|k-?1|1099|macrs/.test(q)) {
    content = taxCopy(ctx);
  } else if (/vault|document store|file (the )?(om|lease|loan)/.test(q)) {
    content = vaultCopy(ctx);
  } else if (/narrative|audience tone/.test(q)) {
    content = narrativesCopy(ctx);
  } else if (/schedul/.test(q)) {
    content = schedulerCopy(ctx);
  } else if (/unlock|partner view|viewer (link|gate)/.test(q)) {
    content = unlockCopy();
  } else if (/navigat|where is|how do i get|click path|menu/.test(q)) {
    content = navHelp(q, ctx);
  } else if (/noi|bridge|kpi|ratio/.test(q)) {
    content = kpiCopy(ctx, bundle, q);
  } else if (isClearHowToQuery(q)) {
    content = featureHowTo(q, ctx);
  } else if (isVagueQuery(q)) {
    content = clarifyCopy(userText);
  } else {
    content = featureHowTo(q, ctx);
  }
  return {
    id: newId(),
    role: "expert",
    content,
    ...coachChrome(ctx, bundle, userText),
    sources: ["From live Expert tools (offline coach)"],
    mode: "offline",
    createdAt: new Date().toISOString(),
  };
}
