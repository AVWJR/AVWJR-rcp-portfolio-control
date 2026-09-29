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
    next12RolloverCount: next12,
  };
}
