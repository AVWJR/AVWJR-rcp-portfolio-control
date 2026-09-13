import { describePage, withContext } from "./nav";
import type {
  AnomalyFlag,
  CompletenessItem,
  ExpertAccessRole,
  ExpertChip,
  ExpertClientContext,
  ExpertSuggestedAction,
  OfflineBundle,
} from "./types";

function isErr(value: unknown): value is { ok: false; error: string } {
  return Boolean(value && typeof value === "object" && "ok" in value && (value as { ok: unknown }).ok === false);
}

function blockers(flags: AnomalyFlag[]): AnomalyFlag[] {
  return flags.filter((f) => f.severity === "blocker");
}

function missingItems(items: CompletenessItem[]): CompletenessItem[] {
  return items.filter((item) => item.status === "missing" || item.status === "partial");
}

function dest(path: string, ctx: ExpertClientContext): string {
  const base = path.split("?")[0] || path;
  return withContext(base, ctx.entityCode, ctx.periodLabel, ctx.view);
}

function isViewer(role?: ExpertAccessRole): boolean {
  return role === "viewer";
}

export function sanitizeSuggestedActions(raw: unknown): ExpertSuggestedAction[] {
  if (!Array.isArray(raw)) return [];
  const out: ExpertSuggestedAction[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const kind = rec.kind === "navigate" || rec.kind === "intent" || rec.kind === "confirm_mutation" ? rec.kind : null;
    const label = typeof rec.label === "string" ? rec.label.trim() : "";
    if (!kind || !label) continue;
    const href = typeof rec.href === "string" && rec.href.startsWith("/") && !rec.href.startsWith("//") ? rec.href : undefined;
    const intent = typeof rec.intent === "string" ? rec.intent.trim() : undefined;
    const prompt = typeof rec.prompt === "string" ? rec.prompt.trim() : undefined;
    const mutation = typeof rec.mutation === "string" ? rec.mutation.trim() : undefined;
    if (kind === "navigate" && !href) continue;
    if (kind === "confirm_mutation" && !mutation) continue;
    out.push({
      id: typeof rec.id === "string" && rec.id.trim() ? rec.id.trim() : `act_${kind}_${out.length}`,
      kind,
      label: label.slice(0, 48),
      href,
      intent,
      prompt,
      mutation,
    });
    if (out.length >= 4) break;
  }
  return out;
}

export function mergeSuggestedActions(
  preferred: ExpertSuggestedAction[],
  fallback: ExpertSuggestedAction[],
): ExpertSuggestedAction[] {
  const merged: ExpertSuggestedAction[] = [];
  for (const action of [...preferred, ...fallback]) {
    if (merged.some((row) => row.id === action.id || row.label === action.label)) continue;
    merged.push(action);
    if (merged.length >= 4) break;
  }
  return merged;
}

export function rankSuggestedActions(ctx: ExpertClientContext, bundle: OfflineBundle): ExpertSuggestedAction[] {
  const actions: ExpertSuggestedAction[] = [];
  const flags = !isErr(bundle.anomalies) ? bundle.anomalies.flags : [];
  const complete = !isErr(bundle.completeness) ? bundle.completeness : null;
  const page = ctx.pathname;
  const viewer = isViewer(ctx.accessRole);

  const lead = blockers(flags)[0] ?? flags.find((f) => f.severity === "watch");
  if (lead) {
    actions.push({
      id: "act_flag",
      kind: "navigate",
      label: lead.title.length > 28 ? "Open flagged screen" : lead.title,
      href: dest(lead.href, ctx),
    });
  }

  const gap = complete ? missingItems(complete.items)[0] : null;
  if (gap) {
    actions.push({
      id: "act_gap",
      kind: "navigate",
      label: gap.status === "partial" ? `Continue ${gap.label}` : `Begin ${gap.label}`,
      href: dest(gap.href, ctx),
    });
  }

  if ((page === "/" || page.startsWith("/deals")) && !viewer) {
    return [
      {
        id: "act_add_deal",
        kind: "navigate",
        label: "Open Add Deal",
        href: dest("/deals/new", ctx),
      },
      {
        id: "act_missing_spe",
        kind: "intent",
        label: "What's missing for this SPE?",
        intent: "whats_missing",
        prompt: "What's missing for this SPE? Use the live completeness score and tell me which screen to open.",
      },
      {
        id: "act_import_rr",
        kind: "intent",
        label: "Troubleshoot rent roll",
        intent: "import_rent_roll",
        prompt: "How do I import a rent roll for this SPE? Include the confirm-replace step if units already exist.",
      },
      ...actions,
    ].slice(0, 4);
  }

  if (page.startsWith("/narratives")) {
    actions.unshift({
      id: "act_audience",
      kind: "intent",
      label: "Switch audience tone",
      intent: "audience",
      prompt:
        "I am on Narratives. Walk the CRE matrix (LP / GP / IC / Lender / Mgmt) for this entity and period. Cite live KPIs. Do not invent LTV or delinquency.",
    });
  }

  if (page.startsWith("/deals/new") || page.startsWith("/vault") || /blob|om|rediq|0 units/i.test(page)) {
    actions.push({
      id: "act_ingest",
      kind: "intent",
      label: "Troubleshoot ingest",
      intent: "troubleshoot_ingest",
      prompt:
        "Troubleshoot ingest: Blob / 413 / 0 units / redIQ headers / period. Quote live completeness and the exact click path. Do not invent units.",
    });
  }

  if (!viewer && (page.startsWith("/properties") || page.startsWith("/dashboard"))) {
    actions.push({
      id: "act_reapply",
      kind: "confirm_mutation",
      label: "Re-apply rent roll",
      href: dest(ctx.entityCode.startsWith("SPE-") ? `/properties/${ctx.entityCode}` : "/properties", ctx),
      mutation: "Replace Unit rows from the vaulted rent-roll workbook for this SPE",
    });
  }

  if (page.startsWith("/close") || (!isErr(bundle.period) && bundle.period.status === "OPEN")) {
    actions.push({
      id: "act_close",
      kind: "navigate",
      label: "Continue period close",
      href: dest("/close", ctx),
    });
  }

  if (!actions.some((a) => a.id === "act_pack")) {
    actions.push({
      id: "act_pack",
      kind: "navigate",
      label: page.startsWith("/debt") ? "Open lender pack" : "Open LP pack",
      href: dest(page.startsWith("/debt") ? "/narratives/packs/quarterly_lender" : "/narratives/packs/monthly_investor", ctx),
    });
  }

  return actions.slice(0, 4);
}

/** Keep overview / Deals chips stable for existing tests; enrich other pages. */
export function rankChips(ctx: ExpertClientContext, bundle: OfflineBundle): ExpertChip[] {
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
  if (page === "/" || page.startsWith("/deals")) {
    return [
      {
        id: "add_deal",
        label: "Add a new deal",
        prompt: "Add a new deal. Walk me through the Add Deal wizard click path for a new property SPE under OpCo.",
      },
      {
        id: "whats_missing_spe",
        label: "What's missing for this SPE?",
        prompt: "What's missing for this SPE? Use the live completeness score and tell me which screen to open.",
      },
      {
        id: "import_rent_roll",
        label: "Import rent roll",
        prompt: "How do I import a rent roll for this SPE? Include the confirm-replace step if units already exist.",
      },
    ];
  }

  const extras: ExpertChip[] = [
    {
      id: "add_deal",
      label: "Add a new deal",
      prompt: "Add a new deal. Walk me through the Add Deal wizard click path for a new property SPE under OpCo.",
    },
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
    {
      id: "audience",
      label: "Audience matrix",
      prompt:
        "Walk LP / GP / IC / Lender / Mgmt tones for this entity. Cite live snapshot numbers. Do not invent LTV or delinquency.",
    },
    {
      id: "troubleshoot",
      label: "Troubleshoot ingest",
      prompt:
        "Troubleshoot ingest / Blob / 0 units / period. Quote live tools and the exact click path. Do not invent units.",
    },
  ];

  if (page.startsWith("/close")) extras.unshift(extras.find((e) => e.id === "checklist")!);
  if (page.startsWith("/debt") || page.startsWith("/dashboard")) extras.unshift(extras.find((e) => e.id === "dscr")!);
  if (page.startsWith("/narratives")) extras.unshift(extras.find((e) => e.id === "audience")!);
  if (page.startsWith("/deals/new") || page.startsWith("/vault") || page.startsWith("/properties")) {
    extras.unshift(extras.find((e) => e.id === "troubleshoot")!);
  }

  for (const extra of extras) {
    if (chips.length >= 4) break;
    if (!chips.some((c) => c.id === extra.id)) chips.push(extra);
  }
  return chips.slice(0, 4);
}

export function pageProcessLead(ctx: ExpertClientContext): string {
  const title = describePage(ctx.pathname).title;
  if (ctx.pathname.startsWith("/deals")) return "Begin or finish Add Deal (upload-first), then open the new SPE.";
  if (ctx.pathname.startsWith("/close")) return "Continue period close in order — do not jump to packs.";
  if (ctx.pathname.startsWith("/narratives")) return "Pick the audience first, then export the matching pack.";
  if (ctx.pathname.startsWith("/vault")) return "Store the OM / rent roll on the SPE — Blob is required for files over ~3.5 MB on Vercel.";
  if (ctx.pathname.startsWith("/tax")) return "Export for the CPA only — this system does not file.";
  return `Lead the next honest step on ${title}.`;
}
