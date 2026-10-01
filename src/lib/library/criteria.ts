/**
 * Sentence-style criteria. Library search uses hard limits only.
 * Preference rows are stored for the Phase 3 optimizer and do not filter here.
 * Models and the optimizer should import this module and CriteriaBuilder.
 *
 * Maximize (Phase 3) is intentionally not a control yet:
 * rcp_cash | rcp_irr | lp_net_irr | fee_income | ga_coverage.
 */

export const OPTIMIZER_PHASE = 3 as const;

export const CRITERION_GROUPS = ["Ratios", "LP returns", "Geography", "Property", "Waterfall", "Status"] as const;
export type CriterionGroup = (typeof CRITERION_GROUPS)[number];

export type CriterionOperator = "gte" | "gt" | "lte" | "lt" | "eq" | "in" | "not_in";
export type CriterionRole = "HARD_LIMIT" | "PREFERENCE";
export type ValueKind = "multiple" | "percent" | "dollars" | "integer" | "text";

export type CriterionField =
  | "dscr"
  | "debtYield"
  | "capRate"
  | "ltv"
  | "cashOnCash"
  | "occupancy"
  | "expenseRatio"
  | "pricePerUnit"
  | "units"
  | "lpNetIrr"
  | "lpCashYield"
  | "rcpIrr"
  | "state"
  | "metro"
  | "msa"
  | "submarket"
  | "city"
  | "propertyType"
  | "assetClass"
  | "vintageYear"
  | "businessPlan"
  | "prefRate"
  | "catchUp"
  | "coGp"
  | "equityRequired"
  | "dealStatus";

export type Criterion = {
  id: string;
  field: CriterionField;
  operator: CriterionOperator;
  /** Number for thresholds. String list for "is / is not". */
  value: number | string[];
  role: CriterionRole;
};

export type FieldDef = {
  field: CriterionField;
  group: CriterionGroup;
  label: string;
  kind: ValueKind;
  operators: CriterionOperator[];
  defaultOperator: CriterionOperator;
  defaultValue: number | string[];
  /** LP fields that also need a typed fee. */
  feeNeeded?: boolean;
};

export const OPERATOR_LABEL: Record<CriterionOperator, string> = {
  gte: "≥",
  gt: ">",
  lte: "≤",
  lt: "<",
  eq: "=",
  in: "is",
  not_in: "is not",
};

const NUMERIC: CriterionOperator[] = ["gte", "gt", "lte", "lt", "eq"];
const MEMBER: CriterionOperator[] = ["in", "not_in"];

export const FIELD_CATALOG: FieldDef[] = [
  { field: "dscr", group: "Ratios", label: "DSCR", kind: "multiple", operators: NUMERIC, defaultOperator: "gte", defaultValue: 1.25 },
  { field: "debtYield", group: "Ratios", label: "Debt yield", kind: "percent", operators: NUMERIC, defaultOperator: "gte", defaultValue: 8 },
  { field: "capRate", group: "Ratios", label: "Cap rate", kind: "percent", operators: NUMERIC, defaultOperator: "gte", defaultValue: 5 },
  { field: "ltv", group: "Ratios", label: "LTV", kind: "percent", operators: NUMERIC, defaultOperator: "lte", defaultValue: 75 },
  { field: "cashOnCash", group: "Ratios", label: "Cash-on-cash", kind: "percent", operators: NUMERIC, defaultOperator: "gte", defaultValue: 6 },
  { field: "occupancy", group: "Ratios", label: "Occupancy", kind: "percent", operators: NUMERIC, defaultOperator: "gte", defaultValue: 90 },
  { field: "expenseRatio", group: "Ratios", label: "Expense ratio", kind: "percent", operators: NUMERIC, defaultOperator: "lte", defaultValue: 45 },
  { field: "pricePerUnit", group: "Ratios", label: "Price per unit", kind: "dollars", operators: NUMERIC, defaultOperator: "lte", defaultValue: 200000 },
  { field: "units", group: "Property", label: "Units", kind: "integer", operators: NUMERIC, defaultOperator: "gte", defaultValue: 100 },
  { field: "lpNetIrr", group: "LP returns", label: "LP net IRR", kind: "percent", operators: NUMERIC, defaultOperator: "gte", defaultValue: 15, feeNeeded: true },
  { field: "lpCashYield", group: "LP returns", label: "LP cash yield", kind: "percent", operators: NUMERIC, defaultOperator: "gte", defaultValue: 6, feeNeeded: true },
  { field: "rcpIrr", group: "LP returns", label: "RCP IRR", kind: "percent", operators: NUMERIC, defaultOperator: "gte", defaultValue: 15, feeNeeded: true },
  { field: "state", group: "Geography", label: "State", kind: "text", operators: MEMBER, defaultOperator: "in", defaultValue: ["GA", "NC", "TX"] },
  { field: "metro", group: "Geography", label: "Metro", kind: "text", operators: MEMBER, defaultOperator: "in", defaultValue: [] },
  { field: "msa", group: "Geography", label: "MSA", kind: "text", operators: MEMBER, defaultOperator: "in", defaultValue: [] },
  { field: "submarket", group: "Geography", label: "Submarket", kind: "text", operators: MEMBER, defaultOperator: "in", defaultValue: [] },
  { field: "city", group: "Geography", label: "City", kind: "text", operators: MEMBER, defaultOperator: "in", defaultValue: [] },
  { field: "propertyType", group: "Property", label: "Property type", kind: "text", operators: MEMBER, defaultOperator: "in", defaultValue: ["Garden"] },
  { field: "assetClass", group: "Property", label: "Class", kind: "text", operators: MEMBER, defaultOperator: "in", defaultValue: ["B"] },
  { field: "vintageYear", group: "Property", label: "Vintage", kind: "integer", operators: NUMERIC, defaultOperator: "gte", defaultValue: 1980 },
  { field: "businessPlan", group: "Property", label: "Business plan", kind: "text", operators: MEMBER, defaultOperator: "in", defaultValue: ["Value-add"] },
  { field: "prefRate", group: "Waterfall", label: "LP pref", kind: "percent", operators: NUMERIC, defaultOperator: "gte", defaultValue: 7 },
  { field: "catchUp", group: "Waterfall", label: "Catch-up", kind: "percent", operators: NUMERIC, defaultOperator: "gte", defaultValue: 50 },
  { field: "coGp", group: "Waterfall", label: "Co-GP share", kind: "percent", operators: NUMERIC, defaultOperator: "lte", defaultValue: 50 },
  { field: "equityRequired", group: "Waterfall", label: "Equity required", kind: "dollars", operators: NUMERIC, defaultOperator: "lte", defaultValue: 25000000 },
  { field: "dealStatus", group: "Status", label: "Status", kind: "text", operators: MEMBER, defaultOperator: "in", defaultValue: ["Owned"] },
];

const BY_FIELD = new Map(FIELD_CATALOG.map((row) => [row.field, row]));

export function fieldDef(field: CriterionField): FieldDef {
  const def = BY_FIELD.get(field);
  if (!def) throw new Error(`Unknown criterion ${field}`);
  return def;
}

export type LibraryFact = {
  code: string;
  dscrBps: number | null;
  debtYieldBps: number | null;
  capRateBps: number | null;
  ltvBps: number | null;
  cashOnCashBps: number | null;
  occupancyBps: number | null;
  expenseRatioBps: number | null;
  pricePerUnitCents: number | null;
  unitCount: number | null;
  lpNetIrrBps: number | null;
  lpCashYieldBps: number | null;
  rcpIrrBps: number | null;
  state: string | null;
  metro: string | null;
  msa: string | null;
  submarket: string | null;
  city: string | null;
  propertyType: string | null;
  assetClass: string | null;
  vintageYear: number | null;
  businessPlan: string | null;
  prefRateBps: number | null;
  catchUpBps: number | null;
  coGpBps: number | null;
  equityRequiredCents: number | null;
  dealStatus: string;
  feeNeeded: boolean;
  /** Shown when the number is missing. A hard limit does not pass. */
  metricGaps?: Partial<Record<CriterionField, string>>;
};

export type Exclusion = { field: CriterionField; label: string; reason: string };

function newId(): string {
  return `c_${Math.random().toString(36).slice(2, 10)}`;
}

export function blankCriterion(field: CriterionField, id = newId()): Criterion {
  const def = fieldDef(field);
  return {
    id,
    field,
    operator: def.defaultOperator,
    value: Array.isArray(def.defaultValue) ? [...def.defaultValue] : def.defaultValue,
    role: "HARD_LIMIT",
  };
}

function toScaled(def: FieldDef, raw: number): number | null {
  if (!Number.isFinite(raw)) return null;
  if (def.kind === "multiple") return Math.round(raw * 10_000);
  if (def.kind === "percent") return Math.round(raw * 100);
  if (def.kind === "dollars") return Math.round(raw * 100);
  return Math.round(raw);
}

function factNumber(fact: LibraryFact, field: CriterionField): number | null {
  switch (field) {
    case "dscr":
      return fact.dscrBps;
    case "debtYield":
      return fact.debtYieldBps;
    case "capRate":
      return fact.capRateBps;
    case "ltv":
      return fact.ltvBps;
    case "cashOnCash":
      return fact.cashOnCashBps;
    case "occupancy":
      return fact.occupancyBps;
    case "expenseRatio":
      return fact.expenseRatioBps;
    case "pricePerUnit":
      return fact.pricePerUnitCents;
    case "units":
      return fact.unitCount;
    case "lpNetIrr":
      return fact.lpNetIrrBps;
    case "lpCashYield":
      return fact.lpCashYieldBps;
    case "rcpIrr":
      return fact.rcpIrrBps;
    case "vintageYear":
      return fact.vintageYear;
    case "prefRate":
      return fact.prefRateBps;
    case "catchUp":
      return fact.catchUpBps;
    case "coGp":
      return fact.coGpBps;
    case "equityRequired":
      return fact.equityRequiredCents;
    default:
      return null;
  }
}

function factText(fact: LibraryFact, field: CriterionField): string | null {
  switch (field) {
    case "state":
      return fact.state;
    case "metro":
      return fact.metro;
    case "msa":
      return fact.msa;
    case "submarket":
      return fact.submarket;
    case "city":
      return fact.city;
    case "propertyType":
      return fact.propertyType;
    case "assetClass":
      return fact.assetClass;
    case "businessPlan":
      return fact.businessPlan;
    case "dealStatus":
      return fact.dealStatus;
    default:
      return null;
  }
}

function compareNumber(operator: CriterionOperator, actual: number, target: number): boolean {
  if (operator === "gte") return actual >= target;
  if (operator === "gt") return actual > target;
  if (operator === "lte") return actual <= target;
  if (operator === "lt") return actual < target;
  if (operator === "eq") return actual === target;
  return false;
}

export function evaluateCriterion(fact: LibraryFact, criterion: Criterion): Exclusion | null {
  if (criterion.role === "PREFERENCE") return null;
  const def = BY_FIELD.get(criterion.field);
  if (!def) return null;

  if (def.kind === "text") {
    const selected = Array.isArray(criterion.value) ? criterion.value.map((row) => row.trim()).filter(Boolean) : [];
    if (!selected.length) return null;
    const actual = factText(fact, criterion.field);
    if (!actual) {
      // A blank value is not the excluded one, so "is not" passes. "Is" still excludes it.
      if (criterion.operator === "not_in") return null;
      return { field: criterion.field, label: def.label, reason: `${def.label} is not on file` };
    }
    const hit = selected.some((row) => row.toLowerCase() === actual.toLowerCase());
    const failed = criterion.operator === "not_in" ? hit : !hit;
    if (!failed) return null;
    const list = selected.join(", ");
    return {
      field: criterion.field,
      label: def.label,
      reason: criterion.operator === "not_in" ? `${def.label} is ${actual}` : `${def.label} is ${actual}, not ${list}`,
    };
  }

  const actual = factNumber(fact, criterion.field);
  if (actual == null) {
    const specific = fact.metricGaps?.[criterion.field];
    if (specific) {
      return { field: criterion.field, label: def.label, reason: `${def.label}: ${specific}` };
    }
    const fee = def.feeNeeded && fact.feeNeeded ? " · fee needed" : "";
    return { field: criterion.field, label: def.label, reason: `${def.label} is not on file${fee}` };
  }
  const raw = typeof criterion.value === "number" ? criterion.value : Number.NaN;
  const target = toScaled(def, raw);
  if (target == null || !def.operators.includes(criterion.operator)) return null;
  if (compareNumber(criterion.operator, actual, target)) return null;
  return {
    field: criterion.field,
    label: def.label,
    reason: `${def.label} is outside ${OPERATOR_LABEL[criterion.operator]} ${criterion.value}`,
  };
}

export function evaluateDeal(fact: LibraryFact, criteria: Criterion[]): Exclusion[] {
  return criteria.flatMap((row) => {
    const hit = evaluateCriterion(fact, row);
    return hit ? [hit] : [];
  });
}

export function passCount(facts: LibraryFact[], criteria: Criterion[]): { pass: number; total: number } {
  const total = facts.length;
  const pass = facts.filter((fact) => evaluateDeal(fact, criteria).length === 0).length;
  return { pass, total };
}

export function parseCriteria(input: unknown): Criterion[] {
  if (!Array.isArray(input)) return [];
  const rows: Criterion[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<Criterion>;
    if (typeof raw.field !== "string" || !BY_FIELD.has(raw.field as CriterionField)) continue;
    const def = fieldDef(raw.field as CriterionField);
    const operator = def.operators.includes(raw.operator as CriterionOperator) ? (raw.operator as CriterionOperator) : def.defaultOperator;
    let value: number | string[];
    if (def.kind === "text") {
      value = Array.isArray(raw.value) ? raw.value.filter((row): row is string => typeof row === "string") : [];
    } else {
      value = typeof raw.value === "number" && Number.isFinite(raw.value) ? raw.value : (def.defaultValue as number);
    }
    rows.push({
      id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
      field: def.field,
      operator,
      value,
      role: raw.role === "PREFERENCE" ? "PREFERENCE" : "HARD_LIMIT",
    });
  }
  return rows;
}

export function criteriaSentence(criterion: Criterion): string {
  const def = fieldDef(criterion.field);
  const op = OPERATOR_LABEL[criterion.operator];
  if (Array.isArray(criterion.value)) {
    const list = criterion.value.length ? criterion.value.join(", ") : "…";
    return `${def.label} ${op} ${list}`;
  }
  const suffix = def.kind === "multiple" ? "x" : def.kind === "percent" ? "%" : def.kind === "dollars" ? "" : "";
  const shown = def.kind === "dollars" ? criterion.value.toLocaleString("en-US") : String(criterion.value);
  return `${def.label} ${op} ${shown}${suffix}`;
}
