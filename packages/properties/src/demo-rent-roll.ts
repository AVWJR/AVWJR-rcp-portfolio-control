import { dollars } from "@rcp/ledger";
import type { UnitSnapshot, UnitStatus } from "./types";

export type SpeRentRollSpec = {
  speCode: string;
  unitCount: number;
  /** Target rent-roll GPR (rentable market rent), integer cents — should match GL 4010. */
  gpr: bigint;
  /** Target vacancy loss (vacant market rent), integer cents — should match GL 4020. */
  vacancy: bigint;
  /** Target concessions on occupied units — should match GL 4030. */
  concessions: bigint;
  downCount: number;
  floorplans: { code: string; beds: number; bathsTenths: number; sqft: number; weight: number; rent: number }[];
  /** Average in-place as a fraction of market on occupied (e.g. 0.95). */
  inPlaceRatio: number;
};

/**
 * Seed GL targets for 2026-08. Rent-roll market / vacancy / concessions are
 * forced to these exact cent totals so the operating statement and rent roll agree.
 */
export const SPE_RENT_ROLL_SPECS: SpeRentRollSpec[] = [
  {
    speCode: "SPE-WBG",
    unitCount: 264,
    gpr: dollars(339_240),
    vacancy: dollars(27_140),
    concessions: dollars(8_480),
    downCount: 0,
    inPlaceRatio: 0.95,
    floorplans: [
      { code: "A1", beds: 1, bathsTenths: 10, sqft: 700, weight: 80, rent: 1125 },
      { code: "B1", beds: 2, bathsTenths: 10, sqft: 900, weight: 88, rent: 1295 },
      { code: "B2", beds: 2, bathsTenths: 20, sqft: 1050, weight: 64, rent: 1410 },
      { code: "C1", beds: 3, bathsTenths: 20, sqft: 1200, weight: 32, rent: 1595 },
    ],
  },
  {
    speCode: "SPE-CVC",
    unitCount: 192,
    gpr: dollars(272_640),
    vacancy: dollars(8_180),
    concessions: dollars(2_720),
    downCount: 0,
    inPlaceRatio: 0.99,
    floorplans: [
      { code: "A", beds: 1, bathsTenths: 10, sqft: 750, weight: 64, rent: 1240 },
      { code: "B", beds: 2, bathsTenths: 20, sqft: 1100, weight: 96, rent: 1485 },
      { code: "C", beds: 3, bathsTenths: 20, sqft: 1300, weight: 32, rent: 1695 },
    ],
  },
  {
    speCode: "SPE-HCR",
    unitCount: 84,
    gpr: dollars(99_120),
    vacancy: dollars(11_894),
    concessions: dollars(4_956),
    downCount: 4,
    inPlaceRatio: 0.92,
    floorplans: [
      { code: "S", beds: 0, bathsTenths: 10, sqft: 500, weight: 16, rent: 925 },
      { code: "A", beds: 1, bathsTenths: 10, sqft: 650, weight: 40, rent: 1140 },
      { code: "B", beds: 2, bathsTenths: 10, sqft: 850, weight: 28, rent: 1325 },
    ],
  },
];

function distributeCents<T>(
  items: T[],
  delta: bigint,
  get: (item: T) => bigint,
  set: (item: T, value: bigint) => void,
): void {
  if (items.length === 0 || delta === 0n) return;
  const n = BigInt(items.length);
  const per = delta / n;
  let rem = delta % n;
  for (const item of items) {
    let next = get(item) + per;
    if (rem > 0n) {
      next += 1n;
      rem -= 1n;
    } else if (rem < 0n) {
      next -= 1n;
      rem += 1n;
    }
    if (next <= 0n) {
      throw new Error("distributeCents would make an amount non-positive");
    }
    set(item, next);
  }
}

function allocateCounts(weights: number[], total: number): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (w / sum) * total);
  const floors = raw.map((n) => Math.floor(n));
  let leftover = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((n, i) => ({ i, frac: n - floors[i] }))
    .sort((a, b) => b.frac - a.frac);
  for (const item of order) {
    if (leftover <= 0) break;
    floors[item.i] += 1;
    leftover -= 1;
  }
  return floors;
}

function ny(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, 16, 0, 0));
}

function leaseFor(index: number, occupied: boolean): { start: Date | null; end: Date | null } {
  if (!occupied) return { start: null, end: null };
  const startMonth = 1 + (index % 12);
  const startYear = startMonth > 8 ? 2025 : 2026;
  const termMonths = 12;
  const endMonth = ((startMonth - 1 + termMonths) % 12) + 1;
  const endYear = startMonth + termMonths > 12 ? startYear + 1 : startYear;
  const endDay = endMonth === 2 ? 28 : 30;
  return { start: ny(startYear, startMonth, 1), end: ny(endYear, endMonth, endDay) };
}

/**
 * Build a deterministic rent roll whose rentable market-rent, vacant market-rent,
 * and occupied concessions equal the spec targets exactly (integer cents).
 */
export function buildDemoRentRoll(spec: SpeRentRollSpec): UnitSnapshot[] {
  if (spec.downCount + 1 > spec.unitCount) {
    throw new Error(`${spec.speCode}: downCount too large`);
  }
  const rentableCount = spec.unitCount - spec.downCount;
  const counts = allocateCounts(
    spec.floorplans.map((f) => f.weight),
    spec.unitCount,
  );

  const units: UnitSnapshot[] = [];
  let seq = 1;
  for (let f = 0; f < spec.floorplans.length; f++) {
    const fp = spec.floorplans[f];
    for (let n = 0; n < counts[f]; n++) {
      const building = 1 + Math.floor((seq - 1) / 12);
      const num = 100 * building + (((seq - 1) % 12) + 1);
      units.push({
        unitCode: String(num),
        floorplan: fp.code,
        beds: fp.beds,
        bathsTenths: fp.bathsTenths,
        sqft: fp.sqft,
        status: "OCCUPIED",
        marketRent: dollars(fp.rent),
        inPlaceRent: 0n,
        leaseStart: null,
        leaseEnd: null,
        concessionCents: 0n,
      });
      seq += 1;
    }
  }

  // Last `downCount` units are DOWN (rehab offline). Their market rent is zeroed
  // so they do not enter rent-roll GPR or vacancy.
  for (let i = 0; i < spec.downCount; i++) {
    const u = units[units.length - 1 - i];
    u.status = "DOWN";
    u.marketRent = 0n;
    u.inPlaceRent = 0n;
  }

  const rentable = units.filter((u) => u.status !== "DOWN");
  const currentGpr = rentable.reduce((acc, u) => acc + u.marketRent, 0n);
  distributeCents(
    rentable,
    spec.gpr - currentGpr,
    (u) => u.marketRent,
    (u, next) => {
      u.marketRent = next;
    },
  );
  if (rentable.some((u) => u.marketRent <= 0n)) {
    throw new Error(`${spec.speCode}: GPR scale produced a non-positive market rent`);
  }

  // Mark vacant units whose market rents sum as close as possible to target,
  // then transfer the residual between one vacant and one occupied unit.
  const candidates = [...rentable].sort((a, b) => Number(b.marketRent - a.marketRent));
  let remaining = spec.vacancy;
  const vacant: UnitSnapshot[] = [];
  for (const u of candidates) {
    if (remaining <= 0n) break;
    if (u.marketRent <= remaining + dollars(400)) {
      u.status = "VACANT";
      vacant.push(u);
      remaining -= u.marketRent;
    }
  }
  if (vacant.length === 0) {
    candidates[0].status = "VACANT";
    vacant.push(candidates[0]);
  }
  const occupied = rentable.filter((u) => u.status === "OCCUPIED");
  if (occupied.length === 0) {
    throw new Error(`${spec.speCode}: no occupied units after vacancy assignment`);
  }
  const vacSum = vacant.reduce((acc, u) => acc + u.marketRent, 0n);
  const vacDelta = spec.vacancy - vacSum;
  distributeCents(
    vacant,
    vacDelta,
    (u) => u.marketRent,
    (u, next) => {
      u.marketRent = next;
    },
  );
  distributeCents(
    occupied,
    -vacDelta,
    (u) => u.marketRent,
    (u, next) => {
      u.marketRent = next;
    },
  );

  // Concessions on a subset of occupied units, last unit absorbs the residual.
  const occ = rentable.filter((u) => u.status === "OCCUPIED");
  const concessionHolders = occ.filter((_, i) => i % 5 === 0);
  const holders = concessionHolders.length > 0 ? concessionHolders : [occ[0]];
  const base = spec.concessions / BigInt(holders.length);
  let granted = 0n;
  for (let i = 0; i < holders.length; i++) {
    const amount = i === holders.length - 1 ? spec.concessions - granted : base;
    holders[i].concessionCents = amount;
    granted += amount;
  }

  // In-place rent: apply strategy ratio, then keep LTL non-negative.
  occ.forEach((u, i) => {
    const ratio = spec.inPlaceRatio + ((i % 7) - 3) * 0.01;
    const raw = Number(u.marketRent) * Math.min(1, Math.max(0.8, ratio));
    let inPlace = BigInt(Math.round(raw / 100) * 100);
    if (inPlace > u.marketRent) inPlace = u.marketRent;
    if (inPlace <= 0n) inPlace = u.marketRent;
    u.inPlaceRent = inPlace;
    const lease = leaseFor(i, true);
    u.leaseStart = lease.start;
    u.leaseEnd = lease.end;
  });

  if (units.length !== spec.unitCount) {
    throw new Error(`${spec.speCode}: expected ${spec.unitCount} units, built ${units.length}`);
  }
  return units;
}

export function demoAsOfDate(): Date {
  return ny(2026, 8, 31);
}

export function assertDemoRentRoll(units: UnitSnapshot[], spec: SpeRentRollSpec): void {
  const rentable = units.filter((u) => u.status !== "DOWN");
  const gpr = rentable.reduce((a, u) => a + u.marketRent, 0n);
  const vac = units.filter((u) => u.status === "VACANT").reduce((a, u) => a + u.marketRent, 0n);
  const conc = units.filter((u) => u.status === "OCCUPIED").reduce((a, u) => a + u.concessionCents, 0n);
  if (units.length !== spec.unitCount) throw new Error(`unit count ${units.length} ≠ ${spec.unitCount}`);
  if (gpr !== spec.gpr) throw new Error(`GPR ${gpr} ≠ ${spec.gpr}`);
  if (vac !== spec.vacancy) throw new Error(`vacancy ${vac} ≠ ${spec.vacancy}`);
  if (conc !== spec.concessions) throw new Error(`concessions ${conc} ≠ ${spec.concessions}`);
}

export function statusLabel(status: UnitStatus): string {
  return status;
}
