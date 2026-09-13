import { describePage, listNavTargets, withContext } from "./nav";
import { formatContextChip } from "./period";
import type {
  AnomalyFlag,
  CompletenessItem,
  DataCompleteness,
  EntitySummary,
  ExpertChip,
  ExpertClientContext,
  ExpertMessage,
  KpiSnapshot,
  PeriodStatusView,
} from "./types";

export type OfflineBundle = {
  entity: EntitySummary | { ok: false; error: string };
  period: PeriodStatusView | { ok: false; error: string };
  completeness: DataCompleteness | { ok: false; error: string };
  anomalies: { entityCode: string; periodLabel: string; flags: AnomalyFlag[] } | { ok: false; error: string };
  kpis: KpiSnapshot | { ok: false; error: string };
};

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

function rankChips(ctx: ExpertClientContext, bundle: OfflineBundle): ExpertChip[] {
  const chips: ExpertChip[] = [];
  const flags = !isErr(bundle.anomalies) ? bundle.anomalies.flags : [];
  const complete = !isErr(bundle.completeness) ? bundle.completeness : null;
  const lead = blockers(flags)[0] ?? flags.find((f) => f.severity === "watch");
  if (lead) {
    chips.push({
      id: "lead_flag",
      label: lead.title.length > 28 ? "Review flagged issue" : lead.title,
      prompt: `What's wrong: ${lead.title}. Walk me through the click path and what to verify.`,
    });
  }
  const gap = complete ? missingItems(complete.items)[0] : null;
  if (gap && !chips.some((c) => c.prompt.includes(gap.label))) {
    chips.push({
      id: "fill_gap",
      label: gap.status === "partial" ? `Finish ${gap.label}` : `Fill ${gap.label}`,
      prompt: `Help me complete: ${gap.label}. Where do I enter it?`,
    });
  }
  const page = ctx.pathname;
  const extras: ExpertChip[] = [
    {
      id: "audit_page",
      label: "What's wrong on this page?",
      prompt: "What's wrong on this page? Audit the current screen with live completeness and anomalies.",
    },
    {
      id: "checklist",
      label: "Month-end checklist",
      prompt: "Start checklist mode for month-end close. Sequence the work for this entity and period.",
    },
    {
      id: "noi",
      label: "Check NOI bridge",
      prompt: "Walk me through the NOI bridge and whether AM fees sit below NOI.",
    },
    {
      id: "dscr",
      label: "Review DSCR",
      prompt: "Review DSCR and debt yield against the loan-file thresholds. Do not invent LTV.",
    },
    {
      id: "lp",
      label: "Prepare LP pack",
      prompt: "Prepare the Monthly Investor Pack. What inputs are required and where do I export PDF/PPTX?",
    },
    {
      id: "lender",
      label: "Prepare lender pack",
      prompt: "Prepare the Quarterly Lender Pack. Call out covenants, reserves, and gated LTV.",
    },
  ];
  if (page.startsWith("/close")) {
    extras.unshift(extras.find((e) => e.id === "checklist")!);
  }
  if (page.startsWith("/debt") || page.startsWith("/dashboard")) {
    extras.unshift(extras.find((e) => e.id === "dscr")!);
  }
  for (const extra of extras) {
    if (chips.length >= 3) break;
    if (!chips.some((c) => c.id === extra.id)) chips.push(extra);
  }
  return chips.slice(0, 3);
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

function leadFlags(flags: AnomalyFlag[], ctx: ExpertClientContext): string {
  const top = [...blockers(flags), ...flags.filter((f) => f.severity === "watch")].slice(0, 3);
  if (!top.length) return "";
  const lines = top.map((flag, i) => {
    const dest = withContext(flag.href.split("?")[0] || flag.href, ctx.entityCode, ctx.periodLabel, ctx.view);
    return `${i + 1}. **${flag.title}** — ${flag.detail} (${flag.source}) [${flag.title}](${dest.startsWith("/") ? dest : flag.href})`;
  });
  return `\n\nLeading items from the live books:\n${lines.join("\n")}`;
}

export function buildOpener(ctx: ExpertClientContext, bundle: OfflineBundle): ExpertMessage {
  const complete = isErr(bundle.completeness) ? null : bundle.completeness;
  const flags = isErr(bundle.anomalies) ? [] : bundle.anomalies.flags;
  const score = complete ? ` Data completeness is **${complete.score}/100** (${complete.ready}/${complete.applicable} ready).` : "";
  const greet =
    ctx.entityCode === "SPE-WBG"
      ? "Willow Bend is the value-add garden — we will stay on the books, not on guesses."
      : "I will stay on the live books and this product’s screens.";
  const content = `${greet} ${whereTheyAre(ctx, bundle)}${score}${leadFlags(flags, ctx)}

Three useful next moves are on the chips below. I can also run checklist mode, audit this page, or sequence a lender / LP pack. Tax surfaces are CPA-export only — this system does not file.`;
  return {
    id: newId(),
    role: "expert",
    content,
    chips: rankChips(ctx, bundle),
    sources: ["From live Expert context tools"],
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

function completenessCopy(ctx: ExpertClientContext, bundle: OfflineBundle): string {
  if (isErr(bundle.completeness)) return `I cannot score completeness: ${bundle.completeness.error}.`;
  const c = bundle.completeness;
  const rows = c.items
    .filter((item) => item.status !== "na")
    .map((item) => `- **${item.label}** — ${item.status}. ${item.detail} (${item.source}) [${item.label}](${item.href})`)
    .join("\n");
  return `**Data completeness ${c.score}/100** for ${formatContextChip(c.entityCode, c.periodLabel)} (${c.ready}/${c.applicable} ready).

${rows}

Missing rows are entered on the linked screen — I will not invent balances to fill them.`;
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
  return `**Live KPIs** from ${dash} (${k.viewLabel}) for ${formatContextChip(k.entityCode, k.periodLabel)}:

${rows || "No matching tiles. Open the dashboard and pick a ratio tile for drill-down."}

${k.notes.join("\n")}

Click a tile → ${link("/dashboard/ratios", ctx, "ratio drill-down")} for the formula. LTV and delinquency stay gated.`;
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
  if (/tour|this page|controls|lost|where am i/.test(q) && !/wrong/.test(q)) {
    content = tour(ctx);
  } else if (/check ?list|month-end|month end|close books|soft close|hard lock/.test(q)) {
    content = checklistMode(ctx, bundle);
  } else if (/wrong on this page|audit/.test(q) || (q.includes("wrong") && q.includes("page"))) {
    content = pageAudit(ctx, bundle);
  } else if (/completeness|missing data|score/.test(q)) {
    content = completenessCopy(ctx, bundle);
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
  } else if (/navigat|where is|how do i get|click path|menu/.test(q)) {
    content = navHelp(q, ctx);
  } else if (/noi|bridge|kpi|ratio/.test(q)) {
    content = kpiCopy(ctx, bundle, q);
  } else {
    content = `${buildOpener(ctx, bundle).content}

You asked: “${userText.trim()}”

I can only answer from live tools and this product’s screens. ${completenessCopy(ctx, bundle)}

${anomaliesCopy(ctx, bundle)}`;
  }
  return {
    id: newId(),
    role: "expert",
    content,
    chips: rankChips(ctx, bundle),
    sources: ["From live Expert tools (offline coach)"],
    createdAt: new Date().toISOString(),
  };
}
