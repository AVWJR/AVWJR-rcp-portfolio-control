import { BLEND_METHOD } from "./formulas";

export const PLAN_NOT_OWNED = "Asset management is for Owned deals only.";
export const PLAN_VIEWER = "Partner view is read-only. Unlock to update the asset plan.";
export const PLAN_SOURCE_DATE = "Name the source and the as-of date.";
export const PLAN_TERMS = "Add a terms note that says this use is permitted.";
export const PLAN_ZORI_CREDIT = "Zillow ZORI needs the credit Data Provided by Zillow Group in the terms note.";
export const PLAN_RESIDENT = "This plan does not accept resident names or balances.";
export const PLAN_REASON = "Say why you are approving or declining.";
export const PLAN_INCOME_NAME = "Enter a category and a short name for the income idea.";
export const PLAN_BLOCKED_SOURCE = "That source is not permitted for a market feed in this phase.";
export const PLAN_NO_FIGURE = "Enter a value, a range, or a trend note. Do not leave the observation blank.";
export const PLAN_GEOGRAPHY = "Name the geography, such as a ZIP, county, or metro.";
export const PLAN_RETRIEVED = "Enter the date you retrieved this figure.";
export const PLAN_IDEA_ONLY = "Only an idea can be approved or declined.";
export const PLAN_AMOUNT = "Enter a dollar amount with at most two decimals, or leave it blank.";
export const PLAN_ACTION = "Choose a weekly update, an income idea, or a decision.";
export const PLAN_PERIOD = "Pick a period such as 2026-08.";
export const PLAN_PERIOD_RANGE = "Pick a month from 1990 through 2100, such as 2026-08.";
export const PLAN_DATE = "Use a real calendar date.";
export const PLAN_FUTURE = "That date is in the future. Use the date on the source.";
export const PLAN_RETRIEVED_ORDER = "The retrieved date cannot be earlier than the as-of date.";
export const PLAN_SETUP = "Asset plan setup is pending. The plan tables are not on this database yet.";

export const PRICING_BAND_NOTE =
  "Pricing band not supplied. This needs your approval. No recommended range is produced.";
export const TARGET_NOTE = "No business-plan target supplied.";
export const NO_OBSERVATION_NOTE = "No permitted market observation for this period.";
export const PMS_NOTE = "Recorded in RCP only. Nothing was sent to a property manager or written to the books.";

export class AssetPlanError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "AssetPlanError";
    this.status = status;
  }
}

export function assertCanMutatePlan(role: "principal" | "viewer" | null | undefined): void {
  if (role === "viewer") throw new AssetPlanError(PLAN_VIEWER, 403);
}

const RESIDENT_KEYS = new Set([
  "resident",
  "residentname",
  "residentid",
  "tenant",
  "tenantname",
  "email",
  "phone",
  "mobile",
  "ssn",
  "tin",
  "bank",
  "accountnumber",
  "balance",
  "balancecents",
  "paymenthistory",
  "screening",
  "creditscore",
  "dob",
  "dateofbirth",
]);

export function assertNoResidentKeys(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (RESIDENT_KEYS.has(key.toLowerCase().replace(/[^a-z0-9]/g, ""))) {
      throw new AssetPlanError(PLAN_RESIDENT);
    }
  }
}

const BLOCKED_SOURCE_PATTERNS: RegExp[] = [
  /apartments\.com/i,
  /apartment\s*list/i,
  /apartmentlist/i,
  /realtor\.com/i,
  /zumper/i,
  /rent\.com/i,
  /craigslist/i,
  /facebook\s*marketplace/i,
  /facebook\.com\/marketplace/i,
  /hotpads/i,
  /trulia/i,
  /apartment\s*guide/i,
  /forrent\.com/i,
];

/** Listing sites are blocked by name. A hand-uploaded ZORI file may name Zillow. */
export function sourceIsBlocked(sourceName: string, termsNote: string, sourceType: string): boolean {
  const hay = `${sourceName} ${termsNote}`;
  if (sourceType !== "ZORI" && /zillow/i.test(hay)) return true;
  return BLOCKED_SOURCE_PATTERNS.some((pattern) => pattern.test(hay));
}

export const SOURCE_TYPES = ["PM_COMP", "PUBLIC", "ZORI"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export type WeeklyInput = {
  sourceName: string;
  sourceType: SourceType;
  geography: string;
  floorplan: string | null;
  beds: number | null;
  valueCents: bigint | null;
  rangeLowCents: bigint | null;
  rangeHighCents: bigint | null;
  trendNote: string | null;
  specialsNote: string | null;
  vintageDate: string | null;
  asOfDate: string;
  retrievedAt: string;
  termsNote: string;
};

export const PLAN_YEAR_MIN = 1990;
export const PLAN_YEAR_MAX = 2100;

export function assertPlanPeriod(year: number, month: number): void {
  if (!Number.isInteger(year) || !Number.isInteger(month) || year < PLAN_YEAR_MIN || year > PLAN_YEAR_MAX || month < 1 || month > 12) {
    throw new AssetPlanError(PLAN_PERIOD_RANGE);
  }
}

export function parsePlanPeriod(value: unknown): { year: number; month: number } | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  if (!Number.isInteger(year) || !Number.isInteger(month) || year < PLAN_YEAR_MIN || year > PLAN_YEAR_MAX || month < 1 || month > 12) {
    return null;
  }
  return { year, month };
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function optionalText(value: unknown, max: number): string | null {
  const trimmed = text(value, max);
  return trimmed.length ? trimmed : null;
}

export function parseOptionalDollars(value: unknown): bigint | null {
  if (value == null) return null;
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) throw new AssetPlanError(PLAN_AMOUNT);
  const [whole, frac = ""] = cleaned.split(".");
  const cents = BigInt(whole ?? "0") * 100n + BigInt(frac.padEnd(2, "0"));
  return cents;
}

export function isRealCalendarDate(raw: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(5, 7));
  const day = Number(raw.slice(8, 10));
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function todayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function parseDate(value: unknown, missing: string): string {
  const raw = text(value, 10);
  if (!raw) throw new AssetPlanError(missing);
  if (!isRealCalendarDate(raw)) throw new AssetPlanError(PLAN_DATE);
  return raw;
}

function assertNotFuture(isoDate: string): void {
  if (isoDate > todayIso()) throw new AssetPlanError(PLAN_FUTURE);
}

function optionalDate(value: unknown): string | null {
  if (value == null || (typeof value === "string" && value.trim() === "")) return null;
  return parseDate(value, PLAN_SOURCE_DATE);
}

export function validateWeeklyUpdate(body: Record<string, unknown>): WeeklyInput {
  assertNoResidentKeys(body);
  const sourceName = text(body.sourceName, 120);
  const sourceType = text(body.sourceType, 20);
  const geography = text(body.geography, 120);
  const asOfDate = text(body.asOfDate, 10);
  const retrievedAt = text(body.retrievedAt, 10);
  const termsNote = text(body.termsNote, 500);
  if (!sourceName || !asOfDate) throw new AssetPlanError(PLAN_SOURCE_DATE);
  if (!isRealCalendarDate(asOfDate)) throw new AssetPlanError(PLAN_DATE);
  if (!geography) throw new AssetPlanError(PLAN_GEOGRAPHY);
  if (!retrievedAt) throw new AssetPlanError(PLAN_RETRIEVED);
  if (!isRealCalendarDate(retrievedAt)) throw new AssetPlanError(PLAN_DATE);
  assertNotFuture(asOfDate);
  assertNotFuture(retrievedAt);
  if (retrievedAt < asOfDate) throw new AssetPlanError(PLAN_RETRIEVED_ORDER);
  if (!termsNote) throw new AssetPlanError(PLAN_TERMS);
  if (!SOURCE_TYPES.includes(sourceType as SourceType)) throw new AssetPlanError(PLAN_BLOCKED_SOURCE);
  if (sourceIsBlocked(sourceName, termsNote, sourceType)) throw new AssetPlanError(PLAN_BLOCKED_SOURCE);
  if (sourceType === "ZORI" && !termsNote.includes("Data Provided by Zillow Group")) {
    throw new AssetPlanError(PLAN_ZORI_CREDIT);
  }
  const valueCents = parseOptionalDollars(body.valueCents ?? body.value);
  const rangeLowCents = parseOptionalDollars(body.rangeLowCents ?? body.rangeLow);
  const rangeHighCents = parseOptionalDollars(body.rangeHighCents ?? body.rangeHigh);
  const trendNote = optionalText(body.trendNote, 300);
  const specialsNote = optionalText(body.specialsNote ?? body.specials, 300);
  if (valueCents == null && rangeLowCents == null && rangeHighCents == null && !trendNote && !specialsNote) {
    throw new AssetPlanError(PLAN_NO_FIGURE);
  }
  let beds: number | null = null;
  if (body.beds != null && String(body.beds).trim() !== "") {
    const parsed = Number(body.beds);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 6) throw new AssetPlanError(PLAN_AMOUNT);
    beds = parsed;
  }
  const vintageDate = optionalDate(body.vintageDate);
  if (vintageDate) assertNotFuture(vintageDate);
  return {
    sourceName,
    sourceType: sourceType as SourceType,
    geography,
    floorplan: optionalText(body.floorplan, 40),
    beds,
    valueCents,
    rangeLowCents,
    rangeHighCents,
    trendNote,
    specialsNote,
    vintageDate,
    asOfDate,
    retrievedAt,
    termsNote,
  };
}

export type IncomeInput = {
  category: string;
  title: string;
  currentCaptureCents: bigint | null;
  fullRolloutCents: bigint | null;
  setupCostCents: bigint | null;
  ownerName: string | null;
  steps: string | null;
  legalNote: string | null;
};

export function validateIncomeIdea(body: Record<string, unknown>): IncomeInput {
  assertNoResidentKeys(body);
  const category = text(body.category, 40);
  const title = text(body.title, 120);
  if (!category || !title) throw new AssetPlanError(PLAN_INCOME_NAME);
  return {
    category,
    title,
    currentCaptureCents: parseOptionalDollars(body.currentCaptureCents ?? body.currentCapture),
    fullRolloutCents: parseOptionalDollars(body.fullRolloutCents ?? body.fullRollout),
    setupCostCents: parseOptionalDollars(body.setupCostCents ?? body.setupCost),
    ownerName: optionalText(body.ownerName, 80),
    steps: optionalText(body.steps, 500),
    legalNote: optionalText(body.legalNote, 500),
  };
}

export type DecisionInput = {
  opportunityId: string;
  decision: "APPROVE" | "DECLINE";
  reason: string;
  ownerName: string | null;
  dueDate: string | null;
};

export function validateDecision(body: Record<string, unknown>): DecisionInput {
  assertNoResidentKeys(body);
  const reason = text(body.reason, 500);
  if (!reason) throw new AssetPlanError(PLAN_REASON);
  const decision = text(body.decision, 10);
  if (decision !== "APPROVE" && decision !== "DECLINE") throw new AssetPlanError(PLAN_REASON);
  const opportunityId = text(body.opportunityId, 40);
  if (!opportunityId) throw new AssetPlanError(PLAN_IDEA_ONLY);
  return {
    opportunityId,
    decision,
    reason,
    ownerName: optionalText(body.ownerName, 80),
    dueDate: optionalDate(body.dueDate),
  };
}

export function decisionSideEffects(): { external: false; pmsWrite: false; deletesHistory: false } {
  return { external: false, pmsWrite: false, deletesHistory: false };
}

export function recommendedBand(): null {
  return null;
}

export function blendMethod() {
  return BLEND_METHOD;
}

const LEASE_DATE_KEYS = ["moveIn", "moveOut", "readyDate", "makeReadyDate"] as const;

export function publicLeaseDates(payload: unknown): {
  moveIn: string | null;
  moveOut: string | null;
  readyDate: string | null;
} {
  if (!payload || typeof payload !== "object") return { moveIn: null, moveOut: null, readyDate: null };
  const row = payload as Record<string, unknown>;
  const date = (key: string): string | null => {
    const value = row[key];
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
    return value.slice(0, 10);
  };
  return {
    moveIn: date("moveIn"),
    moveOut: date("moveOut"),
    readyDate: date("readyDate") ?? date("makeReadyDate"),
  };
}

export function leasePayloadKeepsPrivateFields(payload: unknown): boolean {
  const pub = JSON.stringify(publicLeaseDates(payload));
  if (!payload || typeof payload !== "object") return true;
  const row = payload as Record<string, unknown>;
  for (const key of Object.keys(row)) {
    if ((LEASE_DATE_KEYS as readonly string[]).includes(key)) continue;
    const value = row[key];
    if (typeof value === "string" && value.length > 1 && pub.includes(value)) return false;
  }
  return true;
}

export function excludeSelf<T extends { code: string }>(rows: readonly T[], code: string): T[] {
  const target = code.trim().toUpperCase();
  return rows.filter((row) => row.code.trim().toUpperCase() !== target);
}

export function dateAtNyNoon(isoDate: string): Date {
  return new Date(`${isoDate.slice(0, 10)}T16:00:00.000Z`);
}
