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

const MAX_CHROME = 3;

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
    if (out.length >= MAX_CHROME) break;
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
    if (merged.length >= MAX_CHROME) break;
  }
  return merged;
}

const ADD_DEAL_CHIP: ExpertChip = {
  id: "add_deal",
  label: "Add a new deal",
  prompt: "Add a new deal. Walk me through the Add Deal wizard click path for a new property SPE under OpCo.",
};

const MISSING_CHIP: ExpertChip = {
  id: "whats_missing_spe",
  label: "What's missing for this SPE?",
  prompt: "What's missing for this SPE? Use the live completeness score and tell me which screen to open.",
};

const IMPORT_RR_CHIP: ExpertChip = {
  id: "import_rent_roll",
  label: "Import rent roll",
  prompt: "How do I import a rent roll for this SPE? Include the confirm-replace step if units already exist.",
};

const ARCHIVE_CHIP: ExpertChip = {
  id: "archive_deal",
  label: "Archive this deal",
  prompt:
    "How do I archive a live SPE? Cover the Deals row action and Vault trigger, the two-step confirm, and that archived deals are on gold nav Archive — not under Deals.",
};

const FIND_ARCHIVED_CHIP: ExpertChip = {
  id: "find_archive",
  label: "Where are archived deals?",
  prompt:
    "Where do I find archived deals? Do not put them under Deals. Point me to gold nav Archive and how Principal restore works.",
};

function queryChips(q: string): ExpertChip[] | null {
  if (!q) return null;
  if (/add (a )?new deal|new deal|add deal|onboard/.test(q)) {
    return [ADD_DEAL_CHIP, IMPORT_RR_CHIP];
  }
  if (/archiv|restore (a )?(deal|spe)/.test(q)) {
    return [ARCHIVE_CHIP, FIND_ARCHIVED_CHIP];
  }
  if (/harrington|what.?s missing|missing for|completeness|gaps? for/.test(q)) {
    return [
      {
        id: "whats_missing_spe",
        label: /harrington/.test(q) ? "Harrington gaps" : MISSING_CHIP.label,
        prompt: /harrington/.test(q)
          ? "What's missing for Harrington? Stay on SPE-HRP gaps only."
          : MISSING_CHIP.prompt,
      },
    ];
  }
  if (/noi/.test(q) && !/dscr|debt yield|ltv/.test(q)) {
    return [
      {
        id: "noi",
        label: "Open NOI bridge",
        prompt: "Walk me through the NOI number on this card. Stay on NOI — do not list DSCR or LTV.",
      },
      {
        id: "os",
        label: "Operating Statement",
        prompt: "Open the operating statement NOI bridge for this entity and period.",
      },
    ];
  }
  if (/dscr|debt yield|covenant/.test(q)) {
    return [
      {
        id: "dscr",
        label: "Review DSCR",
        prompt: "Review DSCR and debt yield against the loan-file thresholds. Do not invent LTV.",
      },
    ];
  }
  if (/rent.?roll|xlsx|import/.test(q)) {
    return [IMPORT_RR_CHIP];
  }
  if (/tour|this page|where am i/.test(q)) {
    return [
      {
        id: "audit_page",
        label: "What's on this page?",
        prompt: "Orient me on this page only. One next click. Do not dump flags.",
      },
    ];
  }
  return null;
}

export function rankSuggestedActions(
  ctx: ExpertClientContext,
  bundle: OfflineBundle,
  userText = "",
): ExpertSuggestedAction[] {
  const actions: ExpertSuggestedAction[] = [];
  const flags = !isErr(bundle.anomalies) ? bundle.anomalies.flags : [];
  const complete = !isErr(bundle.completeness) ? bundle.completeness : null;
  const page = ctx.pathname;
  const viewer = isViewer(ctx.accessRole);
  const q = userText.trim().toLowerCase();

  if (/noi/.test(q) && !/dscr|debt|missing/.test(q)) {
    const noiActions: ExpertSuggestedAction[] = [
      {
        id: "act_os",
        kind: "navigate",
        label: "Open Operating Statement",
        href: dest("/reports/operating-statement", ctx),
      },
      {
        id: "act_dash",
        kind: "navigate",
        label: "Open dashboard",
        href: dest(
          ctx.entityCode.startsWith("SPE-") || ctx.entityCode === "RCP-OPCO"
            ? `/dashboard/${ctx.entityCode}`
            : "/dashboard",
          ctx,
        ),
      },
    ];
    return noiActions;
  }

  if (/harrington|what.?s missing|missing for|completeness/.test(q)) {
    const gap = complete
      ? missingItems(complete.items).find((item) =>
          /harrington/.test(q) ? /hrp|harrington/i.test(`${item.id} ${item.label} ${item.href}`) : true,
        )
      : null;
    return [
      gap
        ? {
            id: "act_gap",
            kind: "navigate",
            label: gap.status === "partial" ? `Continue ${gap.label}` : `Open ${gap.label}`,
            href: dest(gap.href, ctx),
          }
        : {
            id: "act_missing_spe",
            kind: "intent",
            label: /harrington/.test(q) ? "Harrington gaps" : "What's missing?",
            intent: "whats_missing",
            prompt: /harrington/.test(q)
              ? "What's missing for Harrington? Stay on SPE-HRP gaps only."
              : "What's missing for this SPE? Use the live completeness gaps only.",
          },
    ];
  }

  const lead = blockers(flags)[0];
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
    const dealActions: ExpertSuggestedAction[] = [
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
    ];
    return dealActions.slice(0, MAX_CHROME);
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

  if (page.startsWith("/deals/new") || page.startsWith("/vault")) {
    actions.push({
      id: "act_ingest",
      kind: "intent",
      label: "Troubleshoot ingest",
      intent: "troubleshoot_ingest",
      prompt:
        "Troubleshoot ingest: Blob / 413 / 0 units / redIQ headers / period. Quote live completeness and the exact click path. Do not invent units.",
    });
  }

  if (!viewer && (page === "/deals" || page.startsWith("/vault")) && ctx.entityCode.startsWith("SPE-")) {
    actions.push({
      id: "act_archive",
      kind: "intent",
      label: "Archive this deal",
      intent: "archive_deal",
      prompt: ARCHIVE_CHIP.prompt,
    });
  }

  if (page.startsWith("/archive") && !viewer) {
    const archiveActions: ExpertSuggestedAction[] = [
      {
        id: "act_restore",
        kind: "intent",
        label: "Restore an archived deal",
        intent: "restore_deal",
        prompt: FIND_ARCHIVED_CHIP.prompt,
      },
      {
        id: "act_deals",
        kind: "navigate",
        label: "Back to live Deals",
        href: dest("/deals", ctx),
      },
    ];
    return archiveActions.slice(0, MAX_CHROME);
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

  if (page.startsWith("/close") || (!isErr(bundle.period) && bundle.period.status === "OPEN" && page.startsWith("/close"))) {
    actions.push({
      id: "act_close",
      kind: "navigate",
      label: "Continue period close",
      href: dest("/close", ctx),
    });
  }

  if (page.startsWith("/debt") && !actions.some((a) => a.id === "act_pack")) {
    actions.push({
      id: "act_pack",
      kind: "navigate",
      label: "Open lender pack",
      href: dest("/narratives/packs/quarterly_lender", ctx),
    });
  }

  return actions.slice(0, MAX_CHROME);
}

/** Keep overview / Deals chips stable for existing tests; enrich other pages. */
export function rankChips(ctx: ExpertClientContext, bundle: OfflineBundle, userText = ""): ExpertChip[] {
  const fromQuery = queryChips(userText.trim().toLowerCase());
  if (fromQuery) return fromQuery.slice(0, MAX_CHROME);

  const chips: ExpertChip[] = [];
  const flags = !isErr(bundle.anomalies) ? bundle.anomalies.flags : [];
  const complete = !isErr(bundle.completeness) ? bundle.completeness : null;
  const lead = blockers(flags)[0];
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
  if (page === "/" || (page.startsWith("/deals") && !page.startsWith("/deals/new"))) {
    return [ADD_DEAL_CHIP, MISSING_CHIP, IMPORT_RR_CHIP];
  }
  if (page.startsWith("/archive")) {
    return [FIND_ARCHIVED_CHIP, ARCHIVE_CHIP];
  }

  const extras: ExpertChip[] = [];
  if (page.startsWith("/close")) {
    extras.push({
      id: "checklist",
      label: "Month-end checklist",
      prompt: "Start checklist mode for month-end close. Sequence the work for this entity and period.",
    });
  }
  if (page.startsWith("/debt")) {
    extras.push({
      id: "dscr",
      label: "Review DSCR",
      prompt: "Review DSCR and debt yield against the loan-file thresholds. Do not invent LTV.",
    });
  }
  if (page.startsWith("/narratives")) {
    extras.push({
      id: "audience",
      label: "Audience matrix",
      prompt:
        "Walk LP / GP / IC / Lender / Mgmt tones for this entity. Cite live snapshot numbers. Do not invent LTV or delinquency.",
    });
  }
  if (page.startsWith("/deals/new") || page.startsWith("/vault") || page.startsWith("/properties")) {
    extras.push({
      id: "troubleshoot",
      label: "Troubleshoot ingest",
      prompt:
        "Troubleshoot ingest / Blob / 0 units / period. Quote live tools and the exact click path. Do not invent units.",
    });
  }
  if (page.startsWith("/dashboard") || page.startsWith("/reports/operating")) {
    extras.push({
      id: "noi",
      label: "Check NOI bridge",
      prompt: "Walk me through the NOI bridge and whether AM fees sit below NOI.",
    });
  }
  extras.push({
    id: "audit_page",
    label: "What's wrong on this page?",
    prompt: "What's wrong on this page? Audit the current screen with live completeness and anomalies.",
  });

  for (const extra of extras) {
    if (chips.length >= MAX_CHROME) break;
    if (!chips.some((c) => c.id === extra.id)) chips.push(extra);
  }
  return chips.slice(0, MAX_CHROME);
}

export function pageProcessLead(ctx: ExpertClientContext): string {
  if (ctx.pathname.startsWith("/deals")) return "When you are ready, open **Add Deal** and drop the OM or rent-roll workbook.";
  if (ctx.pathname.startsWith("/archive")) return "Study an archived SPE here, or **Restore** with the two-step confirm. This is not under Deals.";
  if (ctx.pathname.startsWith("/close")) return "Continue period close on **Close** — stay in order.";
  if (ctx.pathname.startsWith("/narratives")) return "Pick the audience, then export the matching pack.";
  if (ctx.pathname.startsWith("/vault")) return "File the OM or rent roll for this SPE in **Vault**. Archive a live SPE from **Archive this deal…**.";
  if (ctx.pathname.startsWith("/tax")) return "Export the CPA worksheet from **Tax** when you need it.";
  if (ctx.pathname.startsWith("/debt")) return "Open the loan file on **Debt** if you want the covenant math.";
  if (ctx.pathname.startsWith("/dashboard")) return "Click a tile for the formula, or ask me about a number on this card.";
  if (ctx.pathname === "/") return "Open **Add Deal** for a new SPE, or ask me about a card on this page.";
  return `One useful next click is on **${describePage(ctx.pathname).title}** — or ask me about a number here.`;
}
