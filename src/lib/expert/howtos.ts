import { describePage } from "./nav";

/**
 * Read-only how-to registry for RCP Expert.
 * Facts are verified against the current code. sourceRefs are file:line citations.
 */
export type ExpertHowTo = {
  id: string;
  feature: string;
  routes: string[];
  apiRoutes?: string[];
  navPath: string;
  keywords: RegExp[];
  steps: string[];
  facts: string[];
  troubleshooting: { symptom: string; cause: string; fix: string }[];
  sourceRefs: string[];
};

const HOWTO_REFERENCE_CAP = 6_000;
const HOWTO_ANSWER_CAP = 1_200;

const SYMPTOM_STOP_WORDS = new Set([
  "this",
  "that",
  "with",
  "from",
  "your",
  "have",
  "been",
  "only",
  "before",
  "after",
  "month",
  "deal",
  "does",
  "will",
  "into",
  "when",
  "what",
  "which",
  "there",
  "their",
  "about",
  "than",
  "then",
  "must",
  "every",
  "where",
  "would",
  "could",
  "should",
  "because",
]);

export function routeMatches(pattern: string, pathname: string): boolean {
  const source = pattern
    .split("/")
    .map((segment) => {
      if (/^\[[^\]]+\]$/.test(segment)) return "[^/]+";
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return new RegExp(`^${source}$`).test(pathname);
}

export const EXPERT_HOWTOS: ExpertHowTo[] = [
  {
    id: "overview.home",
    feature: "Overview",
    routes: ["/"],
    navPath: "Overview home tiles",
    keywords: [/what is on the overview|home tiles|navy header switches/i],
    steps: [
      "Use the navy header to switch entity and period (demo months 2026-07 and 2026-08).",
      "Open a tile for dashboards, debt, close, tax, vault, or packs.",
    ],
    facts: [
      "Overview is the home map. It does not post journals.",
      "OpCo combined roll-up is not a GAAP consolidation.",
    ],
    troubleshooting: [
      {
        symptom: "HoldCo has no operating dashboard",
        cause: "RCP-HOLD has no operating tiles.",
        fix: "Switch the header entity to RCP-OPCO or an Owned SPE.",
      },
    ],
    sourceRefs: ["src/lib/expert/nav.ts:8-13"],
  },
  {
    id: "close.month-end",
    feature: "Month-end close",
    routes: ["/deals/[code]/close", "/close"],
    apiRoutes: ["/api/deals/[code]/close"],
    navPath: "Deals → Owned SPE card → Month-end close",
    keywords: [
      /month-end close|soft close|soft-closed/i,
      /hard lock|hard close/i,
      /post(?:ed)? (?:this period )?into the spe books/i,
      /repost|corrected p&l/i,
      /rr-1|rr-11|rr-12|rent roll is missing/i,
      /controller override|i am the controller/i,
      /does not post journals for this deal|pipeline, not owned/i,
      /reverse operating journals/i,
      /reopen|\bticket\b/i,
    ],
    steps: [
      "Gold nav Deals → the Owned SPE card → Month-end close. Pick the month, then drop the T12 or GL and the rent roll.",
      "Review the classification. Click Post this period into the SPE books. Posting again replaces the prior import journals. In a soft-closed month, Post auto-reverses those journals and reposts the package.",
      "Click Soft close, finish the checklist, then Hard lock. Reopen always needs a reason and a ticket. A soft-closed correction needs the controller override and a reason.",
      "On Period Close (/close), Soft close and Hard lock are only for Owned deals. Pipeline, Screened, and Test are disabled.",
    ],
    facts: [
      "Only Owned SPEs can post a month-end close. Pipeline, Screened, and Test do not post journals.",
      "A soft-closed month needs the controller override checkbox (I am the controller and I am changing this soft-closed month) plus a reason before Post or Reverse. You do not have to reopen first.",
      "Reopen always needs a reason and a ticket.",
      "Hard lock prerequisites: soft close first, checklist complete, no suspense or unmapped lines, and tie-outs pass. RR-1 is rent roll missing. RR-11 is a unit count mismatch. RR-12 is a rent roll as-of date outside the close month.",
      "In an open month, posting again replaces the prior month-end import journals. In a soft-closed month the same Post auto-reverses those journals and reposts the new package.",
      "Reverse operating journals is only for other above-NOI journals, not the way you repost a corrected P&L.",
      "OpCo and HoldCo open on the latest month every Owned SPE has hard-closed.",
    ],
    troubleshooting: [
      {
        symptom: "Hard close is blocked: RR-1 Rent roll is missing.",
        cause: "RR-1 is a hard fail when the rent roll is missing. Hard lock also needs a soft close, a complete checklist, no suspense, and no RR-11 unit count or RR-12 as-of failure.",
        fix: "Drop the rent roll for the close month, confirm RR-11 unit count and RR-12 as-of date, then Hard lock again.",
      },
      {
        symptom: "Hard close is blocked:",
        cause: "Tie-out hard fails block the lock. The message names each failed row, including RR-1, RR-11, and RR-12.",
        fix: "Clear every hard fail, then Hard lock.",
      },
      {
        symptom: "This month is soft-closed. Check the controller override and enter a reason before posting or reversing. Without that, the books stay as they are.",
        cause: "Post and Reverse stay refused in a soft-closed month until the controller override and a reason are both present.",
        fix: "Tick I am the controller and I am changing this soft-closed month, enter a reason, then Post or Reverse.",
      },
      {
        symptom: "SPE-MPL is Pipeline, not Owned. Month-end close does not post journals for this deal.",
        cause: "Month-end close posts journals only for Owned deals. Pipeline deals are not on the Deals list.",
        fix: "Open Library, click the deal name, set Deal status to Owned, enter a reason, and confirm. That posts the saved broker T12. Do not look for the deal under Deals.",
      },
      {
        symptom: "SPE-X is Pipeline, not Owned. Soft close and hard close are only for Owned deals. This month was not closed.",
        cause: "Soft close and hard close refuse a deal that is not Owned. Period Close disables Pipeline, Screened, and Test the same way.",
        fix: "Move the deal to Owned on the deal profile first, or pick an Owned SPE. This month was not closed.",
      },
      {
        symptom: "Unmapped lines are in suspense. Map every line before a hard lock.",
        cause: "Unmapped lines sit in suspense 1999 and block hard lock.",
        fix: "Remember the RCP account for each line, then Hard lock.",
      },
      {
        symptom: "Suspense 1999 must be zero before a hard lock",
        cause: "A non-zero suspense balance blocks hard lock.",
        fix: "Map the unmapped lines so 1999 nets to zero.",
      },
      {
        symptom: "Hard lock requires a soft-closed period",
        cause: "Hard lock is allowed only after soft close.",
        fix: "Click Soft close, finish the checklist, then Hard lock.",
      },
      {
        symptom: "Hard lock requires a controller checklist",
        cause: "Hard lock needs the controller checklist to exist.",
        fix: "Open the checklist and mark every item DONE or N/A.",
      },
      {
        symptom: "Hard lock requires every checklist item to be DONE or N/A",
        cause: "An open checklist item blocks hard lock.",
        fix: "Complete the remaining checklist rows, then Hard lock.",
      },
      {
        symptom: "Reopen requires a non-empty reason and ticket",
        cause: "Reopen always needs both a reason and a ticket.",
        fix: "Enter a reason and a ticket, then Reopen.",
      },
      {
        symptom: "Closed months are not overwritten. Reopen with a reason and a ticket.",
        cause: "A hard-locked month rejects another post.",
        fix: "Reopen with a reason and a ticket, then upload the replacement.",
      },
      {
        symptom: "This month is hard-locked. Reopen it with a reason and a ticket before uploading a replacement.",
        cause: "Uploads are refused on a hard-locked month.",
        fix: "Reopen with a reason and a ticket first.",
      },
      {
        symptom: "Cannot post to a locked period",
        cause: "The period is hard-locked.",
        fix: "Reopen with a reason and a ticket.",
      },
      {
        symptom: "Period is soft-closed; only controller adjustments are allowed",
        cause: "A soft-closed month needs the controller override.",
        fix: "Check the controller override and enter a reason.",
      },
      {
        symptom: "Soft close is allowed only from OPEN",
        cause: "The month is already soft-closed or hard-locked.",
        fix: "Reopen first if you need the month open again.",
      },
      {
        symptom: "Period is already open",
        cause: "Reopen was clicked on a month that is already open.",
        fix: "Leave it open and Post the correction.",
      },
      {
        symptom: "A reason is required to reverse operating journals.",
        cause: "Reverse operating journals requires a reason.",
        fix: "Enter a reason. In a soft-closed month also check the controller override.",
      },
      {
        symptom: "This SPE is soft-archived. Restore it from Deal Archive before posting to the books.",
        cause: "An archived SPE cannot take a month-end post.",
        fix: "Restore it from Deal Archive, then post.",
      },
      {
        symptom: "This SPE is soft-archived. Restore it from Deal Archive before uploading a month-end package.",
        cause: "An archived SPE cannot take a close upload.",
        fix: "Restore it from Deal Archive first.",
      },
      {
        symptom: "Drop at least one file.",
        cause: "Post was sent with no file.",
        fix: "Drop the financials and the rent roll, then Post this period into the SPE books.",
      },
    ],
    sourceRefs: [
      "src/lib/close/workspace.ts:402-414",
      "src/lib/close/workspace.ts:447-451",
      "src/lib/close/workspace.ts:546-578",
      "src/lib/close/workspace.ts:1094-1168",
      "src/lib/close/guards.ts:24-29",
      "src/lib/period-close.ts:104-105",
      "packages/ledger/src/close.ts:103-152",
      "packages/properties/src/tie-outs.ts:95-104",
      "src/app/deals/[code]/close/page.tsx:16-31",
    ],
  },
  {
    id: "waterfall.deal",
    feature: "Deal waterfall",
    routes: ["/deals/[code]/waterfall"],
    apiRoutes: ["/api/deals/[code]/waterfall"],
    navPath: "Deals → Owned SPE card → LP/GP waterfall → Save",
    keywords: [
      /lp\/gp waterfall|set the (?:lp|deal) waterfall|deal waterfall/i,
      /waterfall template|simple pref|institutional catch-up|multi-hurdle|look-through|american \/ deal|european/i,
      /unpaid pref|unreturned capital|typed 0|typed zero|left empty/i,
      /distributed today|operating cash available|period cfads|available to distribute/i,
      /catch-up %|catch-up percent|catch-up row|50\/50/i,
      /co-gp partner|add a co-gp/i,
    ],
    steps: [
      "Gold nav Deals → the Owned SPE card → LP/GP waterfall. A non-Owned deal opens the waterfall from the deal profile.",
      "Click a template, or edit the tiers table for a custom structure. Add a Co-GP with a name, % of GP promote/catch-up/residual, and % of GP co-invest.",
      "Read the preview and click Save. Catch-up % is the GP share of each catch-up dollar. The GP target follows the residual row.",
      "If SPE cash were distributed today, that number uses operating cash available. It excludes reserves, escrow, and tenant deposits. It is not period CFADS.",
    ],
    facts: [
      "Templates are 100% look-through (the default), Simple pref + promote, Institutional catch-up, Multi-hurdle IRR, American deal-by-deal, and European whole-fund. Custom means edit the tiers table.",
      "Catch-up % is the GP share of each catch-up dollar. The GP target follows the residual row. It is not a 50/50 split on the catch-up row. A typed 0 stays 0.",
      "Unreturned capital left empty, or blank, means LP contributed, and a typed 0 stays 0. Unpaid pref left empty, or blank, means none carried in, and a typed 0 stays 0.",
      "If SPE cash were distributed today uses operating cash available. That excludes reserves, escrow, and tenant deposits. It is not period CFADS.",
      "Co-GP stays at the deal. OpCo uses the RCP share after Save.",
    ],
    troubleshooting: [
      {
        symptom: "Pick a waterfall template (including 100% look-through).",
        cause: "Save was sent without a template id.",
        fix: "Click a template chip, including 100% look-through, then Save.",
      },
      {
        symptom: "Waterfall is per property SPE, not HoldCo or OpCo.",
        cause: "The waterfall is stored on the property SPE.",
        fix: "Open the SPE card and use LP/GP waterfall there. The OpCo proforma only aggregates Owned SPEs.",
      },
    ],
    sourceRefs: [
      "packages/ledger/src/waterfall.ts:27-34",
      "packages/ledger/src/waterfall.ts:343-376",
      "src/components/deals/waterfall-form.tsx:289-384",
      "src/components/deals/waterfall-form.tsx:501-505",
      "src/app/deals/[code]/waterfall/page.tsx:101-104",
      "src/lib/waterfall.ts:559-605",
    ],
  },
  {
    id: "proforma.forward",
    feature: "OpCo and deal proformas",
    routes: ["/opco/proforma", "/deals/[code]/proforma"],
    navPath: "Deal proforma on the SPE, or OpCo proforma at /opco/proforma",
    keywords: [
      /opco proforma/i,
      /deal proforma/i,
      /hold years|exit assumptions|cfads growth/i,
      /by spe table|pipeline deal/i,
      /co-gp's share|opco gp line/i,
    ],
    steps: [
      "Open the deal proforma from the SPE (/deals/{code}/proforma) or the OpCo proforma at /opco/proforma.",
      "Change Hold (years), CFADS growth, and Exit proceeds. Click through the same saved waterfall. The By SPE table includes Owned SPEs only. A Pipeline deal stays in the Library. Co-GP stays at the deal. The OpCo GP line is the RCP platform.",
    ],
    facts: [
      "Proformas are forward-looking and do not post to the books. They are not historical books.",
      "The inputs are Hold (years), CFADS growth, and Exit proceeds (the field is labeled Exit equity proceeds). There is no exit cap input.",
      "The OpCo proforma By SPE table sums Owned SPEs only. A Pipeline deal stays in the Library and is left out.",
      "Co-GP stays at the deal. The OpCo GP line is the RCP platform, not the Co-GP.",
    ],
    troubleshooting: [
      {
        symptom: "The Pipeline deal is missing from the OpCo proforma By SPE table.",
        cause: "The OpCo proforma aggregates Owned SPEs only.",
        fix: "Move the deal to Owned from the deal profile if RCP has closed, or leave it in the Library.",
      },
    ],
    sourceRefs: [
      "src/components/deals/proforma-view.tsx:221-224",
      "src/components/deals/proforma-view.tsx:321-367",
      "src/lib/waterfall.ts:318-320",
    ],
  },
  {
    id: "distributions.ledger",
    feature: "Distribution ledger",
    routes: ["/deals/[code]/distributions"],
    apiRoutes: [
      "/api/deals/[code]/distributions",
      "/api/deals/[code]/distributions/[eventId]",
      "/api/deals/[code]/distributions/[eventId]/reverse",
    ],
    navPath: "Deals → Owned SPE card → Distributions → Preview allocation → Confirm and post",
    keywords: [
      /record a distribution/i,
      /wrong amount|download csv|distribution history|as csv/i,
      /before the latest distribution|preview this amount before confirming|dated before|before an existing month|forward only/i,
      /(?:distribution|posted).{0,80}already has one|wrong deal|delete that row/i,
      /where we are in the waterfall|which waterfall tier/i,
      /soft-archived|distributions are not posted/i,
      /another distribution was just recorded/i,
      /undo|mistake|\breverse\b/i,
    ],
    steps: [
      "Gold nav Deals → the Owned SPE card → Distributions.",
      "Enter an amount greater than zero, choose operating cash or a capital event, click Preview allocation, then Confirm and post.",
      "Use Download CSV, read History, and read the Where we are in the waterfall gauge. Monthly investor pack links use the same ledger.",
      "To correct a posting, click Reverse on the latest row only.",
    ],
    facts: [
      "Preview, then confirm. Confirm posts only the same amount and date you previewed. The amount must be greater than zero.",
      "Corrections use Reverse on the latest active row only. There is no opposite-amount posting and no delete of a posted row.",
      "The page has Download CSV, History, and the Where we are in the waterfall gauge. Those figures also feed the monthly investor pack.",
      "The ledger posts forward only. A distribution is refused when a later month already has one, or when the date is before the latest posted distribution.",
      "A soft-archived SPE must be restored from Deal Archive before a distribution. A deal that is not Owned cannot post one either.",
    ],
    troubleshooting: [
      {
        symptom: "That period is before the latest distribution (2026-08). Pick that month or a later one.",
        cause: "Distributions post forward only. 2026-08 is the latest posted month in this example.",
        fix: "Pick 2026-08 or a later month. Reverse the latest row first if that posting was wrong.",
      },
      {
        symptom: "Preview this amount before confirming.",
        cause: "Confirm only posts the exact amount you previewed. The amount or date changed, or the preview was skipped.",
        fix: "Preview the same amount again, then Confirm. If someone else posted, you will see Another distribution was just recorded. Refresh and preview again.",
      },
      {
        symptom: "Another distribution was just recorded. Refresh and preview again.",
        cause: "A concurrent post moved the ledger after your preview.",
        fix: "Refresh and preview the exact amount again.",
      },
      {
        symptom: "This SPE is soft-archived. Restore it from Deal Archive before recording a distribution.",
        cause: "The form locks on a soft-archived SPE.",
        fix: "Open Deal Archive (/archive) and Restore, then record the distribution.",
      },
      {
        symptom: "not Owned. Distributions are not posted for this deal.",
        cause: "Distributions post only for Owned deals.",
        fix: "Move the deal to Owned on the deal profile, with a reason and confirm, then return to Distributions.",
      },
      {
        symptom: "That distribution is already reversed.",
        cause: "The row was reversed already.",
        fix: "Leave it. Reverse is only for the latest active row.",
      },
      {
        symptom: "Reverse the latest distribution first so the running totals stay in order.",
        cause: "Older rows cannot be reversed out of order.",
        fix: "Reverse the latest row first.",
      },
      {
        symptom: "A reversing row cannot be edited or reversed again.",
        cause: "A reversal row is not reversible.",
        fix: "Post a new distribution if more cash should move. Do not edit the reversal.",
      },
      {
        symptom: "Posted distributions cannot be edited. Record a reversing distribution instead.",
        cause: "PATCH is refused. The product action is Reverse, not an edit.",
        fix: "Click Reverse on the latest row.",
      },
      {
        symptom: "Posted distributions cannot be deleted. Record a reversing distribution instead.",
        cause: "DELETE is refused.",
        fix: "Click Reverse on the latest row.",
      },
      {
        symptom: "Amount must be whole cents",
        cause: "The API expects integer cents.",
        fix: "Enter a dollar amount. The form sends whole cents.",
      },
      {
        symptom: "Source must be operating cash or a capital event.",
        cause: "The source was not one of the two choices.",
        fix: "Choose operating cash or a capital event, preview, then confirm.",
      },
      {
        symptom: "Pick a period such as 2026-08.",
        cause: "The period was blank or not YYYY-MM.",
        fix: "Pick a month such as 2026-08.",
      },
      {
        symptom: "Distribution date is not valid.",
        cause: "The date could not be read.",
        fix: "Pick a valid date on or after the latest distribution.",
      },
      {
        symptom: "A distribution has to be more than zero. A typed 0 stays 0 and is not posted.",
        cause: "Zero is not a distribution.",
        fix: "Enter an amount greater than zero, preview, then confirm.",
      },
    ],
    sourceRefs: [
      "src/lib/distribution-ledger.ts:41-53",
      "src/lib/distribution-ledger.ts:195-249",
      "src/lib/distribution-ledger.ts:650-659",
      "src/app/deals/[code]/distributions/page.tsx:59-103",
      "src/components/deals/distribution-form.tsx:51-57",
      "src/components/deals/distribution-charts.tsx:129",
    ],
  },
  {
    id: "library.statuses",
    feature: "Deal Library statuses and roll-up",
    routes: ["/library", "/deals/[code]"],
    apiRoutes: ["/api/deals/[code]/status"],
    navPath: "Library → deal name → Deal status → Owned → reason → Confirm",
    keywords: [
      /deal statuses|pipeline, screened, owned/i,
      /archived and test|opco numbers|in the opco/i,
      /move it to owned|broker t12|screened deal|pipeline to owned|change status/i,
      /to test|permanent demo/i,
      /archive a pipeline|not on the deals list/i,
      /stop counting in opco|without deleting/i,
    ],
    steps: [
      "Open Library to see Pipeline, Screened, Owned, Archived, and Test.",
      "To move a Screened deal to Owned, open the deal name, set Deal status to Owned, enter a reason, and confirm. SPE-WBG, SPE-CVC, and SPE-HCR are permanent demo deals and cannot leave Owned. Test is reserved for the Phase 4 purge because Test would take the deal out of the roll-up.",
      "To archive a Pipeline deal, click Delete on the Library row. On the deal profile, open the Archive this deal section and click the Delete button inside it. Type the SPE code. It lands in Deal Archive.",
    ],
    facts: [
      "Statuses are Pipeline, Screened, Owned, Archived, and Test. Only Owned deals are in the OpCo numbers, month-end close, packs, proforma, and dashboards.",
      "The saved broker T12 is posted into the SPE books when you confirm a move to Owned.",
      "SPE-WBG, SPE-CVC, and SPE-HCR are permanent demo deals and cannot leave Owned. Test is reserved for the Phase 4 purge because Test would take the deal out of the roll-up.",
      "A deal with a posted distribution or a closed month is books-locked. It can leave Owned only through Archive (Delete, then type the SPE code). This screen will not remove it.",
      "Status cannot be set to Archived on this screen. Use Deal Archive. An archived deal must be restored before the status can change.",
      "Pipeline and Screened deals are not on the Deals page. Find them in the Library.",
      "To stop counting a deal in the OpCo numbers without deleting it, set Deal status to Pipeline or Screened.",
    ],
    troubleshooting: [
      {
        symptom: "Choose Pipeline, Screened, Owned, or Test.",
        cause: "The status value was not one of those four.",
        fix: "Pick Pipeline, Screened, Owned, or Test. Archived uses Deal Archive instead.",
      },
      {
        symptom: "Archived is the existing Deal Archive. Use Delete on the Deals list and type the SPE code. This screen does not archive or delete.",
        cause: "Deal status cannot be set to Archived directly.",
        fix: "Use Delete on the Deals row for an Owned deal. For a non-Owned deal, use Delete on the Library row, or open the Archive this deal section on the deal profile and click Delete.",
      },
      {
        symptom: "Say why you are changing the status.",
        cause: "A reason is required.",
        fix: "Enter a reason, then confirm.",
      },
      {
        symptom: "is Archived. Restore it from Deal Archive if it should come back. Restoring does not delete anything.",
        cause: "An archived deal must be restored before a status change.",
        fix: "Open Deal Archive and Restore, then change the status if you still need to.",
      },
      {
        symptom: "Tagging it Test is left for the Phase 4 purge tool, because Test would take it out of the roll-up.",
        cause: "Permanent demo SPEs (SPE-WBG, SPE-CVC, SPE-HCR) cannot leave Owned.",
        fix: "Leave the demo deal Owned. Do not create another SPE to stand in for Test.",
      },
      {
        symptom: "SPE-WBG is a permanent demo SPE. It cannot be deleted. It stays on the live Deals list and in the OpCo roll-up.",
        cause: "WBG, CVC, and HCR are locked Owned demo deals.",
        fix: "Leave them Owned. They stay in the roll-up.",
      },
      {
        symptom: "has a posted distribution or a closed month. It can leave Owned only through the existing Archive",
        cause: "Books-locked deals cannot move back to Pipeline.",
        fix: "Use Delete and type the SPE code so the deal goes to Deal Archive. The ledger stays.",
      },
      {
        symptom: "The saved broker T12 will be posted into the books.",
        cause: "Confirming Owned posts the saved broker T12.",
        fix: "Confirm only if RCP has closed on the deal.",
      },
      {
        symptom: "SPE-X has a saved broker T12 for YYYY-MM, and that month is soft-closed. Marking the deal Owned would post that T12 into the books, and only an open month can take it. The status was not changed.",
        cause: "Moving to Owned posts the saved broker T12, and that month is not open.",
        fix: "Reopen that month with a reason and a ticket, or wait until it is open, then mark the deal Owned again. The status was not changed.",
      },
      {
        symptom: "SPE-X could not be marked Owned because its broker T12 for YYYY-MM failed to post. The status was not changed.",
        cause: "The status change and the broker T12 post are one step. If the post fails, nothing is saved.",
        fix: "Fix the T12 month so it can post, then mark the deal Owned again. The deal stays at its prior status.",
      },
    ],
    sourceRefs: [
      "src/lib/deal-status.ts:35-63",
      "src/lib/deal-status.ts:88-155",
      "src/lib/owned-spe.ts:10-19",
      "src/app/deals/[code]/page.tsx:54-63",
      "src/components/library/library-workspace.tsx:345-349",
      "src/app/deals/page.tsx:61-64",
    ],
  },
  {
    id: "library.criteria",
    feature: "Deal Library criteria, fields, and snapshots",
    routes: ["/library"],
    apiRoutes: [
      "/api/library/presets",
      "/api/library/snapshots/backfill",
      "/api/library/fees",
      "/api/library/picks",
      "/api/deals/[code]/library",
      "/api/deals/[code]/snapshot",
    ],
    navPath: "Library → + Add criterion → Hard limit or Preference → Save preset",
    keywords: [
      /add criterion|hard limit|1\.25|save that as a preset|meet my criteria/i,
      /cap rate/i,
      /phase 2|fee needed|lp net irr/i,
      /purchase price|save g&a|opco g&a budget|library fields/i,
      /backfill analysis snapshots|show test deals|export csv|no snapshot|stale · 180/i,
    ],
    steps: [
      "On Library, click + Add criterion. Pick DSCR, type 1.25, and set Hard limit. Add State is Georgia (GA). Click Save preset. Cap rate is annualized NOI divided by purchase price. Stale is amber at 90 days and red at 180.",
      "Enter purchase price, metro, and AM fee on the deal profile (Library fields). OpCo G&A is Library → Fees → Save G&A.",
      "Click Backfill analysis snapshots, Export CSV, and Show Test deals. Columns and Reset columns sit beside them.",
    ],
    facts: [
      "Hard limit filters the list. Preference is stored for the Phase 3 optimizer and does not exclude a deal yet.",
      "LP net IRR, LP cash yield, and RCP IRR are calculated in Phase 2 after debt service and fees. fee needed means the AM fee or the other LP fee is blank. A hard limit excludes every deal that is missing the number. exit value needed means no sale was entered or NOI cannot value the property, so IRR does not pass. cash shortfall, no distribution means operations do not cover debt service. fee accrued, unpaid is the fee still owed. loan exceeds exit value means the sale leaves no equity and the IRR is still calculated.",
      "Cap rate is annualized NOI divided by purchase price. It stays blank without a price or NOI. Enter the price, then Save analysis snapshot or Backfill analysis snapshots.",
      "No snapshot means no analysis snapshot yet. Stale is amber at 90 days and red at 180 days. Age never deletes a deal or a file.",
      "Show Test deals is off until you tick it. Export CSV downloads the passing rows and the visible columns.",
      "Deal profile fields live at /deals/{code}, reached from Library fields on an Owned card or the deal name in the Library.",
    ],
    troubleshooting: [
      {
        symptom: "LP net IRR says Phase 2 · fee needed",
        cause: "fee needed means the AM fee or the other LP fee is blank. A hard limit excludes every deal that is missing LP net IRR.",
        fix: "Enter the AM fee and the other LP fee on the deal profile, then read the number. A blank fee is not a guessed percent.",
      },
      {
        symptom: "No snapshot",
        cause: "The deal has no analysis snapshot yet.",
        fix: "Click Save analysis snapshot on the deal profile, or Backfill analysis snapshots on Library.",
      },
      {
        symptom: "Could not save snapshots.",
        cause: "Backfill analysis snapshots failed.",
        fix: "Retry Backfill analysis snapshots. Older snapshots are kept when it succeeds.",
      },
    ],
    sourceRefs: [
      "src/lib/library/criteria.ts:64-96",
      "src/lib/library/criteria.ts:276-278",
      "src/lib/library/staleness.ts:6-29",
      "src/lib/library/snapshot.ts:139-141",
      "src/lib/library/fees.ts:1-21",
      "src/components/library/library-workspace.tsx:241-291",
      "src/components/library/criteria-builder.tsx:126-212",
    ],
  },
  {
    id: "add-deal.intake",
    feature: "Add Deal intake",
    routes: ["/deals/new", "/deals"],
    apiRoutes: [
      "/api/deals",
      "/api/deals/intake",
      "/api/deals/intake/files",
      "/api/deals/intake/blob",
      "/api/deals/intake/import",
      "/api/deals/intake/from-email",
      "/api/deals/intake/from-dropbox",
      "/api/deals/intake/scan-mailbox",
    ],
    navPath: "Deals → Add Deal (/deals/new) → Create the SPE → Deal status",
    keywords: [
      /add a new deal/i,
      /pipeline instead of owned|mark it as pipeline|create the spe|step 5/i,
      /413|6 mb|blob|offering memorandum|\bom\b/i,
      /broker package|just to screen|in the opco numbers/i,
    ],
    steps: [
      "Gold nav Deals → Add Deal (/deals/new). Drop the OM, rent roll, or T12. Files upload one at a time, 32 MB each.",
      "On step 5, Create the SPE, set the Deal status select. Owned is the default. Pick Pipeline or Screened if you are only screening. If a screened deal landed in the OpCo numbers, open the deal profile from the Library and change the status.",
      "Files over about 3.5 MB go through Vercel Blob when BLOB_READ_WRITE_TOKEN is set. The function body cap is about 4.5 MB.",
    ],
    facts: [
      "Deal status is on step 5, Create the SPE. Owned is the default and posts the broker T12. Pipeline, Screened, and Test do not post T12 journals.",
      "Upload-first auto-ingest creates the SPE with that default status. Skipping step 5 still uses Owned.",
      "If a screened upload landed in the OpCo numbers, open the deal profile from the Library and set Deal status to Pipeline or Screened, unless a posted distribution or a closed month forces Archive.",
      "XLSX is first-class. A 5.5 MB OM is valid when Blob is connected.",
    ],
    troubleshooting: [
      {
        symptom: "413",
        cause: "A file around 6 MB hit the Vercel function body cap near 4.5 MB. Files over about 3.5 MB should use Blob, up to 32 MB.",
        fix: "Connect BLOB_READ_WRITE_TOKEN (Vercel → Storage → Blob) and upload again. Without Blob, upload the smaller Excel files first.",
      },
      {
        symptom: "could not map columns",
        cause: "The rent roll headers were not recognized.",
        fix: "Read Detected headers. Do not invent units. Apply / Re-apply rent roll after the columns map.",
      },
    ],
    sourceRefs: [
      "src/components/deals/add-deal-wizard.tsx:154",
      "src/components/deals/add-deal-wizard.tsx:923-943",
      "src/lib/deals/apply.ts:41-53",
      "src/lib/deals/apply.ts:230-238",
      "src/lib/deals/auto-ingest.ts:67",
    ],
  },
  {
    id: "archive.lifecycle",
    feature: "Delete, Archive, and Restore",
    routes: ["/archive", "/deals"],
    apiRoutes: ["/api/deals/[code]/delete", "/api/archive/[code]/restore"],
    navPath: "Delete → type the SPE code → Deal Archive → Restore",
    keywords: [
      /where do deleted|bring one back|deal archive/i,
      /crestview|spe-cvc|why can't i delete/i,
      /posted distribution or a closed month|back to pipeline/i,
      /type the spe code/i,
      /get it back|archived the wrong|\brestore\b/i,
    ],
    steps: [
      "Click Delete on the Deals row (Owned) or the Library row (not Owned). On the deal profile, the Archive this deal section is a heading; the button inside it is Delete.",
      "Read the impact, then type the SPE code.",
      "Open gold nav Deal Archive (/archive) and click Restore with the same two-step confirm.",
    ],
    facts: [
      "Delete is a soft-archive, not a hard wipe. Books, ledgers, and vault files stay.",
      "Permanent demo SPEs SPE-WBG, SPE-CVC (Crestview Commons), and SPE-HCR cannot be deleted.",
      "A books-locked Owned deal, one with a posted distribution or a closed month, can leave the live list only through Archive.",
      "There is no Archive tab under Deals.",
      "To get it back after you archived the wrong SPE, open Deal Archive and Restore. Books, ledgers, and vault files stay.",
    ],
    troubleshooting: [
      {
        symptom: "Type the SPE code to confirm.",
        cause: "The confirm box was empty.",
        fix: "Type the SPE code exactly, then confirm.",
      },
      {
        symptom: "Confirmation must match the SPE code",
        cause: "The typed code did not match.",
        fix: "Type the letters and numbers of the SPE code exactly.",
      },
      {
        symptom: "SPE-CVC is a permanent demo SPE. It cannot be deleted. It stays on the live Deals list and in the OpCo roll-up.",
        cause: "Crestview Commons (SPE-CVC) is locked, along with SPE-WBG and SPE-HCR.",
        fix: "Leave the permanent demo SPE on the live list.",
      },
      {
        symptom: "is already in Deal Archive.",
        cause: "The SPE is already archived.",
        fix: "Restore it from Deal Archive if it should come back.",
      },
      {
        symptom: "is already a live deal. Restore is only for archived SPEs.",
        cause: "Restore was used on a deal that is not archived.",
        fix: "Leave it on Deals or Library. Restore is only for Deal Archive.",
      },
      {
        symptom: "Only SPEs can be deleted or restored.",
        cause: "HoldCo and OpCo are not deletable here.",
        fix: "Delete or restore a property SPE only.",
      },
    ],
    sourceRefs: [
      "src/lib/archive.ts:120-166",
      "src/lib/archive-copy.ts:2-18",
      "src/lib/deal-status.ts:58-63",
      "src/components/deals/archive-deal-button.tsx:6-25",
    ],
  },
  {
    id: "packs.investor",
    feature: "Investor packs and scheduler",
    routes: ["/narratives/packs/[packId]", "/reports/packs", "/scheduler", "/narratives"],
    apiRoutes: ["/api/scheduler/run"],
    navPath: "Narratives → Monthly Investor Pack → PDF or PPTX",
    keywords: [
      /monthly investor pack/i,
      /pdf or powerpoint|powerpoint|pptx/i,
      /actually recorded|waterfall estimate|illustrative/i,
      /pipeline deal.{0,60}(?:pack|monthly)/i,
      /email the quarterly|does not email|quarterly lender pack/i,
    ],
    steps: [
      "Gold nav Narratives → Monthly Investor Pack (or Quarterly Lender Pack).",
      "Export PDF or PPTX. The scheduler writes the same files on a cadence. Distribution figures come from the distribution ledger. The current-period waterfall stays illustrative and separate.",
    ],
    facts: [
      "Packs are PDF and PPTX. They are not emailed. The scheduler writes files and does not email.",
      "Only Owned SPEs are in the monthly investor pack. A Pipeline deal is skipped, and the scheduler skips non-Owned deals.",
      "Distribution figures come from the distribution ledger. The current-period waterfall is kept illustrative and separate.",
    ],
    troubleshooting: [
      {
        symptom: "Archived SPE is not in live financial packs. Restore from Deal Archive.",
        cause: "Archived deals stay out of packs.",
        fix: "Restore from Deal Archive if the SPE should be Owned and included.",
      },
      {
        symptom: "is not Owned. Only Owned deals are included in live financial packs.",
        cause: "The scheduler and the pack skip Pipeline, Screened, and Test.",
        fix: "Mark the deal Owned before expecting it in the pack.",
      },
      {
        symptom: "HoldCo has no operating pack",
        cause: "Packs run for OpCo and Owned SPEs.",
        fix: "Switch to RCP-OPCO or an Owned SPE.",
      },
    ],
    sourceRefs: [
      "src/lib/period-snapshot.ts:564",
      "src/lib/scheduler.ts:43-48",
      "packages/reporting/src/waterfall-view.ts:135-150",
    ],
  },
  {
    id: "dashboard.tiles",
    feature: "OpCo dashboard tiles",
    routes: ["/dashboard/[entityCode]"],
    navPath: "Dashboard → RCP-OPCO → G&A ratio and AM fee coverage tiles",
    keywords: [
      /percentage of am fee income|g&a % of am fee income|of am fee income/i,
      /g&a as a percentage|where do i see opco g&a/i,
      /am fee coverage/i,
      /g&a ratio|over 100%|fee income.{0,60}cover overhead|cover overhead/i,
      /not on the opco dashboard|pipeline.{0,40}dashboard/i,
      /which accounts.{0,80}g&a|g&a.{0,40}accounts/i,
      /7010|5110/i,
      /tile is empty|overhead coverage|coverage is empty|empty coverage tile/i,
    ],
    steps: [
      "Open Dashboard and switch to RCP-OPCO.",
      "Read the G&A ratio tile, (5110 + 5610 + 5990) ÷ 7010, and the AM fee coverage tile, 7010 ÷ (5110 + 5610 + 5990), shown as a multiple (x). Click a tile for the formula. A Pipeline deal is in the Library, not on this dashboard.",
    ],
    facts: [
      "G&A as a percentage of AM fee income is (5110 + 5610 + 5990) ÷ 7010 on the OpCo dashboard.",
      "If G&A is more than AM fee income, the G&A ratio shows over 100%, meaning fees don't cover overhead.",
      "AM fee coverage is 7010 ÷ posted OpCo G&A (5110 + 5610 + 5990), shown as a multiple (x). The tile reads those posted accounts and stays blank until OpCo G&A expenses are posted in the books. A zero denominator has no multiple.",
      "Library → Fees → Save G&A budget does not feed the AM fee coverage tile. That budget is used only by the Library.",
      "A Pipeline deal is not on the OpCo dashboard or the Deals page. It is in the Library. Only Owned deals roll up.",
    ],
    troubleshooting: [
      {
        symptom: "The AM fee coverage tile is blank.",
        cause: "The tile reads posted OpCo accounts 5110, 5610, and 5990. It stays blank until those OpCo G&A expenses are posted in the books, because a zero G&A denominator has no multiple.",
        fix: "Post OpCo G&A to 5110, 5610, or 5990 in the books. Library → Fees → Save G&A budget does not feed this tile. That budget is used only by the Library.",
      },
      {
        symptom: "The G&A ratio tile shows over 100%.",
        cause: "G&A is larger than AM fee income (7010).",
        fix: "That means fees don't cover overhead. Open the ratio drill-down for the accounts.",
      },
    ],
    sourceRefs: [
      "src/lib/dashboards.ts:862-881",
      "packages/analytics/src/formulas.ts:159-165",
      "packages/analytics/src/dictionary.ts:426-453",
    ],
  },
  {
    id: "dashboard.home",
    feature: "Dashboards",
    routes: ["/dashboard"],
    apiRoutes: [],
    navPath: "Dashboard",
    keywords: [/opco combined roll-up and spe property dashboards/i],
    steps: ["Open Dashboard.", "Pick RCP-OPCO or an Owned SPE. HoldCo has no operating dashboard."],
    facts: ["Dashboards show Owned SPE tiles and the OpCo roll-up.", "Pipeline deals are not listed here."],
    troubleshooting: [
      {
        symptom: "HoldCo has no operating dashboard",
        cause: "RCP-HOLD has no operating dashboard.",
        fix: "Switch to RCP-OPCO.",
      },
    ],
    sourceRefs: ["src/lib/expert/nav.ts:45-48", "src/app/api/dashboard/route.ts:15"],
  },
  {
    id: "dashboard.ratios",
    feature: "Ratio dictionary",
    routes: ["/dashboard/ratios"],
    navPath: "Dashboard → Ratios",
    keywords: [/ratio dictionary|live formula dictionary/i],
    steps: ["Open Ratios.", "Pick a ratio to see units and source. LTV and delinquency stay gated."],
    facts: ["The dictionary lists every live ratio. It does not invent LTV."],
    troubleshooting: [
      {
        symptom: "LTV is gated",
        cause: "There is no appraisal, so LTV is not computed from book cost.",
        fix: "Do not divide UPB by book cost. Read the loan file instead.",
      },
    ],
    sourceRefs: ["packages/analytics/src/dictionary.ts:410-412"],
  },
  {
    id: "dashboard.ratio-drill",
    feature: "Ratio drill-down",
    routes: ["/dashboard/ratios/[ratioId]"],
    navPath: "Dashboard tile → ratio drill-down",
    keywords: [/ratio drill-down|contributing accounts/i],
    steps: ["Click a dashboard tile.", "Read the formula and the contributing accounts."],
    facts: ["Drill-down links go to the operating statement, trial balance, debt, rent roll, or CapEx."],
    troubleshooting: [
      {
        symptom: "LTV is gated",
        cause: "LTV has no appraisal input.",
        fix: "Leave the tile gated. Do not invent a value.",
      },
    ],
    sourceRefs: ["src/lib/expert/nav.ts:16-21"],
  },
  {
    id: "deals.owned-list",
    feature: "Deals list",
    routes: ["/deals"],
    navPath: "Deals",
    keywords: [/owned spe list|saved add deal drafts/i],
    steps: [
      "Open Deals for the Owned SPE list and saved Add Deal drafts.",
      "Pipeline, Screened, and Test deals are on Library, not this list.",
    ],
    facts: [
      "Deals shows Owned SPEs only, plus saved drafts.",
      "Delete on an Owned row is a soft-archive. Non-Owned deals are deleted from the Library row.",
    ],
    troubleshooting: [
      {
        symptom: "The new Pipeline deal is not on Deals.",
        cause: "Only Owned SPEs are on this list.",
        fix: "Open Library and click the deal name.",
      },
    ],
    sourceRefs: ["src/app/deals/page.tsx:61-64", "src/lib/expert/nav.ts:250"],
  },
  {
    id: "profile.fields",
    feature: "Deal profile",
    routes: ["/deals/[code]"],
    navPath: "Library → deal name, or Deals → Library fields",
    keywords: [/deal profile|library fields|archive this deal|save analysis snapshot/i],
    steps: [
      "Open /deals/{code} from the Library deal name or the Library fields link.",
      "Edit purchase price, metro, and AM fee, then save. Use Deal status to move toward Owned.",
    ],
    facts: [
      "The deal profile holds library fields, fees, deal status, and Save analysis snapshot. For a non-Owned deal, Archive this deal is a section heading, and the button inside that section is Delete.",
      "A posted distribution or a closed month blocks leaving Owned except through Archive.",
    ],
    troubleshooting: [
      {
        symptom: "has a posted distribution or a closed month",
        cause: "The deal is books-locked.",
        fix: "Archive it with Delete and the SPE code. This screen will not move it back to Pipeline.",
      },
    ],
    sourceRefs: ["src/app/deals/[code]/page.tsx:40-71", "src/lib/deal-status.ts:58-63"],
  },
  {
    id: "reports.operating",
    feature: "Operating statement",
    routes: ["/reports/operating-statement"],
    apiRoutes: ["/api/budgets", "/api/reports/[statement]"],
    navPath: "Operating Statement",
    keywords: [/operating statement|budget vs actual/i],
    steps: ["Open the Operating Statement.", "Read GPR through NOI. AM fees sit below NOI. Budget vs actual is on this page."],
    facts: ["A budget CSV posts through the budgets API after you confirm a replace. Unknown CoA codes are refused."],
    troubleshooting: [
      {
        symptom: "Unknown CoA codes:",
        cause: "The budget file used an account that is not on the master chart.",
        fix: "Map the row to a real RCP account and import again.",
      },
    ],
    sourceRefs: ["src/app/api/budgets/route.ts:80-92", "src/lib/expert/nav.ts:60-65"],
  },
  {
    id: "reports.trial-balance",
    feature: "Trial balance",
    routes: ["/reports/trial-balance"],
    navPath: "Trial Balance",
    keywords: [/trial balance|debits must equal credits/i],
    steps: ["Open Trial Balance.", "Confirm debits equal credits for the selected period."],
    facts: ["Trial balance is as-of posted activity."],
    troubleshooting: [
      {
        symptom: "Debits do not equal credits.",
        cause: "A journal is out of balance or still draft.",
        fix: "Open the unbalanced journal and fix it before close.",
      },
    ],
    sourceRefs: ["src/lib/expert/nav.ts:67-70"],
  },
  {
    id: "reports.income",
    feature: "Income statement",
    routes: ["/reports/income-statement"],
    navPath: "Income Statement",
    keywords: [/income statement|book p\/l/i],
    steps: ["Open the Income Statement.", "Use the same NOI math as the operating statement, without budget columns."],
    facts: ["The income statement is book P/L. It does not post a close by itself."],
    troubleshooting: [
      {
        symptom: "The income statement is empty for this month.",
        cause: "No posted journals exist for the period.",
        fix: "Post the month from Month-end close on an Owned SPE.",
      },
    ],
    sourceRefs: ["src/lib/expert/nav.ts:72-75"],
  },
  {
    id: "reports.balance-sheet",
    feature: "Balance sheet",
    routes: ["/reports/balance-sheet"],
    navPath: "Balance Sheet",
    keywords: [/balance sheet report|assets = liabilities/i],
    steps: ["Open the Balance Sheet.", "Confirm assets equal liabilities plus equity, including unclosed NI and CIP 1460."],
    facts: ["CIP stays on 1460 until placed in service."],
    troubleshooting: [
      {
        symptom: "The balance sheet does not foot.",
        cause: "Unclosed net income or a suspense balance is out of place.",
        fix: "Clear suspense 1999 and review CIP 1460 before hard lock.",
      },
    ],
    sourceRefs: ["src/lib/expert/nav.ts:77-80"],
  },
  {
    id: "reports.cash-flow",
    feature: "Cash flow",
    routes: ["/reports/cash-flow"],
    navPath: "Cash Flow",
    keywords: [/cash flow statement|indirect method/i],
    steps: ["Open Cash Flow.", "Confirm ending cash ties to the balance sheet."],
    facts: ["Cash flow is the indirect method."],
    troubleshooting: [
      {
        symptom: "Ending cash does not tie to the balance sheet.",
        cause: "A cash account or the indirect bridge is off.",
        fix: "Compare the cash lines to the balance sheet for the same period.",
      },
    ],
    sourceRefs: ["src/lib/expert/nav.ts:82-85"],
  },
  {
    id: "narratives.tones",
    feature: "Narratives",
    routes: ["/narratives"],
    navPath: "Narratives",
    keywords: [/open narratives|audience tone|five audience/i],
    steps: ["Open Narratives.", "Pick LP, GP, IC, Lender, or Management. Export from the matching pack."],
    facts: [
      "All five tones use the same period snapshot. Only Owned SPEs are in the live packs.",
      "The product does not invent covenants.",
    ],
    troubleshooting: [
      {
        symptom: "HoldCo has no operating narrative",
        cause: "Narratives are for OpCo and Owned SPEs.",
        fix: "Switch off HoldCo.",
      },
    ],
    sourceRefs: ["src/lib/expert/nav.ts:55-58", "src/app/api/narratives/route.ts:17"],
  },
  {
    id: "properties.list",
    feature: "Properties",
    routes: ["/properties"],
    navPath: "Properties",
    keywords: [/properties list|spe list with unit counts/i],
    steps: ["Open Properties.", "Pick an SPE for the rent roll and occupancy."],
    facts: ["Occupancy comes from the rent roll, not GL 4020."],
    troubleshooting: [
      {
        symptom: "The SPE shows 0 units.",
        cause: "No rent roll has been applied.",
        fix: "Apply / Re-apply rent roll from Properties, Vault, or Dashboard.",
      },
    ],
    sourceRefs: ["src/lib/expert/nav.ts:176-178"],
  },
  {
    id: "properties.rent-roll",
    feature: "Property rent roll",
    routes: ["/properties/[code]"],
    apiRoutes: ["/api/rent-roll"],
    navPath: "Properties → SPE → rent roll",
    keywords: [/unit master|apply \/ re-apply rent roll|yardi lease charges dialect/i],
    steps: [
      "Open the SPE rent roll.",
      "Import CSV or XLSX and confirm replace. Dialects include Yardi Lease Charges, redIQ, broker flat, and the RCP template.",
    ],
    facts: ["The import replaces the SPE rent roll after you confirm. Occupancy is not derived from GL 4020."],
    troubleshooting: [
      {
        symptom: "Rent roll is SPE-only",
        cause: "OpCo and HoldCo have no unit master.",
        fix: "Open the property SPE and import there.",
      },
      {
        symptom: "Upload a rent-roll CSV or XLSX.",
        cause: "The file was missing or not a spreadsheet.",
        fix: "Upload a CSV or XLSX rent roll.",
      },
      {
        symptom: "could not map columns",
        cause: "Headers were not recognized.",
        fix: "Use the detected headers. Do not invent units.",
      },
    ],
    sourceRefs: ["src/app/api/rent-roll/route.ts:20", "src/app/api/rent-roll/route.ts:123", "src/lib/expert/nav.ts:93-98"],
  },
  {
    id: "debt.loans",
    feature: "Debt",
    routes: ["/debt"],
    navPath: "Debt",
    keywords: [/loan file|debt yield|do not invent ltv/i],
    steps: ["Open Debt.", "Read UPB, DSCR, and debt yield against the loan file thresholds."],
    facts: ["DSCR and debt yield come from the loan file. Do not invent LTV from book cost."],
    troubleshooting: [
      {
        symptom: "LTV is gated",
        cause: "No appraisal is on the loan file.",
        fix: "Leave LTV gated. Use DSCR and debt yield from the loan file.",
      },
    ],
    sourceRefs: ["src/lib/expert/nav.ts:181-184"],
  },
  {
    id: "capex.cip",
    feature: "CapEx and CIP",
    routes: ["/capex"],
    navPath: "CapEx",
    keywords: [/capex vs r&m|cip 1460|placed in service/i],
    steps: ["Open CapEx.", "Keep CIP on 1460 until it is placed in service. R&M (5210) stays in NOI."],
    facts: ["CapEx and repairs are classified here. CIP is not expense until placed in service."],
    troubleshooting: [
      {
        symptom: "CIP is still on 1460.",
        cause: "The asset has not been placed in service.",
        fix: "Leave it on 1460 until the in-service date, then reclass.",
      },
    ],
    sourceRefs: ["src/lib/expert/nav.ts:186-189"],
  },
  {
    id: "tax.bridge",
    feature: "Books-to-tax bridge",
    routes: ["/tax"],
    navPath: "Tax bridge",
    keywords: [/books-to-tax|tax bridge|does not file taxes/i],
    steps: ["Open the Tax bridge.", "Read book NI, depreciation, interest, and AM fees versus the tax columns."],
    facts: ["This system does not file taxes. The bridge is a CPA worksheet, not a tax consolidation."],
    troubleshooting: [
      {
        symptom: "This system does not file taxes.",
        cause: "There is no e-file and no signed return.",
        fix: "Export the worksheet for the CPA. Do not tell the user a return was filed.",
      },
    ],
    sourceRefs: ["src/lib/expert/nav.ts:204-209"],
  },
  {
    id: "tax.k1",
    feature: "K-1 export",
    routes: ["/tax/k1"],
    navPath: "Tax → K-1 export",
    keywords: [/k-1 export|partner capital rollforward/i],
    steps: ["Open K-1 export.", "Check beg + contrib − dist ± book NI = end, then export CSV or Excel for the CPA."],
    facts: ["The export is CPA prep. It is not a filed Schedule K-1."],
    troubleshooting: [
      {
        symptom: "The K-1 export is not a filed return.",
        cause: "The product stores partner capital only.",
        fix: "Send the file to the CPA. Do not say it was filed.",
      },
    ],
    sourceRefs: ["src/lib/expert/nav.ts:199-202"],
  },
  {
    id: "vault.documents",
    feature: "Document vault",
    routes: ["/vault"],
    apiRoutes: ["/api/vault", "/api/vault/blob", "/api/vault/[id]"],
    navPath: "Vault",
    keywords: [/file a lease in the vault|document vault|vault document/i],
    steps: [
      "Open Vault and drop the file on the entity (lease, loan, K-1, draw, insurance).",
      "Removing a vault document does not delete the SPE. Delete on the SPE is the soft-archive.",
    ],
    facts: [
      "Files over about 3.5 MB use the same Blob client upload as Add Deal, up to 32 MB, when BLOB_READ_WRITE_TOKEN is set.",
      "Vault is not a bank or PMS feed.",
    ],
    troubleshooting: [
      {
        symptom: "filename and blobUrl are required.",
        cause: "The Blob handle was incomplete.",
        fix: "Retry the upload. Large files need BLOB_READ_WRITE_TOKEN.",
      },
      {
        symptom: "Unknown document kind",
        cause: "The kind was not a vault kind.",
        fix: "Pick a listed kind such as lease, loan, or OM.",
      },
    ],
    sourceRefs: ["src/app/api/vault/route.ts:42", "src/app/api/vault/route.ts:110", "src/lib/expert/nav.ts:212-217"],
  },
  {
    id: "vendors.1099",
    feature: "1099 vendor hooks",
    routes: ["/vendors"],
    navPath: "1099",
    keywords: [/1099 vendor|vendor master/i],
    steps: ["Open 1099.", "Maintain the vendor master and the reportable overlay."],
    facts: ["Phase A AP has no invoice subledger. This is not a filed 1099."],
    troubleshooting: [
      {
        symptom: "year required",
        cause: "The 1099 report was requested without a year.",
        fix: "Pass the tax year and run the overlay again. It still does not file a 1099.",
      },
    ],
    sourceRefs: ["src/app/api/vendors/1099/route.ts:14", "src/lib/expert/nav.ts:225-228"],
  },
  {
    id: "unlock.principal",
    feature: "Principal unlock",
    routes: ["/unlock"],
    apiRoutes: ["/api/access"],
    navPath: "Unlock (/unlock)",
    keywords: [/principal unlock|principal_password|\/unlock/i],
    steps: ["Open /unlock.", "Enter PRINCIPAL_PASSWORD. Partner links stay read-only until then."],
    facts: ["Unlock writes the principal role. It is not multi-tenant auth. Do not send the password to LPs."],
    troubleshooting: [
      {
        symptom: "That password or share token is not valid.",
        cause: "The password or partner token did not match.",
        fix: "Re-enter PRINCIPAL_PASSWORD on /unlock, or the partner token on /partner.",
      },
      {
        symptom: "Partner view is read-only. Unlock to record a distribution.",
        cause: "A viewer session cannot post.",
        fix: "Unlock as principal, then retry the distribution.",
      },
    ],
    sourceRefs: ["src/app/unlock/page.tsx:35-39", "src/app/api/access/route.ts:39-40", "src/lib/distribution-ledger.ts:55-58"],
  },
  {
    id: "partner.view",
    feature: "Partner view",
    routes: ["/partner"],
    apiRoutes: ["/api/access"],
    navPath: "Partner view (/partner)",
    keywords: [/partner view|share token|read-only link/i],
    steps: ["Open /partner and paste the share token.", "The session can read dashboards, narratives, and packs only."],
    facts: ["Partner view is read-only. Add Deal and demo seed are off. Do not send a partner to a write screen."],
    troubleshooting: [
      {
        symptom: "That password or share token is not valid.",
        cause: "The share token did not match.",
        fix: "Ask for a fresh partner link. Do not use the principal password on this page.",
      },
    ],
    sourceRefs: ["src/app/partner/page.tsx:35-39", "src/app/api/access/route.ts:39-40"],
  },
  {
    id: "admin.seed",
    feature: "Load demo data",
    routes: ["/admin/seed"],
    apiRoutes: ["/api/admin/seed"],
    navPath: "Load demo data (/admin/seed)",
    keywords: [/load demo data|admin seed|empty deploy/i],
    steps: ["Open /admin/seed only on an empty deploy.", "Load the demo books. Do not use this on a live portfolio."],
    facts: ["This screen is admin-only demo seed. It does not file taxes and it is not a daily close step."],
    troubleshooting: [
      {
        symptom: "Demo data is already present. Check wipe only if you intend to replace it.",
        cause: "The deploy already has demo books, so Load demo data does not seed them again.",
        fix: "Leave existing books alone. Check wipe only if you intend to replace the demo database.",
      },
    ],
    sourceRefs: ["src/lib/expert/nav.ts:230"],
  },
  {
    id: "models.list",
    feature: "Models list",
    routes: ["/models"],
    apiRoutes: ["/api/models"],
    navPath: "Models → Create Model",
    keywords: [/create a model|models list|new model|copy a model|delete a model/i],
    steps: [
      "Gold nav Models. Type a name, pick Live or Test, and click Create Model.",
      "Copy makes a new Model with the same deals and assumptions. Delete Model removes the list only. The deal stays.",
      "Tick up to four Models and click Compare.",
    ],
    facts: [
      "A Model is a what-if list. Projection, not books. It does not post journals, write the distribution ledger, or change deal status.",
      "Models are owner-only, the same gate as Library.",
    ],
    troubleshooting: [
      {
        symptom: "Name the Model.",
        cause: "Create was clicked with a blank name.",
        fix: "Type a name, then Create Model.",
      },
    ],
    sourceRefs: ["src/app/models/page.tsx:1", "src/lib/models/store.ts:1", "src/lib/models/membership.ts:1"],
  },
  {
    id: "models.detail",
    feature: "Model detail",
    routes: ["/models/[id]"],
    apiRoutes: ["/api/models/[id]", "/api/models/[id]/deals", "/api/models/[id]/copy", "/api/models/[id]/criteria"],
    navPath: "Models → Model name → Add deal",
    keywords: [/add a deal to the model|remove a deal|not yet screened|optimizer eligible|model detail/i],
    steps: [
      "Open the Model. Pick a deal and click Add deal. Remove takes it off the Model only.",
      "Read RCP cash and LP cash by year, LP net IRR, LP cash yield Year 1 and average, RCP IRR, equity multiple, G&A coverage, and concentration.",
      "The banner says Projection, not books. Hard limits apply. Preference rows are stored and unused until the Phase 3 optimizer.",
    ],
    facts: [
      "Pipeline deals can be added and are flagged not yet screened. They are not optimizer eligible until Screened.",
      "Archived deals are view only and cannot be added. Test deals only go in a Test Model.",
      "A missing fee shows fee needed. Dependent returns stay blank, including cash by year. Returns are after debt service and fees. A missing debt payment says debt service needed. No exit value says exit value needed, and cash yield can still show. Fee income is the fee paid from cash after debt service. fee accrued, unpaid is shown apart from that income. If the sale cannot pay it, the note is fee unpaid at exit. cash shortfall, no distribution means no distribution that year. loan exceeds exit value is a real projection with exit equity at zero. If any included deal still needs an exit value, LP net IRR, RCP IRR, and the equity multiple say exit value needed for that many deals. A blank G&A budget says G&A budget needed.",
    ],
    troubleshooting: [
      {
        symptom: "Archived deals are view only. Restore one before it can go in a Model.",
        cause: "Archived is not addable.",
        fix: "Restore the deal from Deal Archive, then add it.",
      },
      {
        symptom: "Test deals only go in a Test Model.",
        cause: "A Test deal was added to a Live Model.",
        fix: "Create a Test Model, then add the Test deal there.",
      },
      {
        symptom: "That deal is already in this Model.",
        cause: "The deal is already a member.",
        fix: "Leave it, or Remove it and add it again.",
      },
    ],
    sourceRefs: ["src/app/models/[id]/page.tsx:1", "src/lib/models/membership.ts:1", "src/components/models/model-controls.tsx:1"],
  },
  {
    id: "models.compare",
    feature: "Compare Models",
    routes: ["/models/compare"],
    navPath: "Models → tick up to four → Compare",
    keywords: [/compare models|side by side|up to four/i],
    steps: ["On Models, tick up to four rows and click Compare.", "Read LP net IRR, LP yield, RCP IRR, and G&A coverage for each. The OpCo dashboard does not move."],
    facts: ["Compare shows at most four Models. Each one is still Projection, not books."],
    troubleshooting: [
      {
        symptom: "Compare up to 4 Models.",
        cause: "More than four ids were requested.",
        fix: "Untick until four or fewer remain, then Compare.",
      },
    ],
    sourceRefs: ["src/app/models/compare/page.tsx:1", "src/lib/models/membership.ts:1"],
  },
  {
    id: "models.assumptions",
    feature: "Model assumptions",
    routes: ["/models/[id]/assumptions"],
    apiRoutes: ["/api/models/[id]/assumptions"],
    navPath: "Models → Model name → Assumptions",
    keywords: [/model assumptions|exit cap|opco pref|hold years.{0,40}model|model.{0,40}hold years/i],
    steps: [
      "Open Assumptions. Set hold years and CFADS growth. Leave exit cap rate blank unless you mean a number.",
      "Optional OpCo pref needs both a rate and platform capital. Click Save assumptions.",
    ],
    facts: [
      "Blank exit value is not guessed. Sale proceeds stay out until an exit cap rate is typed. Without a sale, or when NOI cannot value the property, the screen says exit value needed. When the loan is larger than a computed sale, exit equity is zero and the screen says loan exceeds exit value, no sale proceeds. That IRR is still calculated.",
      "Assumptions belong to the Model. They do not change the live OpCo proforma.",
    ],
    troubleshooting: [
      {
        symptom: "exit value needed",
        cause: "No exit cap was typed, or NOI cannot value the property.",
        fix: "Type an exit cap and Save assumptions, or leave the combined IRR as exit value needed.",
      },
    ],
    sourceRefs: ["src/app/models/[id]/assumptions/page.tsx:1", "src/lib/returns/project-deal.ts:1"],
  },
  {
    id: "models.fees",
    feature: "Model fees",
    routes: ["/models/fees"],
    apiRoutes: ["/api/models/fees"],
    navPath: "Models → Fees settings",
    keywords: [/model fees|g&a coverage|fee needed|save g&a/i],
    steps: [
      "Open Models → Fees settings. Type the OpCo G&A budget and click Save G&A. Leave it blank and coverage says G&A budget needed.",
      "Type each deal's AM fee and other LP fees on the deal profile. Those dollars come off operations before the waterfall.",
    ],
    facts: [
      "A blank G&A budget says G&A budget needed. A blank deal fee says fee needed. Coverage and LP returns are not filled with a guessed number. Fee income counts fees paid from cash after debt service. fee accrued, unpaid is separate.",
      "Saving G&A does not post a journal.",
    ],
    troubleshooting: [
      {
        symptom: "fee needed",
        cause: "The AM fee or the other LP fee is blank.",
        fix: "Type the missing fee on the deal profile. A typed 0 is zero. Do not leave the box blank if you mean zero.",
      },
      {
        symptom: "G&A budget needed",
        cause: "The OpCo G&A budget is blank.",
        fix: "Type the OpCo G&A budget and click Save G&A. A typed 0 stays G&A budget is zero.",
      },
    ],
    sourceRefs: ["src/app/models/fees/page.tsx:1", "src/lib/library/fees.ts:1", "src/lib/returns/fees.ts:1"],
  },
  {
    id: "deals.asset-plan",
    feature: "Asset plan",
    routes: ["/deals/[code]/plan"],
    apiRoutes: ["/api/deals/[code]/plan"],
    navPath: "Deals → SPE card → Asset plan",
    keywords: [/asset plan|weekly update|income idea|what changed this week/i],
    steps: [
      "Open Deals, then the SPE card, then Asset plan. Pick the period in the navy header.",
      "Read the baseline. Blank means the input is missing. It is not a zero.",
      "Open Pricing and market. Enter a source, geography, as-of date, retrieved date, and a terms note, then click Save weekly update.",
      "Open Income ideas. Click Add income idea. On that idea, say why, then click Approve idea.",
      "Open Tracking log. The decision and the action are listed. Nothing was sent to a property manager.",
    ],
    facts: [
      "The plan is for one Owned deal. It uses that deal's rent roll and the selected period's books.",
      "RevPAU is period revenue divided by rentable units. Rentable units exclude down units. A zero rentable count stays blank.",
      "Pricing bands and monthly KPI targets stay blank until they are supplied. The blend method is phase1-no-blend-v1: observations are not weighted.",
      "Resident names, contacts, and unit balances are not shown. The app does not change rents or post journals from this page.",
    ],
    troubleshooting: [
      { symptom: "Asset management is for Owned deals only.", cause: "The deal is not Owned.", fix: "Open an Owned deal such as SPE-WBG." },
      { symptom: "Partner view is read-only. Unlock to update the asset plan.", cause: "The session is a viewer.", fix: "Unlock as Principal. There is no separate Owner role on this build." },
      { symptom: "Name the source and the as-of date.", cause: "The weekly update is missing a source or a date.", fix: "Enter both, then click Save weekly update." },
      { symptom: "Add a terms note that says this use is permitted.", cause: "The terms note is blank.", fix: "Say why this source may be used, then save." },
      { symptom: "Zillow ZORI needs the credit Data Provided by Zillow Group in the terms note.", cause: "A ZORI row is missing the required credit.", fix: "Type Data Provided by Zillow Group in the terms note." },
      { symptom: "This plan does not accept resident names or balances.", cause: "The request included a resident field.", fix: "Send only unit codes, property totals, and market observations." },
      { symptom: "Say why you are approving or declining.", cause: "The decision has no reason.", fix: "Type the reason, then click Approve idea or Decline idea." },
      { symptom: "Enter a category and a short name for the income idea.", cause: "The idea has no name.", fix: "Choose a category and type a short name." },
      { symptom: "That source is not permitted for a market feed in this phase.", cause: "The source is a blocked listing site, or the type is not one of the three allowed types.", fix: "Use a PM comp survey, a permitted public source, or a hand-uploaded ZORI file." },
      { symptom: "Enter a value, a range, or a trend note. Do not leave the observation blank.", cause: "The update has no figure.", fix: "Enter a dollar value, a range, or a trend note." },
      { symptom: "Name the geography, such as a ZIP, county, or metro.", cause: "Geography is blank.", fix: "Enter the ZIP, county, or metro." },
      { symptom: "Enter the date you retrieved this figure.", cause: "Retrieved date is blank.", fix: "Enter the date you retrieved it." },
      { symptom: "Only an idea can be approved or declined.", cause: "The idea was already decided, or it is not on this deal.", fix: "Add a new idea. The earlier decision stays in the log." },
      { symptom: "Enter a dollar amount with at most two decimals, or leave it blank.", cause: "A dollar field is not a plain amount.", fix: "Use dollars and cents, or leave the box blank." },
      { symptom: "Choose a weekly update, an income idea, or a decision.", cause: "The request did not say which action to take.", fix: "Use Save weekly update, Add income idea, or Approve idea." },
    ],
    sourceRefs: ["src/app/deals/[code]/plan/page.tsx:1", "src/lib/asset-mgmt/formulas.ts:1", "docs/RCP_ASSET_MANAGEMENT.md:1"],
  },
];

export function howToById(id: string): ExpertHowTo | undefined {
  return EXPERT_HOWTOS.find((entry) => entry.id === id);
}

export function findHowTos(question: string, pathname?: string, limit = 3): ExpertHowTo[] {
  const asked = question ?? "";
  const ranked = EXPERT_HOWTOS.map((entry, index) => {
    const routeMatch = pathname ? entry.routes.some((route) => routeMatches(route, pathname)) : false;
    let keywordScore = 0;
    for (const keyword of entry.keywords) {
      if (keyword.test(asked)) keywordScore += 1;
    }
    return { entry, index, routeMatch, keywordScore };
  });
  ranked.sort((a, b) => {
    if (a.routeMatch !== b.routeMatch) return a.routeMatch ? -1 : 1;
    if (a.keywordScore !== b.keywordScore) return b.keywordScore - a.keywordScore;
    return a.index - b.index;
  });
  return ranked
    .filter((row) => row.routeMatch || row.keywordScore > 0)
    .slice(0, Math.max(0, limit))
    .map((row) => row.entry);
}

export function publicHowTo(entry: ExpertHowTo) {
  return {
    id: entry.id,
    feature: entry.feature,
    routes: entry.routes,
    apiRoutes: entry.apiRoutes ?? [],
    navPath: entry.navPath,
    steps: entry.steps,
    facts: entry.facts,
    troubleshooting: entry.troubleshooting,
    sourceRefs: entry.sourceRefs,
  };
}

/**
 * Drop punctuation so a trailing ? or . does not hide a phrase that ends the string.
 * Hyphens stay, so month-end remains one word and does not match a bare "month end".
 */
function normalizeMatchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9%$ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function symptomMatchesQuestion(symptom: string, question: string): boolean {
  const q = normalizeMatchText(question);
  const s = normalizeMatchText(symptom);
  if (!s || !q) return false;
  if (q.includes(s)) return true;
  for (let length = Math.min(48, s.length); length >= 18; length -= 1) {
    for (let index = 0; index + length <= s.length; index += 1) {
      if (index > 0 && s[index - 1] !== " ") continue;
      const phrase = s.slice(index, index + length).trim();
      if (phrase.length >= 18 && q.includes(phrase)) return true;
    }
  }
  return false;
}

const FACT_STOP_WORDS = new Set([
  ...SYMPTOM_STOP_WORDS,
  "close",
  "closed",
  "post",
  "posted",
  "hard",
  "lock",
  "open",
  "only",
  "first",
  "needs",
  "deal",
  "deals",
  "month",
  "soft",
  "same",
  "again",
  "prior",
  "click",
  "enter",
  "leave",
  "stays",
  "means",
  "until",
]);

function factMatchesQuestion(fact: string, question: string): boolean {
  const factText = normalizeMatchText(fact);
  const asked = normalizeMatchText(question);
  for (let length = Math.min(42, asked.length); length >= 8; length -= 1) {
    for (let index = 0; index + length <= asked.length; index += 1) {
      if (index > 0 && asked[index - 1] !== " ") continue;
      const end = index + length;
      if (end < asked.length && asked[end] !== " ") continue;
      const phrase = asked.slice(index, end);
      if (!phrase.includes(" ")) continue;
      if (factText.includes(phrase)) return true;
    }
  }
  const tokens = (text: string) =>
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9%]+/)
        .filter((word) => word.length >= 6 && !FACT_STOP_WORDS.has(word)),
    );
  const askedTokens = tokens(question);
  const factTokens = tokens(fact);
  const questionWords = new Set(question.toLowerCase().split(/[^a-z0-9%]+/));
  const factWords = new Set(fact.toLowerCase().split(/[^a-z0-9%]+/));
  if (
    (questionWords.has("empty") || questionWords.has("blank")) &&
    (factWords.has("empty") || factWords.has("blank")) &&
    [...factTokens].some((word) => askedTokens.has(word))
  ) {
    return true;
  }
  let hits = 0;
  for (const word of factTokens) if (askedTokens.has(word)) hits += 1;
  return hits >= 2;
}

function boldMarkerCount(text: string): number {
  return text.split("**").length - 1;
}

/** Cut at a sentence end. Returns "" when the cap has no sentence boundary. */
function cutAtSentence(text: string, cap: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= cap) return trimmed;
  const slice = trimmed.slice(0, cap);
  let cut = -1;
  for (let index = slice.length - 1; index >= 0; index -= 1) {
    const ch = slice[index];
    if (ch !== "." && ch !== "?" && ch !== "!") continue;
    const next = slice[index + 1];
    if (next === undefined || next === " " || next === "\n" || next === '"' || next === ")") {
      cut = index + 1;
      break;
    }
  }
  if (cut >= 40) return slice.slice(0, cut).trim();
  const paragraph = slice.lastIndexOf("\n\n");
  if (paragraph >= 40) return slice.slice(0, paragraph).trim();
  return "";
}

/** Cut at a sentence, and never leave an opening ** without its close. */
function truncateAtSentence(text: string, cap: number): string {
  let out = cutAtSentence(text, cap);
  for (let pass = 0; pass < 4 && boldMarkerCount(out) % 2 === 1; pass += 1) {
    if (out.length + 2 <= cap && /[.!?]["')\]]?$/.test(out)) {
      const closed = out.replace(/([.!?])(["')\]]?)$/, "**$1$2");
      if (boldMarkerCount(closed) % 2 === 0) return closed;
    }
    const last = out.lastIndexOf("**");
    out = cutAtSentence(last >= 0 ? out.slice(0, last) : "", cap);
  }
  return out;
}

function formatHowToEntry(entry: ExpertHowTo): string {
  const lines = [`### ${entry.feature} (${entry.id})`, entry.navPath];
  entry.steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
  for (const fact of entry.facts) lines.push(`- ${fact}`);
  for (const row of entry.troubleshooting) {
    lines.push(`- If you see "${row.symptom}": ${row.cause} ${row.fix}`);
  }
  return lines.join("\n");
}

export function answerFromHowTos(question: string, pathname?: string): string | null {
  const found = findHowTos(question, pathname, 8);
  const scored = found.map((entry, index) => ({
    entry,
    index,
    score: entry.keywords.reduce((count, keyword) => (keyword.test(question) ? count + 1 : count), 0),
    route: pathname ? entry.routes.some((route) => routeMatches(route, pathname)) : false,
  }));
  scored.sort((a, b) => b.score - a.score || Number(b.route) - Number(a.route) || a.index - b.index);
  const best = scored.find((row) => row.score > 0);
  if (!best) return null;
  const entry = best.entry;
  const facts = entry.facts.filter((fact, index) => index === 0 || factMatchesQuestion(fact, question));
  const steps = entry.steps.map((step, index) => `${index + 1}. ${step}`).join("\n");
  const trouble = entry.troubleshooting
    .filter((row) => symptomMatchesQuestion(row.symptom, question))
    .map((row) => `**${row.symptom}** ${row.cause} ${row.fix}`)
    .join("\n");
  const body = [facts.join("\n\n"), "", entry.navPath, "", steps, trouble ? `\n${trouble}` : ""].join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return truncateAtSentence(body, HOWTO_ANSWER_CAP);
}

export function buildHowToReference(pathname: string, question: string): string {
  const hints = describePage(pathname).hints;
  const matches = findHowTos(question, pathname, 3);
  const lines = [
    "## How-to reference",
    "Trust this How-to reference and the getHowTo tool over your own assumptions. Quote exact button labels.",
    "",
  ];
  if (hints.length) {
    lines.push("Current page hints:");
    for (const hint of hints) lines.push(`- ${hint}`);
    lines.push("");
  }
  let text = lines.join("\n").trimEnd();
  for (const entry of matches) {
    const block = formatHowToEntry(entry);
    const next = `${text}\n\n${block}`;
    if (next.length <= HOWTO_REFERENCE_CAP) {
      text = next;
      continue;
    }
    const room = HOWTO_REFERENCE_CAP - text.length - 2;
    if (room >= 80) {
      const partial = truncateAtSentence(block, room);
      if (partial) text = `${text}\n\n${partial}`;
    }
    break;
  }
  return text;
}
