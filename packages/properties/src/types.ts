/** Unit master / rent-roll types. Amounts are integer USD cents. */

export const UNIT_STATUSES = ["OCCUPIED", "VACANT", "DOWN"] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export const SPE_STRATEGIES = ["VALUE_ADD_GARDEN", "STABILIZED", "LIGHT_REHAB"] as const;
export type SpeStrategy = (typeof SPE_STRATEGIES)[number];

export type PropertyStub = {
  speCode: string;
  unitCount: number;
  strategy: SpeStrategy;
};

export type UnitSnapshot = {
  unitCode: string;
  floorplan: string;
  beds: number;
  bathsTenths: number;
  sqft: number;
  status: UnitStatus;
  /** MODEL, EMPLOYEE, ADMIN, or DOWN. Offline DOWN is not collapsed from model/employee/admin. */
  substatus?: string;
  marketRent: bigint;
  inPlaceRent: bigint;
  leaseStart: Date | null;
  leaseEnd: Date | null;
  concessionCents: bigint;
};

export type RentRollKpis = {
  source: "rent_roll";
  unitCount: number;
  rentableCount: number;
  occupiedCount: number;
  vacantCount: number;
  downCount: number;
  physicalOccupancyBps: number | null;
  economicOccupancyBps: number | null;
  economicOccupancyBasis: "rent_roll_in_place_less_concessions_over_gpr";
  lossToLease: bigint;
  /** Signed market − lease on occupied units. Positive = loss. */
  signedLossToLease: bigint;
  /** Market rent of model, employee, and admin units, deducted on 4040. Offline DOWN is not included. */
  nonRevenueDeduction: bigint;
  vacancyLoss: bigint;
  concessions: bigint;
  gpr: bigint;
  inPlaceRent: bigint;
  egiAnalog: bigint;
};

export type BookEconomicOccupancy = {
  source: "gl";
  economicOccupancyBps: number | null;
  economicOccupancyBasis: "egi_over_gpr";
  gpr: bigint;
  egi: bigint;
};

export type BreakevenOccupancy = {
  source: "gl";
  breakevenOccupancyBps: number | null;
  formula: " (opex + interest + principal_paydown - other_income) / gpr ";
  opex: bigint;
  interest: bigint;
  principalPaydown: bigint;
  otherIncome: bigint;
  gpr: bigint;
  debtService: bigint;
};

export function isUnitStatus(value: string): value is UnitStatus {
  return (UNIT_STATUSES as readonly string[]).includes(value);
}

export function bathsFromTenths(tenths: number): number {
  return tenths / 10;
}

export function bathsToTenths(baths: number): number {
  return Math.round(baths * 10);
}
