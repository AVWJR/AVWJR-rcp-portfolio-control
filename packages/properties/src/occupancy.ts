import type {
  BookEconomicOccupancy,
  BreakevenOccupancy,
  RentRollKpis,
  UnitSnapshot,
  UnitStatus,
} from "./types";

export function isRentable(status: UnitStatus): boolean {
  return status !== "DOWN";
}

function ratioBps(numerator: bigint, denominator: bigint): number | null {
  if (denominator === 0n) return null;
  return Number((numerator * 10_000n) / denominator);
}

export function rentableUnits(units: UnitSnapshot[]): UnitSnapshot[] {
  return units.filter((u) => isRentable(u.status));
}

export function occupiedUnits(units: UnitSnapshot[]): UnitSnapshot[] {
  return units.filter((u) => u.status === "OCCUPIED");
}

export function vacantUnits(units: UnitSnapshot[]): UnitSnapshot[] {
  return units.filter((u) => u.status === "VACANT");
}

/** Σ market rent of rentable units (excludes DOWN). */
export function rentRollGpr(units: UnitSnapshot[]): bigint {
  return rentableUnits(units).reduce((acc, u) => acc + u.marketRent, 0n);
}

export function rentRollInPlace(units: UnitSnapshot[]): bigint {
  return occupiedUnits(units).reduce((acc, u) => acc + u.inPlaceRent, 0n);
}

/** Vacancy loss from the rent roll = market rent of VACANT units. */
export function rentRollVacancyLoss(units: UnitSnapshot[]): bigint {
  return vacantUnits(units).reduce((acc, u) => acc + u.marketRent, 0n);
}

export function rentRollConcessions(units: UnitSnapshot[]): bigint {
  return occupiedUnits(units).reduce((acc, u) => acc + u.concessionCents, 0n);
}

/**
 * Loss-to-lease (monthly) = Σ max(0, market − in-place) on OCCUPIED units.
 * Vacant and DOWN units do not contribute. In-place above market is ignored (no
 * negative LTL). This is not loan-to-value (Phase C).
 */
export function lossToLease(units: UnitSnapshot[]): bigint {
  return occupiedUnits(units).reduce((acc, u) => {
    const gap = u.marketRent - u.inPlaceRent;
    return acc + (gap > 0n ? gap : 0n);
  }, 0n);
}

/**
 * Rent-roll analog of EGI excluding other income:
 * occupied in-place rent − concessions.
 */
export function rentRollEgiAnalog(units: UnitSnapshot[]): bigint {
  return rentRollInPlace(units) - rentRollConcessions(units);
}

/**
 * Physical occupancy = occupied ÷ rentable.
 * Rentable = all units except DOWN (offline / rehab). Returns basis points
 * (10_000 = 100.00%). Null when there are no rentable units.
 */
export function physicalOccupancyBps(units: UnitSnapshot[]): number | null {
  const rentable = rentableUnits(units);
  if (rentable.length === 0) return null;
  const occupied = occupiedUnits(rentable).length;
  return Math.round((occupied * 10_000) / rentable.length);
}

/**
 * Rent-roll economic occupancy analog =
 * (in-place rent − concessions) / rent-roll GPR.
 * Primary book economic occupancy is EGI / GPR from the GL (see bookEconomicOccupancy).
 */
export function rentRollEconomicOccupancyBps(units: UnitSnapshot[]): number | null {
  return ratioBps(rentRollEgiAnalog(units), rentRollGpr(units));
}

/** Book economic occupancy = EGI / GPR (documented Phase B definition). */
export function bookEconomicOccupancy(egi: bigint, gpr: bigint): BookEconomicOccupancy {
  return {
    source: "gl",
    economicOccupancyBps: ratioBps(egi, gpr),
    economicOccupancyBasis: "egi_over_gpr",
    gpr,
    egi,
  };
}

/**
 * Breakeven occupancy (cash, property-level):
 *
 *   (OpEx + interest + principal paydown − other income) / GPR
 *
 * OpEx is in-NOI operating expense from the GL. Debt service is interest
 * (6110) plus mortgage principal paydown (decrease in 2110 + 2210). Other
 * income is subtracted because it is occupancy-independent. Depreciation and
 * OpCo AM fees are excluded (non-cash / below-NOI OpCo charge).
 *
 * Result is the occupancy rate at which EGI ≈ OpEx + DS if vacancy is the
 * only GPR leakage and other income does not scale with occupancy.
 */
export function breakevenOccupancy(opts: {
  opex: bigint;
  interest: bigint;
  principalPaydown: bigint;
  otherIncome: bigint;
  gpr: bigint;
}): BreakevenOccupancy {
  const debtService = opts.interest + opts.principalPaydown;
  const numerator = opts.opex + debtService - opts.otherIncome;
  return {
    source: "gl",
    breakevenOccupancyBps: ratioBps(numerator, opts.gpr),
    formula: " (opex + interest + principal_paydown - other_income) / gpr ",
    opex: opts.opex,
    interest: opts.interest,
    principalPaydown: opts.principalPaydown,
    otherIncome: opts.otherIncome,
    gpr: opts.gpr,
    debtService,
  };
}

export function summarizeRentRoll(units: UnitSnapshot[]): RentRollKpis {
  const rentable = rentableUnits(units);
  return {
    source: "rent_roll",
    unitCount: units.length,
    rentableCount: rentable.length,
    occupiedCount: occupiedUnits(units).length,
    vacantCount: vacantUnits(units).length,
    downCount: units.filter((u) => u.status === "DOWN").length,
    physicalOccupancyBps: physicalOccupancyBps(units),
    economicOccupancyBps: rentRollEconomicOccupancyBps(units),
    economicOccupancyBasis: "rent_roll_in_place_less_concessions_over_gpr",
    lossToLease: lossToLease(units),
    vacancyLoss: rentRollVacancyLoss(units),
    concessions: rentRollConcessions(units),
    gpr: rentRollGpr(units),
    inPlaceRent: rentRollInPlace(units),
    egiAnalog: rentRollEgiAnalog(units),
  };
}

export function formatRatioBps(bps: number | null, locale = "en-US"): string {
  if (bps === null) return "—";
  return `${(bps / 100).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}
