import {
  isNonRevenueSubstatus,
  lossToLease,
  physicalOccupancyBps,
  rentRollConcessions,
  rentRollEgiAnalog,
  rentRollGpr,
  rentRollVacancyLoss,
  signedLossToLease,
  summarizeRentRoll,
  type UnitSnapshot,
  type UnitStatus,
} from "@rcp/properties";
import {
  BLEND_METHOD,
  centsPerCount,
  centsToSnapshot,
  dollarsAtStake,
  FORMULAS,
  lostRentPerDayCents,
  noiMarginBps,
  NOT_AVAILABLE,
  observationIsStale,
  paybackMonths,
  peerGapPerUnit,
  presentBps,
  presentCents,
  rankByMarginImpact,
  ratioBps,
  revpauCents,
  utilityRecoveryBps,
  daysBetween,
  type ScoreSnapshot,
} from "./formulas";
import { NO_OBSERVATION_NOTE, PRICING_BAND_NOTE, TARGET_NOTE, excludeSelf, recommendedBand } from "./policy";

export type PlanUnit = {
  unitCode: string;
  floorplan: string;
  status: UnitStatus;
  substatus?: string | null;
  marketRent: bigint;
  inPlaceRent: bigint;
  concessionCents: bigint;
  leaseStart: string | null;
  leaseEnd: string | null;
  moveIn: string | null;
  moveOut: string | null;
  readyDate: string | null;
};

export type PlanObservation = {
  id: string;
  sourceName: string;
  sourceType: string;
  geography: string;
  floorplan: string | null;
  valueCents: bigint | null;
  rangeLowCents: bigint | null;
  rangeHighCents: bigint | null;
  trendNote: string | null;
  specialsNote?: string | null;
  asOfDate: string;
  vintageDate: string | null;
  retrievedAt: string;
  termsNote: string;
};

export type PlanOpportunity = {
  id: string;
  category: string;
  title: string;
  currentCaptureCents: bigint | null;
  fullRolloutCents: bigint | null;
  setupCostCents: bigint | null;
  ownerName: string | null;
  steps: string | null;
  legalNote: string | null;
  status: string;
};

export type PlanPeer = {
  code: string;
  payrollPerUnitCents: bigint | null;
  controllablePerUnitCents: bigint | null;
  pmFeeBps: number | null;
};

export type PlanFacts = {
  entityCode: string;
  periodLabel: string;
  periodEnd: string;
  booksActive: boolean;
  egiCents: bigint | null;
  noiCents: bigint | null;
  otherIncomeCents: bigint | null;
  payrollCents: bigint | null;
  pmFeeCents: bigint | null;
  controllableOpexCents: bigint | null;
  controllableBudgetCents: bigint | null;
  makeReadyCents: bigint | null;
  badDebtCents: bigint | null;
  arControlCents: bigint | null;
  reserveCashCents: bigint | null;
  rubsCents: bigint | null;
  utilityCents: bigint | null;
  otherIncomeLines: { code: string; label: string; cents: bigint }[] | null;
  utilityLines: { code: string; label: string; cents: bigint }[] | null;
  dealUnitCount: number | null;
  rentRollAsOf: string | null;
  units: PlanUnit[] | null;
  peers: PlanPeer[];
  opportunities: PlanOpportunity[];
  observations: PlanObservation[];
  loan: null | {
    name: string;
    lenderName: string;
    reserveRequirementCents: bigint;
    reserveAccountCode: string;
    reserveRequirementNote: string;
    dscrBps: number | null;
    dscrThresholdBps: number;
    dscrThresholdNote: string;
    debtYieldBps: number | null;
    debtYieldThresholdBps: number;
    debtYieldThresholdNote: string;
    asOfLabel: string;
  };
  underwriting: null | {
    periodLabel: string;
    basisLabel: string;
    noiBasisLabel: string;
    noiCents: bigint | null;
    annualizedNoiCents: bigint | null;
    recordedAt: string;
  };
  businessPlanNote: string | null;
};

export type PlanRecommendation = {
  code: string;
  title: string;
  reason: string;
  impactCents: bigint | null;
  revpauDeltaCents: bigint | null;
  confidence: "COMPLETE" | "PARTIAL" | "MISSING";
  sourceLabel: string;
  status: string;
};

function toSnapshot(units: PlanUnit[]): UnitSnapshot[] {
  return units.map((unit) => ({
    unitCode: unit.unitCode,
    floorplan: unit.floorplan,
    beds: 0,
    bathsTenths: 0,
    sqft: 0,
    status: unit.status,
    substatus: unit.substatus ?? undefined,
    marketRent: unit.marketRent,
    inPlaceRent: unit.inPlaceRent,
    leaseStart: null,
    leaseEnd: null,
    concessionCents: unit.concessionCents,
  }));
}

function revenueOccupied(units: PlanUnit[]): PlanUnit[] {
  return units.filter((unit) => unit.status === "OCCUPIED" && !isNonRevenueSubstatus(unit.substatus));
}

type ApplicableRent = { cents: bigint } | { unresolved: string };

function isFloorplanAskingRent(row: PlanObservation): boolean {
  if (row.sourceType === "ZORI") return false;
  if (!row.floorplan) return false;
  return row.valueCents != null;
}

function askingForFloorplan(floorplan: string, observations: PlanObservation[], periodEnd: string): ApplicableRent | null {
  const fresh = observations.filter((row) => isFloorplanAskingRent(row) && !observationIsStale(row.asOfDate, periodEnd));
  const specific = fresh.filter((row) => row.floorplan && row.floorplan.toLowerCase() === floorplan.toLowerCase());
  if (specific.length > 1) return { unresolved: "More than one asking rent is on file for this floor plan, and this phase does not blend them." };
  if (specific.length === 1 && specific[0]?.valueCents != null) return { cents: specific[0].valueCents };
  return null;
}

function contextOnlyNote(observations: PlanObservation[]): string | null {
  const context = observations.some((row) => row.valueCents != null && (row.sourceType === "ZORI" || !row.floorplan));
  if (!context) return null;
  return "A property-level figure, including a ZIP index such as ZORI, is context only. It is not used as a floor-plan asking rent.";
}

export function illustrativeRevpau(facts: {
  periodEnd: string;
  occupiedNetCents: bigint | null;
  rentableCount: number;
  vacantFloorplans: string[];
  observations: PlanObservation[];
}): { cents: bigint | null; note: string } {
  if (facts.occupiedNetCents == null || facts.rentableCount <= 0) {
    return { cents: null, note: "Illustrative RevPAU needs rent-roll revenue and rentable units." };
  }
  if (facts.vacantFloorplans.length === 0) {
    const current = revpauCents(facts.occupiedNetCents, facts.rentableCount);
    return { cents: current, note: "No vacant units, so illustrative RevPAU matches current rent-roll revenue." };
  }
  let extra = 0n;
  for (const floorplan of facts.vacantFloorplans) {
    const asking = askingForFloorplan(floorplan, facts.observations, facts.periodEnd);
    if (!asking) {
      return { cents: null, note: contextOnlyNote(facts.observations) ?? "Not enough sourced asking rents to compare RevPAU." };
    }
    if ("unresolved" in asking) return { cents: null, note: asking.unresolved };
    extra += asking.cents;
  }
  return {
    cents: revpauCents(facts.occupiedNetCents + extra, facts.rentableCount),
    note: "Illustrative only: vacant units at a sourced asking rent. Not a pricing band.",
  };
}

function confidence(impact: bigint | null, figure: bigint | number | null): "COMPLETE" | "PARTIAL" | "MISSING" {
  if (figure == null) return "MISSING";
  if (impact == null) return "PARTIAL";
  return "COMPLETE";
}

export function describePlan(raw: PlanFacts) {
  const peers = excludeSelf(raw.peers, raw.entityCode);
  const units = raw.units;
  const roll = units ? summarizeRentRoll(toSnapshot(units)) : null;
  const rentableCount = roll?.rentableCount ?? 0;
  const occupiedCount = roll?.occupiedCount ?? 0;
  const denominator = roll ? rentableCount : raw.dealUnitCount ?? 0;
  const revenueCents = raw.booksActive && raw.egiCents != null ? raw.egiCents : roll ? rentRollEgiAnalog(toSnapshot(units ?? [])) : null;
  const revenueBase: ScoreSnapshot["revenueBase"] = raw.booksActive && raw.egiCents != null ? "book-egi" : roll ? "rent-roll" : "none";
  const rentRollDated = raw.rentRollAsOf ? `Rent roll as of ${raw.rentRollAsOf}` : "Rent roll as-of date not on file";
  const revenueSource = revenueBase === "book-egi"
    ? "Book EGI for this period."
    : revenueBase === "rent-roll"
      ? `Rent-roll in-place rent minus concessions. Rent roll as of ${raw.rentRollAsOf ?? "date not on file"}. This period has no income-statement activity.`
      : "No income statement and no rent roll for this period.";
  const revpau = revpauCents(revenueCents, roll ? rentableCount : denominator);
  const margin = raw.booksActive ? noiMarginBps(raw.noiCents, raw.egiCents) : null;
  const ltl = roll ? lossToLease(toSnapshot(units ?? [])) : null;
  const signed = roll ? signedLossToLease(toSnapshot(units ?? [])) : null;
  const vacancy = roll ? rentRollVacancyLoss(toSnapshot(units ?? [])) : null;
  const concessions = roll ? rentRollConcessions(toSnapshot(units ?? [])) : null;
  const otherPerOccupied = centsPerCount(raw.booksActive ? raw.otherIncomeCents : null, occupiedCount);
  const payrollPer = centsPerCount(raw.booksActive ? raw.payrollCents : null, denominator);
  const payrollPerOccupied = centsPerCount(raw.booksActive ? raw.payrollCents : null, occupiedCount);
  const opexPer = centsPerCount(raw.booksActive ? raw.controllableOpexCents : null, denominator);
  const recovery = utilityRecoveryBps(raw.booksActive ? raw.rubsCents : null, raw.booksActive ? raw.utilityCents : null);
  const pmFeeBps = raw.booksActive ? ratioBps(raw.pmFeeCents, raw.egiCents) : null;

  const occupiedNet = roll ? rentRollEgiAnalog(toSnapshot(units ?? [])) : null;
  const vacantFloorplans = (units ?? []).filter((unit) => unit.status === "VACANT").map((unit) => unit.floorplan || "Unknown");
  const illustrative = illustrativeRevpau({
    periodEnd: raw.periodEnd,
    occupiedNetCents: occupiedNet,
    rentableCount: roll ? rentableCount : 0,
    vacantFloorplans,
    observations: raw.observations,
  });
  const rentRollRevpau = revpauCents(occupiedNet, roll ? rentableCount : 0);
  const revpauDelta = rentRollRevpau != null && illustrative.cents != null ? illustrative.cents - rentRollRevpau : null;

  const incomeGap = raw.opportunities.reduce((acc, row) => {
    if (row.status === "DECLINED") return acc;
    if (row.currentCaptureCents == null || row.fullRolloutCents == null) return acc;
    const gap = row.fullRolloutCents - row.currentCaptureCents;
    return gap > 0n ? acc + gap : acc;
  }, 0n);
  const incomeImpact = raw.opportunities.some(
    (row) => row.status !== "DECLINED" && row.currentCaptureCents != null && row.fullRolloutCents != null && row.fullRolloutCents > row.currentCaptureCents,
  )
    ? incomeGap
    : null;

  const peerPayroll = peers.map((row) => row.payrollPerUnitCents).filter((value): value is bigint => value != null);
  const payrollGap = dollarsAtStake(peerGapPerUnit(payrollPer, peerPayroll), denominator);
  const peerOpex = peers.map((row) => row.controllablePerUnitCents).filter((value): value is bigint => value != null);
  const budgetGap =
    raw.booksActive && raw.controllableOpexCents != null && raw.controllableBudgetCents != null && raw.controllableOpexCents > raw.controllableBudgetCents
      ? raw.controllableOpexCents - raw.controllableBudgetCents
      : null;
  const opexImpact = budgetGap ?? dollarsAtStake(peerGapPerUnit(opexPer, peerOpex), denominator);

  const recommendations: PlanRecommendation[] = rankByMarginImpact([
    {
      code: "RENT",
      title: "Rent versus the rent-roll market",
      impactCents: ltl,
      revpauDeltaCents: revpauDelta,
      confidence: confidence(ltl, ltl),
      sourceLabel: roll ? rentRollDated : "Rent roll not on file",
      status: "Needs approval",
      reason: roll
        ? `Floored loss-to-lease is ${presentCents(ltl)} (in-place below the rent-roll market rent). Signed loss-to-lease is ${presentCents(signed)}. A negative signed figure is gain-to-lease. The rent-roll market rent is not overwritten. ${PRICING_BAND_NOTE}`
        : "Loss-to-lease needs a rent roll. Nothing was assumed.",
    },
    {
      code: "OCCUPANCY",
      title: "Vacancy loss",
      impactCents: vacancy,
      revpauDeltaCents: null,
      confidence: confidence(vacancy, vacancy),
      sourceLabel: roll ? rentRollDated : "Rent roll not on file",
      status: "Needs approval",
      reason: roll
        ? `Vacant units carry ${presentCents(vacancy)} of rent-roll market rent. Physical occupancy is ${presentBps(physicalOccupancyBps(toSnapshot(units ?? [])))}. Ranking uses these dollars, not the occupancy rate. Notice and pre-lease inputs are not on file.`
        : "Vacancy needs a rent roll. Do not read it from the vacancy ledger line.",
    },
    {
      code: "OTHER_INCOME",
      title: "Other income",
      impactCents: incomeImpact,
      revpauDeltaCents: null,
      confidence: confidence(incomeImpact, raw.booksActive ? raw.otherIncomeCents : null),
      sourceLabel: raw.booksActive ? `Books 4100–4190 · ${raw.periodLabel}` : "No income-statement activity this period",
      status: "Needs approval",
      reason: incomeImpact != null
        ? `Entered ideas show ${presentCents(incomeImpact)} between current capture and full rollout. The app does not charge the fee.`
        : `Other income per occupied unit is ${presentCents(otherPerOccupied)}. A dollar opportunity needs a current capture and a full-rollout figure you enter. Nothing is assumed.`,
    },
    {
      code: "PAYROLL",
      title: "Payroll",
      impactCents: payrollGap,
      revpauDeltaCents: null,
      confidence: confidence(payrollGap, payrollPer),
      sourceLabel: raw.booksActive ? `Books 5110 + 5120 · ${raw.periodLabel}` : "No income-statement activity this period",
      status: "Advisory",
      reason: payrollGap != null
        ? `Payroll per unit is above the median of other Owned RCP deals with payroll this period (${peers.filter((row) => row.payrollPerUnitCents != null).map((row) => row.code).join(", ")}). This is a comparison, not a staffing order.`
        : `Payroll per unit is ${presentCents(payrollPer)}. ${peerPayroll.length === 0 ? "No other Owned deal has payroll and a unit count for this period, so there is no benchmark." : "The gap is not above the peer median."}`,
    },
    {
      code: "CONTROLLABLE_OPEX",
      title: "Controllable operating expenses",
      impactCents: opexImpact,
      revpauDeltaCents: null,
      confidence: confidence(opexImpact, opexPer),
      sourceLabel: raw.booksActive ? `Controllable opex · ${raw.periodLabel}` : "No income-statement activity this period",
      status: "Advisory",
      reason: budgetGap != null
        ? `Controllable operating expenses are ${presentCents(budgetGap)} over the budget for this period. Utilities, taxes, and insurance are not in this figure.`
        : `Controllable opex per unit is ${presentCents(opexPer)}. ${raw.controllableBudgetCents == null ? "No controllable budget is on file for this period." : "Spending is not above the budget."}`,
    },
  ]);

  const latest = [...raw.observations].sort((a, b) => (a.asOfDate < b.asOfDate ? 1 : a.asOfDate > b.asOfDate ? -1 : 0))[0] ?? null;
  const snapshot: ScoreSnapshot = {
    periodLabel: raw.periodLabel,
    revpauCents: centsToSnapshot(revpau),
    noiMarginBps: margin,
    lossToLeaseCents: centsToSnapshot(ltl),
    vacancyLossCents: centsToSnapshot(vacancy),
    otherIncomePerOccupiedCents: centsToSnapshot(otherPerOccupied),
    payrollPerUnitCents: centsToSnapshot(payrollPer),
    controllableOpexPerUnitCents: centsToSnapshot(opexPer),
    illustrativeRevpauCents: centsToSnapshot(illustrative.cents),
    observationCount: raw.observations.length,
    latestSource: latest?.sourceName ?? null,
    latestAsOf: latest?.asOfDate ?? null,
    latestValueCents: centsToSnapshot(latest?.valueCents ?? null),
    revenueBase,
  };

  return {
    formulas: FORMULAS,
    blend: BLEND_METHOD,
    band: recommendedBand(),
    bandNote: PRICING_BAND_NOTE,
    targetNote: TARGET_NOTE,
    roll,
    rentableCount: roll ? rentableCount : null,
    occupiedCount: roll ? occupiedCount : null,
    denominator: denominator > 0 ? denominator : null,
    revenueCents,
    revenueSource,
    revpau,
    margin,
    ltl,
    signed,
    vacancy,
    concessions,
    otherPerOccupied,
    payrollPer,
    payrollPerOccupied,
    opexPer,
    recovery,
    pmFeeBps,
    illustrative,
    revpauDelta,
    peers,
    recommendations,
    snapshot,
    gpr: roll ? rentRollGpr(toSnapshot(units ?? [])) : null,
    occupancyBps: roll ? physicalOccupancyBps(toSnapshot(units ?? [])) : null,
  };
}

export function floorPlanRows(facts: PlanFacts) {
  const units = facts.units ?? [];
  const groups = new Map<string, PlanUnit[]>();
  for (const unit of units) {
    const key = unit.floorplan || "Unknown";
    groups.set(key, [...(groups.get(key) ?? []), unit]);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([floorplan, rows]) => {
      const occupied = revenueOccupied(rows);
      const inPlace = occupied.reduce((acc, unit) => acc + unit.inPlaceRent, 0n);
      const marketRows = rows.filter((unit) => unit.status !== "DOWN");
      const market = marketRows.reduce((acc, unit) => acc + unit.marketRent, 0n);
      const concessionUnits = rows.filter((unit) => unit.status === "OCCUPIED");
      const concessions = concessionUnits.reduce((acc, unit) => acc + unit.concessionCents, 0n);
      const ltl = lossToLease(toSnapshot(rows));
      const ends = occupied.map((unit) => unit.leaseEnd).filter((value): value is string => Boolean(value)).sort();
      const observations = facts.observations.filter((row) => !row.floorplan || row.floorplan.toLowerCase() === floorplan.toLowerCase());
      return {
        floorplan,
        units: rows.length,
        occupied: rows.filter((unit) => unit.status === "OCCUPIED").length,
        vacant: rows.filter((unit) => unit.status === "VACANT").length,
        inPlaceAverageCents: centsPerCount(occupied.length ? inPlace : null, occupied.length),
        rentRollMarketAverageCents: centsPerCount(marketRows.length ? market : null, marketRows.length),
        concessionCents: concessions,
        lossToLeaseCents: ltl,
        leaseStart: occupied.map((unit) => unit.leaseStart).filter(Boolean).sort()[0] ?? null,
        leaseEnd: ends.at(-1) ?? null,
        observations,
        recommendation: PRICING_BAND_NOTE,
      };
    });
}

export function vacancyRows(facts: PlanFacts) {
  const units = (facts.units ?? []).filter((unit) => unit.status === "VACANT" || unit.status === "DOWN");
  return units
    .map((unit) => {
      const daysVacant = unit.status === "VACANT" ? daysBetween(unit.moveOut, facts.periodEnd) : null;
      const turnDays = daysBetween(unit.moveOut, unit.moveIn);
      let fix = "Missing data";
      let evidence = "The rent roll shows the unit. Notice, pre-lease, and ready date are not on file, so the cause is not assigned.";
      if (unit.status === "DOWN") {
        fix = "Down unit";
        evidence = "The rent roll marks this unit down. A return date is not on file.";
      } else if (unit.moveOut && unit.readyDate) {
        fix = "Turn";
        evidence = "Move-out and ready date are both on the monthly snapshot.";
      } else if (unit.moveOut && !unit.readyDate) {
        fix = "Missing data";
        evidence = "Move-out is on file. Ready date is not, so turn time is not calculated.";
      }
      return {
        unitCode: unit.unitCode,
        floorplan: unit.floorplan,
        status: unit.status,
        daysVacant: daysVacant != null && daysVacant >= 0 ? daysVacant : null,
        readyDate: unit.readyDate,
        lostRentPerDayCents: unit.status === "VACANT" ? lostRentPerDayCents(unit.marketRent) : null,
        turnDays: turnDays != null && turnDays >= 0 ? turnDays : null,
        fix,
        evidence,
      };
    })
    .sort((a, b) => {
      if (a.lostRentPerDayCents == null && b.lostRentPerDayCents == null) return a.unitCode.localeCompare(b.unitCode);
      if (a.lostRentPerDayCents == null) return 1;
      if (b.lostRentPerDayCents == null) return -1;
      if (a.lostRentPerDayCents === b.lostRentPerDayCents) return a.unitCode.localeCompare(b.unitCode);
      return a.lostRentPerDayCents > b.lostRentPerDayCents ? -1 : 1;
    });
}

export function leaseLadder(facts: PlanFacts) {
  const occupied = (facts.units ?? []).filter((unit) => unit.status === "OCCUPIED");
  const buckets = new Map<string, number>();
  let missing = 0;
  let upcoming = 0;
  for (const unit of occupied) {
    if (!unit.leaseEnd) {
      missing += 1;
      continue;
    }
    const key = unit.leaseEnd.slice(0, 7);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
    const days = daysBetween(facts.periodEnd, unit.leaseEnd);
    if (days != null && days >= 0 && days <= 90) upcoming += 1;
  }
  const months = [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, count]) => ({ month, count }));
  return {
    months,
    missingLeaseEnd: occupied.length ? missing : null,
    upcomingRenewals: occupied.length ? upcoming : null,
    target: "No expiration target supplied.",
    tradeout: "Trade-out history is not compared in this phase. The current rent roll is the source.",
  };
}

export function exposureNote(): string {
  return "30/60/90-day exposure needs notices and pre-leased flags. Those inputs are not on file.";
}

export function concessionNote(): string {
  return "Concession end dates are not on file, so burn-off timing is not calculated. The dollars below are the current rent-roll concessions by floor plan.";
}

export function presentMoney(cents: bigint | null | undefined): string {
  return presentCents(cents);
}

export function blankOr(value: string | null | undefined, blank = NOT_AVAILABLE): string {
  return value && value.trim() ? value : blank;
}

export function observationNote(count: number): string {
  return count === 0 ? NO_OBSERVATION_NOTE : "Each figure below keeps its source and as-of date. Stale means more than 45 days before the period end.";
}
