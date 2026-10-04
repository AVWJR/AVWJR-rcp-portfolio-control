import { CONTROLLABLE_OPEX_CODES, sumByCodes } from "@rcp/analytics";
import { computeCovenants } from "@rcp/debt";
import { buildIncomeStatement, netByCode, principalPaydownFromLines, rollupBalances, type PostedLine } from "@rcp/ledger";
import type { OperatingStatement } from "@rcp/reporting";
import type { UnitSnapshot } from "@rcp/properties";
import { loadPostedLines } from "@/lib/queries";
import { isOwnedSpe, ownedSpeWhere } from "@/lib/owned-spe";
import { prisma } from "@/lib/prisma";
import type { PlanFacts, PlanObservation, PlanOpportunity, PlanUnit } from "./analyze";
import { publicLeaseDates } from "./policy";

const PAYROLL_CODES = ["5110", "5120"] as const;
const UTILITY_CODES = ["5310", "5320", "5330", "5340", "5350"] as const;
const OTHER_INCOME_CODES = ["4100", "4110", "4120", "4130", "4140", "4150", "4160", "4170", "4180", "4190"] as const;

export function periodEndIso(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

function iso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

function debitOf(lines: PostedLine[], code: string): bigint {
  return netByCode(rollupBalances(lines), code);
}

function creditOf(lines: PostedLine[], code: string): bigint {
  return -debitOf(lines, code);
}

function linesOf(lines: PostedLine[], codes: readonly string[], sign: "debit" | "credit") {
  const balances = rollupBalances(lines);
  return codes.map((code) => ({
    code,
    label: balances.find((row) => row.code === code)?.name ?? code,
    cents: sign === "debit" ? netByCode(balances, code) : -netByCode(balances, code),
  }));
}

export function unitsFromRentRoll(units: UnitSnapshot[], moves: Map<string, { moveIn: string | null; moveOut: string | null; readyDate: string | null }>): PlanUnit[] {
  return units.map((unit) => {
    const extra = moves.get(unit.unitCode);
    return {
      unitCode: unit.unitCode,
      floorplan: unit.floorplan,
      status: unit.status,
      substatus: unit.substatus,
      marketRent: unit.marketRent,
      inPlaceRent: unit.inPlaceRent,
      concessionCents: unit.concessionCents,
      leaseStart: iso(unit.leaseStart),
      leaseEnd: iso(unit.leaseEnd),
      moveIn: extra?.moveIn ?? null,
      moveOut: extra?.moveOut ?? null,
      readyDate: extra?.readyDate ?? null,
    };
  });
}

export async function loadMoveDates(entityId: string, year: number, month: number) {
  const rows = await prisma.leasePeriodSnapshot.findMany({
    where: { entityId, year, month },
    select: { unitCode: true, payloadJson: true },
  });
  const moves = new Map<string, { moveIn: string | null; moveOut: string | null; readyDate: string | null }>();
  for (const row of rows) {
    let payload: unknown = null;
    try {
      payload = JSON.parse(row.payloadJson);
    } catch {
      payload = null;
    }
    moves.set(row.unitCode, publicLeaseDates(payload));
  }
  return moves;
}

async function peerFigures(entityId: string, code: string, year: number, month: number) {
  const period = await prisma.period.findUnique({
    where: { entityId_year_month: { entityId, year, month } },
  });
  const unitRows = await prisma.unit.findMany({
    where: { entityId },
    select: { status: true },
  });
  const rentable = unitRows.filter((unit) => unit.status !== "DOWN").length;
  const denominator = rentable > 0 ? rentable : 0;
  if (!period || denominator === 0) {
    return { code, payrollPerUnitCents: null, controllablePerUnitCents: null, pmFeeBps: null };
  }
  const lines = await loadPostedLines({ entityIds: [entityId], from: period.startDate, to: period.endDate });
  if (lines.length === 0) {
    return { code, payrollPerUnitCents: null, controllablePerUnitCents: null, pmFeeBps: null };
  }
  const statement = buildIncomeStatement({ throughEnd: lines, inPeriod: lines });
  const payroll = sumByCodes(new Map(PAYROLL_CODES.map((account) => [account, debitOf(lines, account)])), PAYROLL_CODES);
  const controllable = sumByCodes(
    new Map(CONTROLLABLE_OPEX_CODES.map((account) => [account, debitOf(lines, account)])),
    CONTROLLABLE_OPEX_CODES,
  );
  const pm = debitOf(lines, "5910");
  return {
    code,
    payrollPerUnitCents: payroll / BigInt(denominator),
    controllablePerUnitCents: controllable / BigInt(denominator),
    pmFeeBps: statement.egi === 0n ? null : Number((pm * 10_000n) / statement.egi),
  };
}

export async function loadPlanFacts(opts: {
  entityId: string;
  entityCode: string;
  year: number;
  month: number;
  periodEnd: string;
  booksActive: boolean;
  egiCents: bigint;
  noiCents: bigint;
  otherIncomeCents: bigint;
  inPeriod: PostedLine[];
  throughEnd: PostedLine[];
  throughStart: PostedLine[];
  units: UnitSnapshot[];
  dealUnitCount: number | null;
  businessPlanNote: string | null;
  controllableBudgetCents: bigint | null;
}): Promise<PlanFacts> {
  const books = opts.booksActive;
  const moves = opts.units.length ? await loadMoveDates(opts.entityId, opts.year, opts.month) : new Map();
  const peers = await prisma.entity.findMany({
    where: { ...ownedSpeWhere(), id: { not: opts.entityId } },
    select: { id: true, code: true },
    orderBy: { code: "asc" },
  });
  const peerRows = [];
  for (const peer of peers) {
    if (peer.code.toUpperCase() === opts.entityCode.toUpperCase()) continue;
    peerRows.push(await peerFigures(peer.id, peer.code, opts.year, opts.month));
  }

  const loan = await prisma.loan.findFirst({
    where: { entityId: opts.entityId },
    orderBy: { createdAt: "asc" },
    include: { payments: { where: { year: opts.year, month: opts.month } } },
  });
  const payment = loan?.payments[0];
  const principal = payment?.principalCents ?? principalPaydownFromLines(opts.throughStart, opts.throughEnd);
  const covenants = loan
    ? computeCovenants({
        noiCents: books ? opts.noiCents : 0n,
        interestCents: payment?.interestCents ?? (books ? debitOf(opts.inPeriod, "6110") : 0n),
        principalCents: principal,
        upbCents: loan.currentUpbCents,
        dscrThresholdBps: loan.dscrThresholdBps,
        debtYieldThresholdBps: loan.debtYieldThresholdBps,
      })
    : null;

  const underwriting = await prisma.dealAnalysisSnapshot.findFirst({
    where: { entityId: opts.entityId },
    orderBy: { recordedAt: "desc" },
  });

  const payrollMap = new Map(PAYROLL_CODES.map((code) => [code, debitOf(opts.inPeriod, code)]));
  const controllableMap = new Map(CONTROLLABLE_OPEX_CODES.map((code) => [code, debitOf(opts.inPeriod, code)]));

  return {
    entityCode: opts.entityCode,
    periodLabel: `${opts.year}-${String(opts.month).padStart(2, "0")}`,
    periodEnd: opts.periodEnd,
    booksActive: books,
    egiCents: books ? opts.egiCents : null,
    noiCents: books ? opts.noiCents : null,
    otherIncomeCents: books ? opts.otherIncomeCents : null,
    payrollCents: books ? sumByCodes(payrollMap, PAYROLL_CODES) : null,
    pmFeeCents: books ? debitOf(opts.inPeriod, "5910") : null,
    controllableOpexCents: books ? sumByCodes(controllableMap, CONTROLLABLE_OPEX_CODES) : null,
    controllableBudgetCents: opts.controllableBudgetCents,
    makeReadyCents: books ? debitOf(opts.inPeriod, "5220") : null,
    badDebtCents: books ? debitOf(opts.inPeriod, "4050") : null,
    arControlCents: opts.throughEnd.length ? debitOf(opts.throughEnd, "1110") : null,
    reserveCashCents: opts.throughEnd.length ? debitOf(opts.throughEnd, "1020") : null,
    rubsCents: books ? creditOf(opts.inPeriod, "4110") : null,
    utilityCents: books ? UTILITY_CODES.reduce((acc, code) => acc + debitOf(opts.inPeriod, code), 0n) : null,
    otherIncomeLines: books ? linesOf(opts.inPeriod, OTHER_INCOME_CODES, "credit") : null,
    utilityLines: books ? linesOf(opts.inPeriod, UTILITY_CODES, "debit") : null,
    dealUnitCount: opts.dealUnitCount,
    units: opts.units.length ? unitsFromRentRoll(opts.units, moves) : null,
    peers: peerRows,
    opportunities: [],
    observations: [],
    loan: loan
      ? {
          name: loan.name,
          lenderName: loan.lenderName,
          reserveRequirementCents: loan.reserveRequirementCents,
          dscrBps: books ? covenants?.dscrBps ?? null : null,
          dscrThresholdBps: loan.dscrThresholdBps,
          debtYieldBps: books ? covenants?.debtYieldBps ?? null : null,
          debtYieldThresholdBps: loan.debtYieldThresholdBps,
          asOfLabel: opts.periodEnd,
        }
      : null,
    underwriting: underwriting
      ? {
          periodLabel: underwriting.periodLabel,
          basisLabel: underwriting.basisLabel,
          noiBasisLabel: underwriting.noiBasisLabel,
          noiCents: underwriting.noiCents,
          annualizedNoiCents: underwriting.annualizedNoiCents,
          recordedAt: underwriting.recordedAt.toISOString().slice(0, 10),
        }
      : null,
    businessPlanNote: opts.businessPlanNote,
  };
}

export function booksAreActive(lines: PostedLine[]): boolean {
  return lines.length > 0;
}

export function controllableBudget(statement: OperatingStatement | null): bigint | null {
  if (!statement?.budget) return null;
  const rows = statement.rows.filter((row) =>
    ["5110", "5120", "5210", "5220", "5410", "5510", "5610", "5910", "5990"].includes(row.code ?? ""),
  );
  if (!statement.budget) return null;
  return rows.reduce((acc, row) => acc + (row.budget ?? 0n), 0n);
}

export async function loadStoredPlan(entityId: string): Promise<{
  status: string | null;
  lastAnalyzedAt: Date | null;
  blendMethodVersion: string | null;
  observations: PlanObservation[];
  opportunities: PlanOpportunity[];
  events: {
    id: string;
    kind: string;
    actor: string;
    reason: string;
    createdAt: Date;
    note: string | null;
    subjectType: string;
    ownerName: string | null;
    dueDate: Date | null;
    status: string | null;
    expectedEffectCents: bigint | null;
    afterJson: string | null;
  }[];
}> {
  const plan = await prisma.assetPlan.findUnique({
    where: { entityId },
    include: {
      observations: { orderBy: { createdAt: "asc" } },
      opportunities: { orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!plan) {
    return { status: null, lastAnalyzedAt: null, blendMethodVersion: null, observations: [], opportunities: [], events: [] };
  }
  return {
    status: plan.status,
    lastAnalyzedAt: plan.lastAnalyzedAt,
    blendMethodVersion: plan.blendMethodVersion,
    observations: plan.observations.map((row) => ({
      id: row.id,
      sourceName: row.sourceName,
      sourceType: row.sourceType,
      geography: row.geography,
      floorplan: row.floorplan,
      valueCents: row.valueCents,
      rangeLowCents: row.rangeLowCents,
      rangeHighCents: row.rangeHighCents,
      trendNote: row.trendNote,
      asOfDate: iso(row.asOfDate) ?? "",
      vintageDate: iso(row.vintageDate),
      retrievedAt: iso(row.retrievedAt) ?? "",
      termsNote: row.termsNote,
    })),
    opportunities: plan.opportunities.map((row) => ({
      id: row.id,
      category: row.category,
      title: row.title,
      currentCaptureCents: row.currentCaptureCents,
      fullRolloutCents: row.fullRolloutCents,
      setupCostCents: row.setupCostCents,
      ownerName: row.ownerName,
      steps: row.steps,
      legalNote: row.legalNote,
      status: row.status,
    })),
    events: plan.events.map((row) => ({
      id: row.id,
      kind: row.kind,
      actor: row.actor,
      reason: row.reason,
      createdAt: row.createdAt,
      note: row.note,
      subjectType: row.subjectType,
      ownerName: row.ownerName,
      dueDate: row.dueDate,
      status: row.status,
      expectedEffectCents: row.expectedEffectCents,
      afterJson: row.afterJson,
    })),
  };
}

export function assertPlanEntity(entity: { type: string; lifecycleStatus?: string | null; dealStatus?: string | null }) {
  return isOwnedSpe(entity);
}
