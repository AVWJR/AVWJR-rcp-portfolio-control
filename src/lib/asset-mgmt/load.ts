import { CONTROLLABLE_OPEX_CODES, perUnitCents, sumByCodes } from "@rcp/analytics";
import { computeCovenants } from "@rcp/debt";
import { buildIncomeStatement, netByCode, principalPaydownFromLines, rollupBalances, type PostedLine } from "@rcp/ledger";
import type { UnitSnapshot } from "@rcp/properties";
import { Prisma } from "@prisma/client";
import type { PeriodStatus } from "@prisma/client";
import { loadBudgetMap } from "@/lib/budgets";
import { loadPostedLines } from "@/lib/queries";
import { isOwnedSpe, ownedSpeWhere } from "@/lib/owned-spe";
import { prisma } from "@/lib/prisma";
import { resolveReadablePeriod } from "@/lib/returns/read-cash";
import type { PlanFacts, PlanObservation, PlanOpportunity, PlanUnit } from "./analyze";
import { publicLeaseDates } from "./policy";

export type PlanBudgetRow = { label: string; code: string | null; actual: bigint | null; budget: bigint | null };

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

/** A peer with no posted payroll or controllable expense is left out of the median. Zero is not a peer. */
export function expensePerUnit(lines: PostedLine[], codes: readonly string[], rentable: number): bigint | null {
  if (!booksAreActive(lines) || rentable <= 0) return null;
  if (!lines.some((line) => codes.includes(line.accountCode))) return null;
  const amount = sumByCodes(new Map(codes.map((code) => [code, debitOf(lines, code)])), codes);
  if (amount <= 0n) return null;
  return perUnitCents(amount, rentable);
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
  if (!period || rentable <= 0) {
    return { code, payrollPerUnitCents: null, controllablePerUnitCents: null, pmFeeBps: null };
  }
  const lines = await loadPostedLines({ entityIds: [entityId], from: period.startDate, to: period.endDate });
  if (!booksAreActive(lines)) {
    return { code, payrollPerUnitCents: null, controllablePerUnitCents: null, pmFeeBps: null };
  }
  const statement = buildIncomeStatement({ throughEnd: lines, inPeriod: lines });
  const pm = lines.some((line) => line.accountCode === "5910") ? debitOf(lines, "5910") : null;
  return {
    code,
    payrollPerUnitCents: expensePerUnit(lines, PAYROLL_CODES, rentable),
    controllablePerUnitCents: expensePerUnit(lines, CONTROLLABLE_OPEX_CODES, rentable),
    pmFeeBps: pm == null || pm <= 0n || statement.egi === 0n ? null : Number((pm * 10_000n) / statement.egi),
  };
}

export async function loadPlanFacts(opts: {
  entityId: string;
  entityCode: string;
  year: number;
  month: number;
  periodEnd: string;
  booksActive: boolean;
  egiCents: bigint | null;
  noiCents: bigint | null;
  otherIncomeCents: bigint | null;
  inPeriod: PostedLine[];
  throughEnd: PostedLine[];
  throughStart: PostedLine[];
  units: UnitSnapshot[];
  dealUnitCount: number | null;
  rentRollAsOf: string | null;
  businessPlanNote: string | null;
  controllableBudgetCents: bigint | null;
  includePeers: boolean;
}): Promise<PlanFacts> {
  const books = opts.booksActive;
  const moves = opts.units.length ? await loadMoveDates(opts.entityId, opts.year, opts.month) : new Map();
  const peers = opts.includePeers
    ? await prisma.entity.findMany({
    where: { ...ownedSpeWhere(), id: { not: opts.entityId } },
    select: { id: true, code: true },
    orderBy: { code: "asc" },
  })
    : [];
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
  const covenants = loan && books
    ? computeCovenants({
        noiCents: opts.noiCents ?? 0n,
        interestCents: payment?.interestCents ?? debitOf(opts.inPeriod, "6110"),
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
    reserveCashCents: loan && opts.throughEnd.length ? debitOf(opts.throughEnd, loan.reserveAccountCode) : null,
    rubsCents: books ? creditOf(opts.inPeriod, "4110") : null,
    utilityCents: books ? UTILITY_CODES.reduce((acc, code) => acc + debitOf(opts.inPeriod, code), 0n) : null,
    otherIncomeLines: books ? linesOf(opts.inPeriod, OTHER_INCOME_CODES, "credit") : null,
    utilityLines: books ? linesOf(opts.inPeriod, UTILITY_CODES, "debit") : null,
    dealUnitCount: opts.dealUnitCount,
    rentRollAsOf: opts.rentRollAsOf,
    units: opts.units.length ? unitsFromRentRoll(opts.units, moves) : null,
    peers: peerRows,
    opportunities: [],
    observations: [],
    loan: loan
      ? {
          name: loan.name,
          lenderName: loan.lenderName,
          reserveRequirementCents: loan.reserveRequirementCents,
          reserveAccountCode: loan.reserveAccountCode,
          reserveRequirementNote: loanThresholdNote(loan.reserveRequirementCents === LOAN_DEFAULT_RESERVE),
          dscrBps: books ? covenants?.dscrBps ?? null : null,
          dscrThresholdBps: loan.dscrThresholdBps,
          dscrThresholdNote: loanThresholdNote(loan.dscrThresholdBps === LOAN_DEFAULT_DSCR_BPS),
          debtYieldBps: books ? covenants?.debtYieldBps ?? null : null,
          debtYieldThresholdBps: loan.debtYieldThresholdBps,
          debtYieldThresholdNote: loanThresholdNote(loan.debtYieldThresholdBps === LOAN_DEFAULT_YIELD_BPS),
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

const LOAN_DEFAULT_DSCR_BPS = 12_500;
const LOAN_DEFAULT_YIELD_BPS = 800;
const LOAN_DEFAULT_RESERVE = 0n;

export function loanThresholdNote(matchesSchemaDefault: boolean): string {
  return matchesSchemaDefault ? "loan file default – confirm" : "from the loan file";
}

/** Income-statement activity means a posted 4xxx or 5xxx line. An opening-balance journal is not books. */
export function booksAreActive(lines: PostedLine[]): boolean {
  return lines.some((line) => /^[45]\d{3}$/.test(line.accountCode) && (line.debit !== 0n || line.credit !== 0n));
}

/** Missing any controllable budget line means the budget was not supplied. A missing line is not zero. */
export function controllableBudget(budget: Map<string, bigint> | null): bigint | null {
  if (!budget || budget.size === 0) return null;
  let total = 0n;
  for (const code of CONTROLLABLE_OPEX_CODES) {
    const amount = budget.get(code);
    if (amount == null) return null;
    total += amount;
  }
  return total;
}

export function isMissingPlanTable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2021" || error.code === "P2022")) return true;
  const message = error instanceof Error ? error.message : "";
  return /no such (table|column)|does not exist/i.test(message);
}

const BUDGET_ROW_CODES = ["4010", "4020", "4030", "4050", "4100", "4110", ...CONTROLLABLE_OPEX_CODES, ...UTILITY_CODES] as const;

function budgetRowsFor(lines: PostedLine[], budget: Map<string, bigint>, books: boolean): PlanBudgetRow[] {
  const balances = rollupBalances(lines);
  return BUDGET_ROW_CODES.map((code) => {
    const hasBudget = budget.has(code);
    const posted = lines.some((line) => line.accountCode === code);
    return {
      label: balances.find((row) => row.code === code)?.name ?? code,
      code,
      actual: books && posted ? (code.startsWith("4") ? -netByCode(balances, code) : netByCode(balances, code)) : books ? null : null,
      budget: hasBudget ? budget.get(code)! : null,
    };
  }).filter((row) => row.actual != null || row.budget != null);
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
      specialsNote: row.specialsNote,
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

export type PlanBooks = {
  year: number;
  month: number;
  periodLabel: string;
  fellBack: boolean;
  periodStatus: PeriodStatus | null;
  facts: PlanFacts;
  budgetRows: PlanBudgetRow[];
};

/**
 * Reads an existing period. A missing month falls back to the latest closed or posted period.
 * This function does not insert a Period or a checklist row.
 */
export async function readPlanBooks(opts: {
  entityId: string;
  entityCode: string;
  year: number;
  month: number;
  dealUnitCount: number | null;
  businessPlanNote: string | null;
  includePeers: boolean;
}): Promise<PlanBooks> {
  const period = await resolveReadablePeriod(opts.entityId, opts.year, opts.month);
  const fellBack = period != null && (period.year !== opts.year || period.month !== opts.month);
  const year = period?.year ?? opts.year;
  const month = period?.month ?? opts.month;
  const inPeriod = period
    ? await loadPostedLines({ entityIds: [opts.entityId], from: period.startDate, to: period.endDate })
    : [];
  const throughEnd = period ? await loadPostedLines({ entityIds: [opts.entityId], through: period.endDate }) : [];
  const throughStart = period
    ? await loadPostedLines({ entityIds: [opts.entityId], through: new Date(period.startDate.getTime() - 1) })
    : [];
  const books = booksAreActive(inPeriod);
  const statement = books ? buildIncomeStatement({ throughEnd, throughStart, inPeriod }) : null;
  const unitRows = await prisma.unit.findMany({
    where: { entityId: opts.entityId },
    orderBy: { unitCode: "asc" },
  });
  const asOfs = [...new Set(unitRows.map((row) => iso(row.asOfDate)).filter((value): value is string => Boolean(value)))].sort();
  const units: UnitSnapshot[] = unitRows.map((row) => ({
    unitCode: row.unitCode,
    floorplan: row.floorplan,
    beds: row.beds,
    bathsTenths: row.bathsTenths,
    sqft: row.sqft,
    status: row.status,
    substatus: row.substatus ?? undefined,
    marketRent: row.marketRent,
    inPlaceRent: row.inPlaceRent,
    leaseStart: row.leaseStart,
    leaseEnd: row.leaseEnd,
    concessionCents: row.concessionCents,
  }));
  const budget = period ? await loadBudgetMap({ entityIds: [opts.entityId], year, month }) : new Map<string, bigint>();
  const facts = await loadPlanFacts({
    entityId: opts.entityId,
    entityCode: opts.entityCode,
    year,
    month,
    periodEnd: periodEndIso(year, month),
    booksActive: books,
    egiCents: statement ? statement.egi : null,
    noiCents: statement ? statement.noi : null,
    otherIncomeCents: statement ? statement.otherIncome : null,
    inPeriod,
    throughEnd,
    throughStart,
    units,
    dealUnitCount: opts.dealUnitCount,
    rentRollAsOf: asOfs.at(-1) ?? null,
    businessPlanNote: opts.businessPlanNote,
    controllableBudgetCents: controllableBudget(budget),
    includePeers: opts.includePeers,
  });
  return {
    year,
    month,
    periodLabel: `${year}-${String(month).padStart(2, "0")}`,
    fellBack,
    periodStatus: period
      ? (await prisma.period.findUnique({ where: { id: period.id }, select: { status: true } }))?.status ?? null
      : null,
    facts,
    budgetRows: budgetRowsFor(inPeriod, budget, books),
  };
}
