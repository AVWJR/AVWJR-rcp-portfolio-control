/** Canonical rent-roll model shared by every dialect parser. Amounts are integer USD cents. */

import { bathsToTenths, type UnitSnapshot, type UnitStatus } from "./types";

export const RENT_ROLL_DIALECT_IDS = [
  "yardi_lease_charges",
  "redi_q_machine",
  "broker_flat",
  "canonical_csv",
] as const;

export type RentRollDialectId = (typeof RENT_ROLL_DIALECT_IDS)[number];

export const RENT_ROLL_DIALECT_LABELS: Record<RentRollDialectId, string> = {
  yardi_lease_charges: "Yardi / PMS Rent Roll with Lease Charges",
  redi_q_machine: "redIQ machine headers (UnitID / OccStatus / MktRent / InPlaceRent)",
  broker_flat: "Broker / Yardi-MRI flat unit rows",
  canonical_csv: "RCP canonical CSV (unit_id / market_rent)",
};

export type RentRollUnmappedCell = {
  sheet?: string;
  row: number;
  col?: number;
  header?: string;
  value: string;
  reason: string;
};

export type RentRollMeta = {
  dialect: RentRollDialectId;
  dialectLabel: string;
  reportTitle: string | null;
  propertyName: string | null;
  asOfDate: string | null;
  transactionDate: string | null;
  monthYear: string | null;
  sheetName: string | null;
  sourceFilename: string | null;
  headerRows: string[][];
  extras: Record<string, string>;
};

export type ChargeClass = "rent" | "concession" | "other";

export type CanonicalCharge = {
  unitCode: string;
  chargeCode: string;
  chargeClass: ChargeClass;
  amountCents: bigint;
  sourceRow: number;
  extras: Record<string, string>;
};

export type CanonicalUnit = {
  unitCode: string;
  unitType: string;
  beds: number;
  bathsTenths: number;
  sqft: number;
  status: UnitStatus;
  section: string | null;
  residentId: string;
  residentName: string;
  marketRentCents: bigint;
  inPlaceRentCents: bigint;
  otherChargesCents: bigint;
  concessionCents: bigint;
  residentDepositCents: bigint;
  otherDepositCents: bigint;
  balanceCents: bigint;
  moveIn: Date | null;
  leaseExpiration: Date | null;
  moveOut: Date | null;
  reportedTotalCents: bigint | null;
  charges: CanonicalCharge[];
  extras: Record<string, string>;
  sourceRows: number[];
};

export type NormalizedRentRoll = {
  meta: RentRollMeta;
  units: CanonicalUnit[];
  charges: CanonicalCharge[];
  unmapped: RentRollUnmappedCell[];
  warnings: string[];
};

export type DialectDetectHit = {
  dialect: RentRollDialectId;
  score: number;
  reason: string;
};

export type DialectParseOpts = {
  sourceFilename?: string;
  sheetName?: string;
  lenient?: boolean;
};

export function emptyRentRollMeta(
  dialect: RentRollDialectId,
  opts: DialectParseOpts = {},
): RentRollMeta {
  return {
    dialect,
    dialectLabel: RENT_ROLL_DIALECT_LABELS[dialect],
    reportTitle: null,
    propertyName: null,
    asOfDate: null,
    transactionDate: null,
    monthYear: null,
    sheetName: opts.sheetName ?? null,
    sourceFilename: opts.sourceFilename ?? null,
    headerRows: [],
    extras: {},
  };
}

export function extrasRecordToJson(extras: Record<string, string>): string {
  const keys = Object.keys(extras).filter((key) => extras[key] !== "");
  if (!keys.length) return "";
  const sorted = Object.fromEntries(keys.sort().map((key) => [key, extras[key]!]));
  return JSON.stringify(sorted);
}

export function mergeExtras(target: Record<string, string>, extra: Record<string, string>): void {
  for (const [key, value] of Object.entries(extra)) {
    if (!value) continue;
    if (!target[key]) target[key] = value;
    else if (target[key] !== value) target[`${key}__dup`] = value;
  }
}

export function classifyChargeCode(raw: string): ChargeClass {
  const compact = raw.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!compact) return "other";
  if (/(conc|freerent|losstolease|credit|discount)/.test(compact)) return "concession";
  if (/^(r)?rent$|^baserent$|^apartmentrent$|^leaserent$|^unitrent$|^rrent$/.test(compact)) return "rent";
  if (/^rents$/.test(compact)) return "rent";
  return "other";
}

export function inferBedsFromUnitType(unitType: string): number {
  const match = unitType.trim().match(/^(\d+)/);
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) && n >= 0 && n < 20 ? Math.trunc(n) : 0;
}

export function ymd(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

export function centsToDollars(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const whole = abs / 100n;
  const frac = abs % 100n;
  const body = `${whole.toString()}.${frac.toString().padStart(2, "0")}`;
  return neg ? `-${body}` : body;
}

export function finalizeUnitCharges(unit: CanonicalUnit): void {
  let rent = 0n;
  let other = 0n;
  let concession = unit.concessionCents;
  for (const charge of unit.charges) {
    if (charge.chargeClass === "rent") rent += charge.amountCents;
    else if (charge.chargeClass === "concession") concession += charge.amountCents < 0n ? -charge.amountCents : charge.amountCents;
    else other += charge.amountCents;
  }
  unit.otherChargesCents = other;
  unit.concessionCents = concession;
  if (rent !== 0n) unit.inPlaceRentCents = rent;
  else if (unit.inPlaceRentCents === 0n && other !== 0n && unit.status === "OCCUPIED") {
    unit.inPlaceRentCents = other;
    unit.otherChargesCents = 0n;
  }
  if (unit.status !== "OCCUPIED") {
    unit.inPlaceRentCents = 0n;
  }
}

export function canonicalUnitToSnapshot(unit: CanonicalUnit): UnitSnapshot {
  return {
    unitCode: unit.unitCode,
    floorplan: unit.unitType,
    beds: unit.beds,
    bathsTenths: unit.bathsTenths || bathsToTenths(0),
    sqft: unit.sqft,
    status: unit.status,
    marketRent: unit.marketRentCents,
    inPlaceRent: unit.status === "OCCUPIED" ? unit.inPlaceRentCents : 0n,
    leaseStart: unit.moveIn,
    leaseEnd: unit.leaseExpiration,
    concessionCents: unit.concessionCents,
  };
}

export function snapshotToCanonicalUnit(snapshot: UnitSnapshot, extras: Record<string, string> = {}): CanonicalUnit {
  const chargeCode = extras.in_place_rent_source || "in_place_rent";
  const charges: CanonicalCharge[] =
    snapshot.inPlaceRent !== 0n
      ? [
          {
            unitCode: snapshot.unitCode,
            chargeCode,
            chargeClass: "rent",
            amountCents: snapshot.inPlaceRent,
            sourceRow: 0,
            extras: {},
          },
        ]
      : [];
  return {
    unitCode: snapshot.unitCode,
    unitType: snapshot.floorplan,
    beds: snapshot.beds,
    bathsTenths: snapshot.bathsTenths,
    sqft: snapshot.sqft,
    status: snapshot.status,
    section: extras.section || null,
    residentId: extras.resident_id || extras.residentId || "",
    residentName: extras.resident || extras.resident_name || extras.residentName || "",
    marketRentCents: snapshot.marketRent,
    inPlaceRentCents: snapshot.inPlaceRent,
    otherChargesCents: 0n,
    concessionCents: snapshot.concessionCents,
    residentDepositCents: 0n,
    otherDepositCents: 0n,
    balanceCents: 0n,
    moveIn: snapshot.leaseStart,
    leaseExpiration: snapshot.leaseEnd,
    moveOut: extras.move_out ? null : null,
    reportedTotalCents: snapshot.inPlaceRent !== 0n ? snapshot.inPlaceRent : null,
    charges,
    extras,
    sourceRows: [],
  };
}

export function dialectCoachLine(meta: Pick<RentRollMeta, "dialect" | "dialectLabel">): string {
  return `We detected ${meta.dialectLabel} (${meta.dialect}) and normalized it to the canonical template. Original bytes stay in Vault.`;
}
