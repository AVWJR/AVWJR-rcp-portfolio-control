/**
 * Rent roll ↔ GL tie-outs RR-1 … RR-13.
 * Tolerances are optional. This module does not invent a default threshold.
 * Exact checks (unit count, charge-line footing) fail on any difference.
 */

export type TieSeverity = "pass" | "warning" | "hard_fail" | "na" | "info";

export type TieOut = {
  id: string;
  label: string;
  rentRollCents: bigint | null;
  glCents: bigint | null;
  differenceCents: bigint | null;
  severity: TieSeverity;
  detail: string;
};

export type TieTolerance = { cents?: bigint; bps?: number; days?: number };

/** Keys a controller may save on TieOutTolerance. `asof_days` uses the days column for RR-12. */
export const TIE_OUT_TOLERANCE_KEYS = [
  "gpr",
  "sched_rent",
  "ltl",
  "vacancy",
  "concession",
  "nru",
  "ar",
  "deposit",
  "deposit_cash",
  "prepaid",
  "asof_days",
] as const;

export type TieOutToleranceKey = (typeof TIE_OUT_TOLERANCE_KEYS)[number];

export type TieOutInput = {
  rentRollPresent: boolean;
  entityUnitCount: number | null;
  unitCount: number;
  rentableCount: number;
  occupiedCount: number;
  vacantCount: number;
  downCount: number;
  gprCents: bigint;
  scheduledRentCents: bigint;
  signedLtlCents: bigint;
  vacancyCents: bigint;
  concessionCents: bigint;
  nonRevenueCents: bigint;
  delinquencyCents: bigint | null;
  depositCents: bigint;
  prepaidCents: bigint;
  asOfDate: string | null;
  periodEnd: string;
  gl: {
    gpr: bigint;
    ltl: bigint;
    vacancy: bigint;
    concessions: bigint;
    nru: bigint;
    ar: bigint;
    deposits: bigint;
    depositCash: bigint;
    prepaid: bigint;
  };
  chargeMismatchCount: number;
  tolerances?: Partial<Record<string, TieTolerance>>;
  depositsSegregated?: boolean;
};

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function overTolerance(diff: bigint, base: bigint, tol?: TieTolerance): boolean | null {
  if (!tol || (tol.cents == null && tol.bps == null)) return null;
  const centsBreach = tol.cents != null && abs(diff) > tol.cents;
  const bpsBreach = tol.bps != null && base !== 0n && abs(diff) * 10_000n > abs(base) * BigInt(tol.bps);
  if (tol.cents == null) return bpsBreach;
  if (tol.bps == null) return centsBreach;
  return centsBreach || bpsBreach;
}

function moneyTie(opts: {
  id: string;
  label: string;
  rent: bigint;
  gl: bigint;
  tol?: TieTolerance;
  hardWhenOver: boolean;
  missingRoll: boolean;
}): TieOut {
  if (opts.missingRoll) {
    return {
      id: opts.id,
      label: opts.label,
      rentRollCents: null,
      glCents: opts.gl,
      differenceCents: null,
      severity: opts.id === "RR-1" ? "hard_fail" : "na",
      detail: "Rent roll is missing.",
    };
  }
  const difference = opts.rent - opts.gl;
  if (difference === 0n) {
    return {
      id: opts.id,
      label: opts.label,
      rentRollCents: opts.rent,
      glCents: opts.gl,
      differenceCents: 0n,
      severity: "pass",
      detail: "Ties to the cent.",
    };
  }
  const breached = overTolerance(difference, opts.gl === 0n ? opts.rent : opts.gl, opts.tol);
  const severity: TieSeverity = breached === true && opts.hardWhenOver ? "hard_fail" : breached === false ? "pass" : "warning";
  const detail =
    breached === null
      ? "Difference is open. No tolerance has been set, so this is a warning, not a hard fail."
      : severity === "pass"
        ? "Inside the configured tolerance."
        : "Outside the configured tolerance.";
  return {
    id: opts.id,
    label: opts.label,
    rentRollCents: opts.rent,
    glCents: opts.gl,
    differenceCents: difference,
    severity,
    detail,
  };
}

function sameMonth(asOf: string | null, periodEnd: string): boolean | null {
  if (!asOf) return null;
  return asOf.slice(0, 7) === periodEnd.slice(0, 7);
}

function daysBetween(asOf: string, periodEnd: string): number | null {
  const start = Date.parse(`${asOf.slice(0, 10)}T00:00:00.000Z`);
  const end = Date.parse(`${periodEnd.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.abs(Math.round((start - end) / 86_400_000));
}

export function runRentRollTieOuts(input: TieOutInput): TieOut[] {
  const missing = !input.rentRollPresent;
  const tol = input.tolerances ?? {};
  const rows: TieOut[] = [
    moneyTie({
      id: "RR-1",
      label: "GPR (market)",
      rent: input.gprCents,
      gl: input.gl.gpr,
      tol: tol.gpr,
      hardWhenOver: false,
      missingRoll: missing,
    }),
    moneyTie({
      id: "RR-2",
      label: "Scheduled lease rent",
      rent: input.scheduledRentCents,
      gl: input.gl.gpr - input.gl.ltl,
      tol: tol.sched_rent,
      hardWhenOver: false,
      missingRoll: missing,
    }),
    moneyTie({
      id: "RR-3",
      label: "Loss/Gain to lease",
      rent: input.signedLtlCents,
      gl: input.gl.ltl,
      tol: tol.ltl,
      hardWhenOver: false,
      missingRoll: missing,
    }),
    moneyTie({
      id: "RR-4",
      label: "Vacancy",
      rent: input.vacancyCents,
      gl: input.gl.vacancy,
      tol: tol.vacancy,
      hardWhenOver: false,
      missingRoll: missing,
    }),
    moneyTie({
      id: "RR-5",
      label: "Concessions",
      rent: input.concessionCents,
      gl: input.gl.concessions,
      tol: tol.concession,
      hardWhenOver: false,
      missingRoll: missing,
    }),
    moneyTie({
      id: "RR-6",
      label: "Non-revenue units",
      rent: input.nonRevenueCents,
      gl: input.gl.nru,
      tol: tol.nru,
      hardWhenOver: false,
      missingRoll: missing,
    }),
  ];

  if (input.delinquencyCents == null) {
    rows.push({
      id: "RR-7",
      label: "Tenant AR / delinquency",
      rentRollCents: null,
      glCents: input.gl.ar,
      differenceCents: null,
      severity: "na",
      detail: "Delinquency stub — no resident balance column on this rent roll.",
    });
  } else {
    rows.push(
      moneyTie({
        id: "RR-7",
        label: "Tenant AR / delinquency",
        rent: input.delinquencyCents,
        gl: input.gl.ar,
        tol: tol.ar,
        hardWhenOver: false,
        missingRoll: missing,
      }),
    );
  }

  rows.push(
    moneyTie({
      id: "RR-8",
      label: "Security deposits (liability)",
      rent: input.depositCents,
      gl: input.gl.deposits,
      tol: tol.deposit,
      hardWhenOver: true,
      missingRoll: missing,
    }),
  );

  const depositCash = moneyTie({
    id: "RR-9",
    label: "Security deposits (restricted cash)",
    rent: input.gl.deposits,
    gl: input.gl.depositCash,
    tol: tol.deposit_cash,
    hardWhenOver: Boolean(input.depositsSegregated),
    missingRoll: false,
  });
  rows.push(depositCash);

  rows.push(
    moneyTie({
      id: "RR-10",
      label: "Prepaid rent / credits",
      rent: input.prepaidCents,
      gl: input.gl.prepaid,
      tol: tol.prepaid,
      hardWhenOver: false,
      missingRoll: missing,
    }),
  );

  const counted = input.occupiedCount + input.vacantCount + input.downCount;
  const countMismatch = input.entityUnitCount != null && input.entityUnitCount !== input.unitCount;
  const compositionMismatch = input.unitCount !== counted;
  rows.push({
    id: "RR-11",
    label: "Unit count",
    rentRollCents: BigInt(input.unitCount),
    glCents: input.entityUnitCount == null ? null : BigInt(input.entityUnitCount),
    differenceCents: input.entityUnitCount == null ? null : BigInt(input.unitCount - input.entityUnitCount),
    severity: missing ? "hard_fail" : countMismatch || compositionMismatch ? "hard_fail" : "pass",
    detail: missing
      ? "Rent roll is missing for an SPE with a unit master."
      : countMismatch
        ? `Rent roll has ${input.unitCount} units; the SPE master says ${input.entityUnitCount}.`
        : compositionMismatch
          ? "Occupied + vacant + down does not equal the unit count."
          : "Unit count matches the SPE master.",
  });

  const month = sameMonth(input.asOfDate, input.periodEnd);
  const asofDays = tol.asof_days?.days;
  const dayGap = input.asOfDate ? daysBetween(input.asOfDate, input.periodEnd) : null;
  const withinDayWindow = asofDays != null && dayGap != null && dayGap <= asofDays;
  const asofSeverity: TieSeverity = missing
    ? "hard_fail"
    : month === true || (month === false && withinDayWindow)
      ? "pass"
      : month === false
        ? "hard_fail"
        : "warning";
  rows.push({
    id: "RR-12",
    label: "As-of date",
    rentRollCents: null,
    glCents: null,
    differenceCents: dayGap == null ? null : BigInt(dayGap),
    severity: asofSeverity,
    detail:
      month === true
        ? "As-of date is in the close month."
        : month === false && withinDayWindow
          ? `As-of ${input.asOfDate} is ${dayGap} day(s) from ${input.periodEnd}, inside the ${asofDays}-day tolerance.`
          : month === false
            ? `Rent roll as-of ${input.asOfDate} is not in the close month of ${input.periodEnd.slice(0, 7)}.`
            : "As-of date was not detected.",
  });

  rows.push({
    id: "RR-13",
    label: "Charge lines vs unit totals",
    rentRollCents: null,
    glCents: null,
    differenceCents: BigInt(input.chargeMismatchCount),
    severity: input.chargeMismatchCount === 0 ? "pass" : "warning",
    detail:
      input.chargeMismatchCount === 0
        ? "Charge lines foot to the unit totals."
        : `${input.chargeMismatchCount} unit(s) where charge lines do not equal the unit total.`,
  });

  return rows;
}

export function hardTieFailures(rows: TieOut[]): TieOut[] {
  return rows.filter((row) => row.severity === "hard_fail");
}
