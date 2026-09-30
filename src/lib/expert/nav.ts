import type { ExpertClientContext, NavTarget } from "./types";

export const DEFAULT_ENTITY = "RCP-OPCO";
export const DEFAULT_PERIOD = "2026-08";

export const PAGE_CATALOG: { pattern: string; test: RegExp; title: string; hints: string[] }[] = [
  {
    pattern: "/",
    test: /^\/$/,
    title: "Overview",
    hints: [
      "Navy header switches entity and period (2026-07 opening, 2026-08 operating).",
      "Tiles jump to dashboards, NOI bridge, debt, close, tax (CPA export only), vault, and packs.",
    ],
  },
  {
    pattern: "/dashboard/ratios/[ratioId]",
    test: /^\/dashboard\/ratios\/[^/]+$/,
    title: "Ratio drill-down",
    hints: [
      "Formula, NOI definition (period vs T12 vs annualized), and contributing accounts.",
      "Links go to the operating statement, trial balance, debt, rent roll, or CapEx — not invented numbers.",
    ],
  },
  {
    pattern: "/dashboard/ratios",
    test: /^\/dashboard\/ratios$/,
    title: "Ratio dictionary",
    hints: ["Every live ratio with units and source. LTV and delinquency stay gated."],
  },
  {
    pattern: "/dashboard/[entityCode]",
    test: /^\/dashboard\/(SPE-[A-Z]+|RCP-OPCO)$/,
    title: "Property / OpCo dashboard",
    hints: [
      "Tiles are the live dictionary. Click a tile for formula drill-down.",
      "OpCo is look-through / combined roll-up — not a GAAP consolidation. AM fees sit below NOI.",
    ],
  },
  {
    pattern: "/deals/[code]/close",
    test: /^\/deals\/[^/]+\/close$/,
    title: "Month-end close",
    hints: [
      "Drop the manager package. Files are classified and kept.",
      "Hard lock needs a soft close first, a complete checklist, no suspense or unmapped lines, and tie-outs that pass (RR-1, RR-11, RR-12). Reopen needs a reason and a ticket.",
    ],
  },
  {
    pattern: "/dashboard",
    test: /^\/dashboard$/,
    title: "Dashboards",
    hints: ["OpCo combined roll-up and SPE property dashboards. HoldCo has no operating dashboard."],
  },
  {
    pattern: "/narratives/packs/[packId]",
    test: /^\/narratives\/packs\/[^/]+$/,
    title: "Report pack preview",
    hints: ["Export PDF or PPTX. Same executive spine for every audience. Only Owned SPEs are included. Pipeline, Screened, Test, and soft-archived SPEs stay out. LTV stays gated."],
  },
  {
    pattern: "/narratives",
    test: /^\/narratives$/,
    title: "Narratives",
    hints: ["LP, GP, IC, Lender, and Management tones from the same period snapshot. Does not invent covenants."],
  },
  {
    pattern: "/reports/operating-statement",
    test: /^\/reports\/operating-statement$/,
    title: "Operating statement",
    hints: [
      "GPR → vacancy/concessions → EGI → OpEx → NOI → interest, depreciation, AM fees.",
      "Budget vs actual and prior-period columns. AM fees are below NOI.",
    ],
  },
  {
    pattern: "/reports/trial-balance",
    test: /^\/reports\/trial-balance$/,
    title: "Trial balance",
    hints: ["As-of posted activity. Debits must equal credits."],
  },
  {
    pattern: "/reports/income-statement",
    test: /^\/reports\/income-statement$/,
    title: "Income statement",
    hints: ["Book P/L with the same NOI math as the operating statement (no budget columns)."],
  },
  {
    pattern: "/reports/balance-sheet",
    test: /^\/reports\/balance-sheet$/,
    title: "Balance sheet",
    hints: ["Assets = liabilities + equity, including unclosed NI and CIP 1460."],
  },
  {
    pattern: "/reports/cash-flow",
    test: /^\/reports\/cash-flow$/,
    title: "Cash flow",
    hints: ["Indirect method. Ending cash should tie to the balance sheet."],
  },
  {
    pattern: "/reports/packs",
    test: /^\/reports\/packs$/,
    title: "Report packs",
    hints: ["Alias of the pack catalog. Prefer /narratives/packs/{id}."],
  },
  {
    pattern: "/properties/[code]",
    test: /^\/properties\/[^/]+$/,
    title: "Property rent roll",
    hints: [
      "Unit master: status, market vs in-place rent, concessions. Occupancy is not derived from GL 4020.",
      "CSV / XLSX import replaces the SPE rent roll after you confirm. Dialects: Yardi Lease Charges, redIQ, broker flat, RCP template.",
    ],
  },
  {
    pattern: "/deals/[code]/distributions",
    test: /^\/deals\/SPE-[A-Z0-9]+\/distributions$/,
    title: "Distribution ledger",
    hints: [
      "Record a distribution: amount, operating cash or capital event, preview the waterfall split, then confirm.",
      "Posted rows stay. Corrections use Reverse on the latest row only. Download CSV, History, and the Where we are in the waterfall gauge sit on this page. Once something is posted, unreturned capital and unpaid pref come from this ledger.",
    ],
  },
  {
    pattern: "/deals/[code]/waterfall",
    test: /^\/deals\/SPE-[A-Z0-9]+\/waterfall$/,
    title: "Deal waterfall",
    hints: [
      "Click a template chip (simple pref, institutional catch-up, multi-hurdle, American, European) then edit pref, splits, Co-GP, and capital.",
      "Save to amend OpCo cash/CFADS to the RCP share (Co-GP stays at the deal). Default is 100% look-through until you choose.",
    ],
  },
  {
    pattern: "/deals/[code]/proforma",
    test: /^\/deals\/SPE-[A-Z0-9]+\/proforma$/,
    title: "Deal proforma",
    hints: [
      "Forward-looking Deal LP vs Deal GP (RCP + Co-GP) using the saved waterfall. Not historical books.",
      "Hold years, CFADS growth, and exit proceeds are scenario inputs. Open OpCo proforma for the platform roll-up.",
    ],
  },
  {
    pattern: "/opco/proforma",
    test: /^\/opco\/proforma$/,
    title: "OpCo proforma",
    hints: [
      "Aggregates each Owned SPE’s deal waterfall. OpCo LPs = Deal LPs; OpCo GPs = RCP platform. Co-GP stays at the deal.",
      "Optional OpCo-level pref if you enter platform capital. Same source of truth as live rollup and LP packs.",
    ],
  },
  {
    pattern: "/deals/new",
    test: /^\/deals\/new$/,
    title: "Add Deal",
    hints: [
      "Upload-first: drop OM / Yardi Lease Charges or redIQ XLSX / T12. Filenames infer SPE-HRP-style codes. Files go one at a time (32 MB each).",
      "On Vercel, files over ~3.5 MB need BLOB_READ_WRITE_TOKEN (Add Deal and /vault share Blob). A 5.5 MB Harrington OM is valid.",
      "0 units is a failure: could not map columns + Detected headers. Apply / Re-apply rent roll on Properties / Vault / Dashboard (Kind Other *RR* files count). Writes need confirm.",
    ],
  },
  {
    pattern: "/library",
    test: /^\/library$/,
    title: "Deal Library",
    hints: [
      "Every deal, every status. + Add criterion, then a sentence row. Hard limits filter. Preference waits for the optimizer.",
      "How do I find deals that meet my criteria? Gold nav Library. X of Y pass, why-excluded tags, save a preset.",
      "Stale is amber at 90 days and red at 180. Age never deletes a deal or a file.",
    ],
  },
  {
    pattern: "/deals/[code]",
    test: /^\/deals\/SPE-[A-Z0-9]+$/,
    title: "Deal profile",
    hints: [
      "Library fields, fees, and deal status. Only Owned feeds the OpCo roll-up.",
      "Save analysis snapshot keeps the prior one. LP net IRR is Phase 2.",
    ],
  },
  {
    pattern: "/deals",
    test: /^\/deals$/,
    title: "Deals",
    hints: [
      "Owned SPE list plus saved Add Deal drafts. Pipeline and Screened live in the Library. New deals are SPE entities under OpCo (usually RCP-OPCO).",
      "Delete on a row is a two-step soft-archive. Deleted SPEs are not here — gold nav Deal Archive.",
      "LP/GP waterfall is on each SPE card — not buried. Default 100% look-through until a template is saved.",
    ],
  },
  {
    pattern: "/archive",
    test: /^\/archive$/,
    title: "Deal Archive",
    hints: [
      "Soft-archived SPEs for study. Restore is a two-step confirm from this page.",
      "Not a tab under Deals. Books and vault stay intact. Not a hard wipe.",
    ],
  },
  {
    pattern: "/properties",
    test: /^\/properties$/,
    title: "Properties",
    hints: ["SPE list with unit counts. Open a property for the rent roll and occupancy."],
  },
  {
    pattern: "/debt",
    test: /^\/debt$/,
    title: "Debt",
    hints: ["First-mortgage file, UPB, DSCR and debt yield vs loan thresholds. Do not invent LTV from book cost."],
  },
  {
    pattern: "/capex",
    test: /^\/capex$/,
    title: "CapEx / CIP",
    hints: ["CapEx vs R&M. CIP stays on 1460 until placed in service. R&M (5210) stays in NOI."],
  },
  {
    pattern: "/close",
    test: /^\/close$/,
    title: "Period close",
    hints: [
      "OPEN → soft close → controller checklist → hard lock. Reopen needs a reason and ticket.",
      "WBG 2026-07 is hard locked in the demo. August stays open.",
    ],
  },
  {
    pattern: "/tax/k1",
    test: /^\/tax\/k1$/,
    title: "Partner capital / K-1 export",
    hints: ["Beg + contrib − dist ± book NI = end. CPA prep only — not a filed Schedule K-1."],
  },
  {
    pattern: "/tax",
    test: /^\/tax$/,
    title: "Books-to-tax bridge",
    hints: [
      "Book NI, depreciation, interest, and AM fees vs tax columns. MACRS hooks only.",
      "This system does not file taxes and is not a tax consolidation.",
    ],
  },
  {
    pattern: "/vault",
    test: /^\/vault$/,
    title: "Document vault",
    hints: [
      "Metadata + files by entity (leases, loans, K-1s, draws, insurance). Not a bank or PMS feed.",
      "Delete on a live SPE removes the deal from live Deals (soft-archive). Removing a file is not deleting the SPE.",
    ],
  },
  {
    pattern: "/scheduler",
    test: /^\/scheduler$/,
    title: "Scheduled reporting",
    hints: ["Monthly investor and quarterly lender jobs. Writes files; does not email."],
  },
  {
    pattern: "/vendors",
    test: /^\/vendors$/,
    title: "1099 vendor hooks",
    hints: ["Vendor master + reportable overlay. Phase A AP has no invoice subledger. Not a filed 1099."],
  },
  {
    pattern: "/admin/seed",
    test: /^\/admin\/seed$/,
    title: "Load demo data",
    hints: ["Admin-only seed for an empty deploy. Demo books only — does not file taxes."],
  },
];

export const NAV_TARGETS: NavTarget[] = [
  { id: "overview", href: "/", label: "Overview", hint: "Home tiles and product map" },
  { id: "dashboard", href: "/dashboard", label: "Dashboard", hint: "OpCo / property KPI tiles" },
  { id: "ratios", href: "/dashboard/ratios", label: "Ratios", hint: "Live formula dictionary" },
  { id: "narratives", href: "/narratives", label: "Narratives", hint: "Five audience tones" },
  { id: "lp_pack", href: "/narratives/packs/monthly_investor", label: "Monthly Investor Pack", hint: "LP PDF / PPTX" },
  { id: "lender_pack", href: "/narratives/packs/quarterly_lender", label: "Quarterly Lender Pack", hint: "Lender PDF / PPTX" },
  { id: "ic_pack", href: "/narratives/packs/ic_memo", label: "IC Memo Pack", hint: "Go / hold / kill memo" },
  { id: "mgmt_pack", href: "/narratives/packs/management_flash", label: "Management Flash", hint: "Ops flash pack" },
  { id: "os", href: "/reports/operating-statement", label: "Operating Statement", hint: "NOI bridge + variance" },
  { id: "tb", href: "/reports/trial-balance", label: "Trial Balance", hint: "Debits = credits" },
  { id: "is", href: "/reports/income-statement", label: "Income Statement", hint: "Book P/L" },
  { id: "bs", href: "/reports/balance-sheet", label: "Balance Sheet", hint: "A = L + E" },
  { id: "cf", href: "/reports/cash-flow", label: "Cash Flow", hint: "Indirect; ties to BS" },
  { id: "deals", href: "/deals", label: "Deals", hint: "Live Owned SPE list and Add Deal drafts" },
  { id: "library", href: "/library", label: "Library", hint: "How do I find deals that meet my criteria? Sentence builder, hard limits, presets, why excluded." },
  { id: "waterfall", href: "/deals", label: "Deal waterfall", hint: "LP/GP waterfall and Co-GP on a live SPE card — how do I set the deal waterfall?" },
  { id: "distributions", href: "/deals", label: "Distribution ledger", hint: "Record a distribution and see how much pref is still owed on /deals/{SPE}/distributions" },
  { id: "deal_proforma", href: "/deals", label: "Deal proforma", hint: "Forward-looking Deal LP / Deal GP (RCP + Co-GP) on a live SPE" },
  { id: "opco_proforma", href: "/opco/proforma", label: "OpCo proforma", hint: "OpCo LPs and OpCo GPs after each SPE waterfall" },
  { id: "add_deal", href: "/deals/new", label: "Add Deal", hint: "Guided SPE intake" },
  { id: "archive", href: "/archive", label: "Deal Archive", hint: "Deleted SPEs for study — not under Deals" },
  { id: "properties", href: "/properties", label: "Properties", hint: "SPE list / rent roll" },
  { id: "debt", href: "/debt", label: "Debt", hint: "Loan file and covenants" },
  { id: "capex", href: "/capex", label: "CapEx", hint: "CIP and R&M" },
  { id: "close", href: "/close", label: "Close", hint: "Soft close / hard lock" },
  { id: "month_end", href: "/deals", label: "Month-end close", hint: "Upload a manager package on the SPE card — how do I upload August close for Hampton?" },
  { id: "tax", href: "/tax", label: "Tax bridge", hint: "CPA worksheet — does not file" },
  { id: "k1", href: "/tax/k1", label: "K-1 export", hint: "Partner capital — not a filed K-1" },
  { id: "vault", href: "/vault", label: "Vault", hint: "Entity documents" },
  { id: "scheduler", href: "/scheduler", label: "Scheduler", hint: "Pack jobs" },
  { id: "vendors", href: "/vendors", label: "1099", hint: "Vendor overlay" },
];

export function listPageCatalogPatterns(): string[] {
  return PAGE_CATALOG.map((row) => row.pattern);
}

export function describePage(pathname: string): { title: string; hints: string[] } {
  const hit = PAGE_CATALOG.find((row) => row.test.test(pathname));
  return hit ?? { title: "Portfolio Control", hints: ["Use the navy header to switch entity and period."] };
}

export function withContext(
  path: string,
  entityCode: string,
  periodLabel: string,
  view?: "combined",
): string {
  const params = new URLSearchParams({ entity: entityCode, period: periodLabel });
  if (view === "combined") params.set("view", "combined");
  const [base, existing] = path.split("?");
  if (existing) {
    const extra = new URLSearchParams(existing);
    extra.forEach((value, key) => {
      if (!params.has(key)) params.set(key, value);
    });
  }
  return `${base}?${params.toString()}`;
}

export function listNavTargets(): NavTarget[] {
  return NAV_TARGETS.map((row) => ({ ...row }));
}

export function entityFromPathname(pathname: string): string | null {
  const dash = pathname.match(/^\/dashboard\/(SPE-[A-Z0-9]+|RCP-OPCO)$/);
  if (dash) return dash[1];
  const wf = pathname.match(/^\/deals\/(SPE-[A-Z0-9]+)\/(?:waterfall|distributions|proforma)$/);
  if (wf) return wf[1];
  const pf = pathname.match(/^\/deals\/(SPE-[A-Z0-9]+)\/proforma$/);
  if (pf) return pf[1];
  if (pathname === "/opco/proforma") return "RCP-OPCO";
  const profile = pathname.match(/^\/deals\/(SPE-[A-Z0-9]+)$/);
  if (profile) return profile[1];
  const prop = pathname.match(/^\/properties\/(SPE-[A-Z0-9]+)$/);
  return prop?.[1] ?? null;
}

export function readExpertContext(pathname: string, search: URLSearchParams): ExpertClientContext {
  const page = describePage(pathname);
  const entityCode = search.get("entity") ?? entityFromPathname(pathname) ?? DEFAULT_ENTITY;
  const periodLabel = search.get("period") ?? DEFAULT_PERIOD;
  const viewRaw = search.get("view");
  const view = viewRaw === "combined" || viewRaw === "consolidated" ? "combined" : undefined;
  return {
    pathname,
    entityCode,
    periodLabel,
    view,
    pageTitle: page.title,
    uiHints: page.hints,
  };
}

export function isInAppHref(href: string): boolean {
  return /^\/[A-Za-z0-9/_\-?=&%.]*$/.test(href) && !href.startsWith("//");
}
