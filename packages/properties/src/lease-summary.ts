/** Lease-expiration and lease-term summary. Integer cents. Month buckets are calendar months. */

export type LeaseUnit = {
  unitCode: string;
  status: "OCCUPIED" | "VACANT" | "DOWN";
  marketRentCents: bigint;
  leaseRentCents: bigint;
  leaseStart: string | null;
  leaseEnd: string | null;
  moveIn: string | null;
  moveOut: string | null;
  mtm: boolean;
  balanceCents: bigint;
  depositCents: bigint;
  concessionCents?: bigint;
  onNotice?: boolean;
  substatus?: string;
};

export type ExpirationBucket = {
  key: string;
  label: string;
  count: number;
  leaseRentCents: bigint;
  marketRentCents: bigint;
  onNotice: number;
};

function parseIso(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthIndex(date: Date): number {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function labelMonth(index: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function wholeMonths(from: Date, to: Date): number {
  return monthIndex(to) - monthIndex(from);
}

export function leaseExpirationSummary(units: LeaseUnit[], asOfDate: string): {
  asOfDate: string;
  buckets: ExpirationBucket[];
  occupiedCount: number;
  rentableCount: number;
  mtmCount: number;
  moveIns: number;
  moveOuts: number;
  delinquencyCents: bigint;
  creditCents: bigint;
  depositsCents: bigint;
  averageRemainingMonths: number | null;
  rentWeightedRemainingMonths: number | null;
  averageOriginalMonths: number | null;
  rentWeightedOriginalMonths: number | null;
  quarters: ExpirationBucket[];
  next12RolloverCount: number;
} {
  const asOf = parseIso(asOfDate);
  const asOfMonth = asOf ? monthIndex(asOf) : 0;
  const occupied = units.filter((u) => u.status === "OCCUPIED");
  const buckets = new Map<string, ExpirationBucket>();

  const ensure = (key: string, label: string) => {
    const existing = buckets.get(key);
    if (existing) return existing;
    const created: ExpirationBucket = { key, label, count: 0, leaseRentCents: 0n, marketRentCents: 0n, onNotice: 0 };
    buckets.set(key, created);
    return created;
  };

  ensure("mtm", "MTM");
  ensure("expired", "Expired, not MTM");
  for (let m = 0; m < 12; m += 1) {
    const key = labelMonth(asOfMonth + m);
    ensure(key, m === 0 ? `${key} (this month)` : key);
  }
  ensure("13plus", "13+ months");
  ensure("none", "No lease end date");

  let remainingSum = 0;
  let remainingWeighted = 0n;
  let remainingRent = 0n;
  let weightedCount = 0;
  let originalSum = 0;
  let originalWeighted = 0n;
  let originalRent = 0n;
  let originalCount = 0;
  const quarters = new Map<string, ExpirationBucket>();

  for (const unit of occupied) {
    const rent = unit.leaseRentCents;
    if (unit.mtm) {
      const row = ensure("mtm", "MTM");
      row.count += 1;
      row.leaseRentCents += rent;
      row.marketRentCents += unit.marketRentCents;
      if (unit.onNotice) row.onNotice += 1;
      continue;
    }
    const end = parseIso(unit.leaseEnd);
    if (!end || !asOf) {
      const row = ensure("none", "No lease end date");
      row.count += 1;
      row.leaseRentCents += rent;
      continue;
    }
    if (end.getTime() < asOf.getTime()) {
      const row = ensure("expired", "Expired, not MTM");
      row.count += 1;
      row.leaseRentCents += rent;
      continue;
    }
    const offset = monthIndex(end) - asOfMonth;
    const key = offset >= 12 ? "13plus" : labelMonth(asOfMonth + Math.max(0, offset));
    const row = ensure(key, key === "13plus" ? "13+ months" : key);
    row.count += 1;
    row.leaseRentCents += rent;
    row.marketRentCents += unit.marketRentCents;
    if (unit.onNotice) row.onNotice += 1;
    const term = Math.max(0, wholeMonths(asOf, end));
    remainingSum += term;
    remainingWeighted += BigInt(term) * rent;
    remainingRent += rent;
    weightedCount += 1;
    const start = parseIso(unit.leaseStart);
    if (start) {
      const original = Math.max(0, wholeMonths(start, end));
      originalSum += original;
      originalWeighted += BigInt(original) * rent;
      originalRent += rent;
      originalCount += 1;
    }
    const qKey = `${end.getUTCFullYear()}-Q${Math.floor(end.getUTCMonth() / 3) + 1}`;
    const quarter = quarters.get(qKey) ?? { key: qKey, label: qKey, count: 0, leaseRentCents: 0n, marketRentCents: 0n, onNotice: 0 };
    quarter.count += 1;
    quarter.leaseRentCents += rent;
    quarter.marketRentCents += unit.marketRentCents;
    quarters.set(qKey, quarter);
  }

  const periodMonth = asOfDate.slice(0, 7);
  const moveIns = units.filter((u) => (u.moveIn ?? "").startsWith(periodMonth)).length;
  const moveOuts = units.filter((u) => (u.moveOut ?? "").startsWith(periodMonth)).length;
  let delinquencyCents = 0n;
  let creditCents = 0n;
  let depositsCents = 0n;
  for (const unit of units) {
    if (unit.balanceCents > 0n) delinquencyCents += unit.balanceCents;
    if (unit.balanceCents < 0n) creditCents += -unit.balanceCents;
    depositsCents += unit.depositCents;
  }

  const mtmCount = buckets.get("mtm")?.count ?? 0;
  const monthKeys = [...buckets.keys()].filter((key) => /^\d{4}-\d{2}$/.test(key));
  const next12 = monthKeys.reduce((acc, key) => acc + (buckets.get(key)?.count ?? 0), 0) + mtmCount;

  return {
    asOfDate,
    buckets: [...buckets.values()],
    occupiedCount: occupied.length,
    rentableCount: units.filter((u) => u.status !== "DOWN").length,
    mtmCount,
    moveIns,
    moveOuts,
    delinquencyCents,
    creditCents,
    depositsCents,
    averageRemainingMonths: weightedCount ? Math.round(remainingSum / weightedCount) : null,
    rentWeightedRemainingMonths:
      remainingRent > 0n ? Number((remainingWeighted + remainingRent / 2n) / remainingRent) : null,
    averageOriginalMonths: originalCount ? Math.round(originalSum / originalCount) : null,
    rentWeightedOriginalMonths:
      originalRent > 0n ? Number((originalWeighted + originalRent / 2n) / originalRent) : null,
    quarters: [...quarters.values()].sort((a, b) => a.key.localeCompare(b.key)),
    next12RolloverCount: next12,
  };
}

export type LeaseMasterRecord = {
  property_code: string;
  as_of_date: string | null;
  unit_code: string;
  building: string | null;
  unit_type: string;
  beds: number;
  baths_tenths: number;
  sqft: number;
  unit_status: string;
  unit_substatus: string;
  resident_id: string;
  resident_name: string;
  lease_start: string | null;
  lease_end: string | null;
  move_in_date: string | null;
  move_out_date: string | null;
  notice_date: string | null;
  market_rent: string;
  lease_rent: string;
  recurring_charges: { charge_code_raw: string; charge_class: string; amount_cents: string }[];
  concession_amount: string;
  concession_type: string | null;
  concession_total: string | null;
  concession_start: string | null;
  concession_end: string | null;
  amortization_method: string | null;
  security_deposit_held: string;
  balance_total: string;
  aging_current: string | null;
  aging_0_30: string | null;
  aging_31_60: string | null;
  aging_61_90: string | null;
  aging_90_plus: string | null;
  prepaid_balance: string;
  mtm_flag: boolean;
  renewal_status: string | null;
  source_rows: number[];
  extras: Record<string, string>;
  dialect: string | null;
};

function extraDate(extras: Record<string, string>, keys: string[]): string | null {
  for (const key of Object.keys(extras)) {
    const norm = key.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (keys.some((candidate) => norm === candidate.replace(/[^a-z0-9]+/g, ""))) {
      const value = extras[key]?.slice(0, 10);
      return value || null;
    }
  }
  return null;
}

/** All 29 §8.1 fields. lease_start is not copied from move-in. property_code is the SPE code. */
export function leaseMasterRecord(opts: {
  propertyCode: string;
  asOfDate: string | null;
  dialect: string | null;
  unitCode: string;
  building: string | null;
  unitType: string;
  beds: number;
  bathsTenths: number;
  sqft: number;
  status: string;
  substatus: string;
  residentId: string;
  residentName: string;
  leaseStart: string | null;
  leaseEnd: string | null;
  moveIn: string | null;
  moveOut: string | null;
  marketRentCents: bigint;
  leaseRentCents: bigint;
  concessionCents: bigint;
  depositCents: bigint;
  balanceCents: bigint;
  charges: { chargeCode: string; chargeClass: string; amountCents: bigint }[];
  extras: Record<string, string>;
  sourceRows: number[];
}): LeaseMasterRecord {
  const leaseStart = opts.leaseStart ?? extraDate(opts.extras, ["leasestart", "leasefrom"]);
  const notice = extraDate(opts.extras, ["noticedate", "ntvdate", "noticegiven"]);
  const moveOut = opts.moveOut ?? extraDate(opts.extras, ["moveout", "moveoutdate"]);
  const asOf = opts.asOfDate ? new Date(`${opts.asOfDate.slice(0, 10)}T00:00:00.000Z`) : null;
  const end = opts.leaseEnd ? new Date(`${opts.leaseEnd.slice(0, 10)}T00:00:00.000Z`) : null;
  const mtm =
    opts.extras.mtm_flag === "true" ||
    opts.substatus === "MTM" ||
    Boolean(asOf && end && end.getTime() < asOf.getTime() && opts.status === "OCCUPIED" && opts.extras.mtm_flag !== "false");
  const prepaid = opts.balanceCents < 0n ? -opts.balanceCents : 0n;
  return {
    property_code: opts.propertyCode,
    as_of_date: opts.asOfDate,
    unit_code: opts.unitCode,
    building: opts.building,
    unit_type: opts.unitType,
    beds: opts.beds,
    baths_tenths: opts.bathsTenths,
    sqft: opts.sqft,
    unit_status: opts.status,
    unit_substatus: opts.substatus || opts.status,
    resident_id: opts.residentId,
    resident_name: opts.residentName,
    lease_start: leaseStart,
    lease_end: opts.leaseEnd,
    move_in_date: opts.moveIn,
    move_out_date: moveOut,
    notice_date: notice,
    market_rent: opts.marketRentCents.toString(),
    lease_rent: opts.leaseRentCents.toString(),
    recurring_charges: opts.charges.map((charge) => ({
      charge_code_raw: charge.chargeCode,
      charge_class: charge.chargeClass,
      amount_cents: charge.amountCents.toString(),
    })),
    concession_amount: opts.concessionCents.toString(),
    concession_type: opts.extras.concession_type || null,
    concession_total: opts.extras.concession_total || null,
    concession_start: extraDate(opts.extras, ["concessionstart"]),
    concession_end: extraDate(opts.extras, ["concessionend"]),
    amortization_method: opts.extras.amortization_method || null,
    security_deposit_held: opts.depositCents.toString(),
    balance_total: opts.balanceCents.toString(),
    aging_current: opts.extras.aging_current || null,
    aging_0_30: opts.extras.aging_0_30 || null,
    aging_31_60: opts.extras.aging_31_60 || null,
    aging_61_90: opts.extras.aging_61_90 || null,
    aging_90_plus: opts.extras.aging_90_plus || null,
    prepaid_balance: prepaid.toString(),
    mtm_flag: mtm,
    renewal_status: opts.extras.renewal_status || null,
    source_rows: opts.sourceRows,
    extras: opts.extras,
    dialect: opts.dialect,
  };
}
