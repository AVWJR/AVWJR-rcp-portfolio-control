export type PeriodCloseStatus = "OPEN" | "SOFT_CLOSED" | "CLOSED";

export class PeriodLockedError extends Error {
  constructor(message = "Cannot post to a locked period") {
    super(message);
    this.name = "PeriodLockedError";
  }
}

export class PeriodSoftClosedError extends Error {
  constructor(message = "Period is soft-closed; only controller adjustments are allowed") {
    super(message);
    this.name = "PeriodSoftClosedError";
  }
}

export class ReopenRequiresReasonError extends Error {
  constructor(message = "Reopen requires a non-empty reason and ticket") {
    super(message);
    this.name = "ReopenRequiresReasonError";
  }
}

export class ChecklistIncompleteError extends Error {
  constructor(message = "Hard lock requires every checklist item to be DONE or N/A") {
    super(message);
    this.name = "ChecklistIncompleteError";
  }
}

export class InvalidCloseTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCloseTransitionError";
  }
}

export const CLOSE_CHECKLIST: { code: string; label: string; sortOrder: number }[] = [
  { code: "period_row", label: "Period row exists (YYYY-MM)", sortOrder: 10 },
  {
    code: "operating_journals",
    label: "Operating journals posted (rent, vacancy, concessions, other income, OpEx)",
    sortOrder: 20,
  },
  { code: "cash_apps", label: "Cash applications posted (collections, AP payments)", sortOrder: 30 },
  {
    code: "below_noi",
    label: "Below-NOI items posted: interest (6110), depreciation (6210), AM fee (6310/2310)",
    sortOrder: 40,
  },
  {
    code: "am_mirror",
    label: "OpCo AM fee mirror posted (1310/7010) and both sides balanced",
    sortOrder: 50,
  },
  { code: "trial_balance", label: "Trial Balance: debits equal credits", sortOrder: 60 },
  { code: "income_statement", label: "Income Statement: AM fees appear below NOI", sortOrder: 70 },
  {
    code: "balance_sheet",
    label: "Balance Sheet: assets = liabilities + equity (unclosed NI in equity)",
    sortOrder: 80,
  },
  { code: "cash_flow", label: "Cash Flow: beginning cash + net change = ending cash", sortOrder: 90 },
  {
    code: "rent_roll",
    label: "Rent roll / unit master confirmed (occupancy not derived from 4020)",
    sortOrder: 100,
  },
  {
    code: "budget_os",
    label: "Monthly budget confirmed; operating statement variance reviewed",
    sortOrder: 110,
  },
  {
    code: "breakeven",
    label: "Breakeven occupancy reviewed: (OpEx + interest + principal − other income) / GPR",
    sortOrder: 120,
  },
  {
    code: "debt_covenants",
    label: "Loan file: payment schedule, current/LT split, DSCR and debt yield vs thresholds",
    sortOrder: 130,
  },
  {
    code: "capex_cip",
    label: "CapEx vs R&M classified; CIP and placed-in-service journals reviewed",
    sortOrder: 140,
  },
  {
    code: "intercompany",
    label: "OpCo↔SPE intercompany 1310/2310 and AM 6310/7010 matched",
    sortOrder: 150,
  },
];

export function assertCanPostToPeriod(
  status: PeriodCloseStatus,
  opts: { allowControllerAdjustment?: boolean } = {},
) {
  if (status === "CLOSED") {
    throw new PeriodLockedError();
  }
  if (status === "SOFT_CLOSED" && !opts.allowControllerAdjustment) {
    throw new PeriodSoftClosedError();
  }
}

export function assertReopenReason(reason?: string | null, ticket?: string | null) {
  if (!reason?.trim() || !ticket?.trim()) {
    throw new ReopenRequiresReasonError();
  }
}

export function assertChecklistComplete(items: { status: string }[]) {
  if (items.length === 0) {
    throw new ChecklistIncompleteError("Hard lock requires a controller checklist");
  }
  const open = items.filter((item) => item.status !== "DONE" && item.status !== "NA");
  if (open.length > 0) {
    throw new ChecklistIncompleteError();
  }
}

export function assertSoftClose(status: PeriodCloseStatus) {
  if (status !== "OPEN") {
    throw new InvalidCloseTransitionError("Soft close is allowed only from OPEN");
  }
}

export function assertHardLock(status: PeriodCloseStatus) {
  if (status !== "SOFT_CLOSED") {
    throw new InvalidCloseTransitionError("Hard lock requires a soft-closed period");
  }
}

export function assertCanReopen(status: PeriodCloseStatus) {
  if (status === "OPEN") {
    throw new InvalidCloseTransitionError("Period is already open");
  }
}
