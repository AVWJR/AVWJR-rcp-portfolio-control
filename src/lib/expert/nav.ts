import type { ExpertClientContext, NavTarget } from "./types";

export const DEFAULT_ENTITY = "RCP-OPCO";
export const DEFAULT_PERIOD = "2026-08";

const PAGE_CATALOG: { test: RegExp; title: string; hints: string[] }[] = [
  {
    test: /^\/$/,
    title: "Overview",
    hints: [
      "Navy header switches entity and period (2026-07 opening, 2026-08 operating).",
      "Tiles jump to dashboards, NOI bridge, debt, close, tax (CPA export only), vault, and packs.",
    ],
  },
  {
    test: /^\/dashboard\/ratios\/[^/]+$/,
    title: "Ratio drill-down",
    hints: [
      "Formula, NOI definition (period vs T12 vs annualized), and contributing accounts.",
      "Links go to the operating statement, trial balance, debt, rent roll, or CapEx — not invented numbers.",
    ],
  },
  {
    test: /^\/dashboard\/ratios$/,
    title: "Ratio dictionary",
    hints: ["Every live ratio with units and source. LTV and delinquency stay gated."],
  },
  {
    test: /^\/dashboard\/(SPE-[A-Z]+|RCP-OPCO)$/,
    title: "Property / OpCo dashboard",
    hints: [
      "Tiles are the live dictionary. Click a tile for formula drill-down.",
      "OpCo is look-through / combined roll-up — not a GAAP consolidation. AM fees sit below NOI.",
    ],
  },
  {
    test: /^\/dashboard$/,
    title: "Dashboards",
    hints: ["OpCo combined roll-up and SPE property dashboards. HoldCo has no operating dashboard."],
  },
  {
    test: /^\/narratives\/packs\/[^/]+$/,
    title: "Report pack preview",
    hints: ["Export PDF or PPTX. Same snapshot as Narratives. LTV stays gated."],
  },
  {
    test: /^\/narratives$/,
    title: "Narratives",
    hints: ["LP, GP, IC, Lender, and Management tones from the same period snapshot. Does not invent covenants."],
  },
  {
    test: /^\/reports\/operating-statement$/,
    title: "Operating statement",
    hints: [
      "GPR → vacancy/concessions → EGI → OpEx → NOI → interest, depreciation, AM fees.",
      "Budget vs actual and prior-period columns. AM fees are below NOI.",
    ],
  },
  {
    test: /^\/reports\/trial-balance$/,
    title: "Trial balance",
    hints: ["As-of posted activity. Debits must equal credits."],
  },
  {
    test: /^\/reports\/income-statement$/,
    title: "Income statement",
    hints: ["Book P/L with the same NOI math as the operating statement (no budget columns)."],
  },
  {
    test: /^\/reports\/balance-sheet$/,
    title: "Balance sheet",
    hints: ["Assets = liabilities + equity, including unclosed NI and CIP 1460."],
  },
  {
    test: /^\/reports\/cash-flow$/,
    title: "Cash flow",
    hints: ["Indirect method. Ending cash should tie to the balance sheet."],
  },
  {
    test: /^\/reports\/packs$/,
    title: "Report packs",
    hints: ["Alias of the pack catalog. Prefer /narratives/packs/{id}."],
  },
  {
    test: /^\/properties\/[^/]+$/,
    title: "Property rent roll",
    hints: [
      "Unit master: status, market vs in-place rent, concessions. Occupancy is not derived from GL 4020.",
      "CSV import replaces the SPE rent roll after you confirm.",
    ],
  },
  {
    test: /^\/deals\/new$/,
    title: "Add Deal",
    hints: [
      "Upload-first: drop OM / redIQ or Yardi XLSX / T12. Filenames infer SPE-HRP-style codes. Files go one at a time (32 MB each).",
      "On Vercel, files over ~3.5 MB need BLOB_READ_WRITE_TOKEN (Add Deal and /vault share Blob). A 5.5 MB Harrington OM is valid.",
      "0 units is a failure: could not map columns + Detected headers. Re-apply rent roll on Properties / Dashboard. Writes need confirm.",
    ],
  },
  {
    test: /^\/deals$/,
    title: "Deals",
    hints: [
      "Live SPE list plus saved Add Deal drafts. New deals are SPE entities under OpCo (usually RCP-OPCO).",
      "Delete on a row is a two-step soft-archive. Deleted SPEs are not here — gold nav Deal Archive.",
    ],
  },
  {
    test: /^\/archive$/,
    title: "Deal Archive",
    hints: [
      "Soft-archived SPEs for study. Restore is a two-step confirm from this page.",
      "Not a tab under Deals. Books and vault stay intact. Not a hard wipe.",
    ],
  },
  {
    test: /^\/properties$/,
    title: "Properties",
    hints: ["SPE list with unit counts. Open a property for the rent roll and occupancy."],
  },
  {
    test: /^\/debt$/,
    title: "Debt",
    hints: ["First-mortgage file, UPB, DSCR and debt yield vs loan thresholds. Do not invent LTV from book cost."],
  },
  {
    test: /^\/capex$/,
    title: "CapEx / CIP",
    hints: ["CapEx vs R&M. CIP stays on 1460 until placed in service. R&M (5210) stays in NOI."],
  },
  {
    test: /^\/close$/,
    title: "Period close",
    hints: [
      "OPEN → soft close → controller checklist → hard lock. Reopen needs a reason and ticket.",
      "WBG 2026-07 is hard locked in the demo. August stays open.",
    ],
  },
  {
    test: /^\/tax\/k1$/,
    title: "Partner capital / K-1 export",
    hints: ["Beg + contrib − dist ± book NI = end. CPA prep only — not a filed Schedule K-1."],
  },
  {
    test: /^\/tax$/,
    title: "Books-to-tax bridge",
    hints: [
      "Book NI, depreciation, interest, and AM fees vs tax columns. MACRS hooks only.",
      "This system does not file taxes and is not a tax consolidation.",
    ],
  },
  {
    test: /^\/vault$/,
    title: "Document vault",
    hints: [
      "Metadata + files by entity (leases, loans, K-1s, draws, insurance). Not a bank or PMS feed.",
      "Delete on a live SPE removes the deal from live Deals (soft-archive). Removing a file is not deleting the SPE.",
    ],
  },
  {
    test: /^\/scheduler$/,
    title: "Scheduled reporting",
    hints: ["Monthly investor and quarterly lender jobs. Writes files; does not email."],
  },
  {
    test: /^\/vendors$/,
    title: "1099 vendor hooks",
    hints: ["Vendor master + reportable overlay. Phase A AP has no invoice subledger. Not a filed 1099."],
  },
  {
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
  { id: "deals", href: "/deals", label: "Deals", hint: "Live SPE list and Add Deal drafts" },
  { id: "add_deal", href: "/deals/new", label: "Add Deal", hint: "Guided SPE intake" },
  { id: "archive", href: "/archive", label: "Deal Archive", hint: "Deleted SPEs for study — not under Deals" },
  { id: "properties", href: "/properties", label: "Properties", hint: "SPE list / rent roll" },
  { id: "debt", href: "/debt", label: "Debt", hint: "Loan file and covenants" },
  { id: "capex", href: "/capex", label: "CapEx", hint: "CIP and R&M" },
  { id: "close", href: "/close", label: "Close", hint: "Soft close / hard lock" },
  { id: "tax", href: "/tax", label: "Tax bridge", hint: "CPA worksheet — does not file" },
  { id: "k1", href: "/tax/k1", label: "K-1 export", hint: "Partner capital — not a filed K-1" },
  { id: "vault", href: "/vault", label: "Vault", hint: "Entity documents" },
  { id: "scheduler", href: "/scheduler", label: "Scheduler", hint: "Pack jobs" },
  { id: "vendors", href: "/vendors", label: "1099", hint: "Vendor overlay" },
];

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
