import {
  CONTROLLABLE_OPEX_CODES,
  cashBreakdown,
  cfadsCents,
  cfadsDscrBps,
  formatNoiDefinition,
  gaRatioBps,
  liquidityMonthsHundredths,
  noiPerUnitCents,
  opexRatioBps,
  periodPpeAdditionsCents,
  ratioAvailability,
  sumByCodes,
  trailingNoi,
} from "@rcp/analytics";
import { computeCovenants } from "@rcp/debt";
import {
  OPEX_GROUPS,
  buildBalanceSheet,
  buildIncomeStatement,
  netByCode,
  principalPaydownFromLines,
  rollupBalances,
  type IncomeStatement,
  type PostedLine,
} from "@rcp/ledger";
import { bookEconomicOccupancy, breakevenOccupancy, summarizeRentRoll, type UnitSnapshot } from "@rcp/properties";
import { pairVariance, btcfCents, type MoneyLine, type PeriodSnapshot, type TrendPoint } from "@rcp/reporting";
import { loadCapexProjects } from "./capex";
import { buildOpCoDashboard, buildPropertyDashboard } from "./dashboards";
import { loadPortfolioDebt } from "./debt-view";
import { buildOperatingPackage } from "./operating";
import { prisma } from "./prisma";
import { listPeriods, loadPostedLines } from "./queries";
import { resolveReportScope } from "./reports-server";
import { loadSpeWaterfall, runRecordWaterfall } from "./waterfall";

function leaseRollover12mCount(units: { leaseEnd: Date | null }[], asOf: Date): number | null {
  if (!units.length) return null;
  if (!units.some((u) => u.leaseEnd)) return null;
  const horizon = new Date(asOf.getTime());
  horizon.setUTCFullYear(horizon.getUTCFullYear() + 1);
  return units.filter((u) => u.leaseEnd && u.leaseEnd > asOf && u.leaseEnd <= horizon).length;
}

function glMortgageCents(throughEnd: PostedLine[]): bigint {
  let n = 0n;
  for (const line of throughEnd) {
    if (line.accountCode === "2110" || line.accountCode === "2210") n += line.credit - line.debit;
  }
  return n;
}

function mapCloseStatus(status: string | undefined): PeriodSnapshot["closeStatus"] {
  if (status === "CLOSED") return "closed";
  if (status === "SOFT_CLOSED") return "soft_closed";
  if (status === "OPEN") return "open";
  return "unknown";
}

async function loadOpsControls(opts: {
  entityId: string;
  entityIds: string[];
  entityCode: string;
  year: number;
  month: number;
  throughEnd: PostedLine[];
  units: { leaseEnd: Date | null }[];
  asOf: Date;
  propertyCount: number;
}): Promise<{
  closeStatus: PeriodSnapshot["closeStatus"];
  glDebtCents: bigint;
  leaseRollover12mCount: number | null;
  propertyCount: number;
  vaultDocCount: number;
  schedulerJobCount: number;
}> {
  const [periodRow, vaultDocCount, schedulerJobCount] = await Promise.all([
    prisma.period.findUnique({
      where: { entityId_year_month: { entityId: opts.entityId, year: opts.year, month: opts.month } },
      select: { status: true },
    }),
    prisma.vaultDocument.count({ where: { entityId: { in: opts.entityIds } } }),
    prisma.reportJob.count({
      where: { OR: [{ entityId: { in: opts.entityIds } }, { entityCode: opts.entityCode }] },
    }),
  ]);
  return {
    closeStatus: mapCloseStatus(periodRow?.status),
    glDebtCents: glMortgageCents(opts.throughEnd),
    leaseRollover12mCount: leaseRollover12mCount(opts.units, opts.asOf),
    propertyCount: opts.propertyCount,
    vaultDocCount,
    schedulerJobCount,
  };
}

function debitNetMap(lines: PostedLine[]): Map<string, bigint> {
  const map = new Map<string, bigint>();
  for (const line of lines) {
    map.set(line.accountCode, (map.get(line.accountCode) ?? 0n) + line.debit - line.credit);
  }
  return map;
}

function asOfAssetMap(lines: PostedLine[]): Map<string, bigint> {
  const balances = rollupBalances(lines);
  const map = new Map<string, bigint>();
  for (const row of balances) {
    map.set(row.code, netByCode(balances, row.code));
  }
  return map;
}

function opexLinesFrom(actual: IncomeStatement, budget: IncomeStatement | null): MoneyLine[] {
  return OPEX_GROUPS.map((g) => {
    const actualRow = actual.rows.find((r) => r.key === g.key);
    const budgetRow = budget?.rows.find((r) => r.key === g.key);
    return {
      key: g.key,
      label: g.label,
      code: g.code,
      actualCents: actualRow?.amount ?? 0n,
      budgetCents: budget ? (budgetRow?.amount ?? 0n) : null,
    };
  });
}

function incomeBridge(actual: IncomeStatement, budget: IncomeStatement | null): MoneyLine[] {
  const row = (key: string, label: string, code: string, pick: (s: IncomeStatement) => bigint): MoneyLine => ({
    key,
    label,
    code,
    actualCents: pick(actual),
    budgetCents: budget ? pick(budget) : null,
  });
  return [
    row("gpr", "Gross Potential Rent", "4010", (s) => s.gpr),
    row("vac", "Vacancy Loss", "4020", (s) => s.vacancy),
    row("conc", "Concessions", "4030", (s) => s.concessions),
    row("oi", "Other Income", "4100", (s) => s.otherIncome),
  ];
}

function bsSlices(bs: ReturnType<typeof buildBalanceSheet>) {
  const pick = (key: string) => bs.rows.find((r) => r.key === key)?.amount ?? 0n;
  return {
    assets: [
      { key: "cash", label: "Cash", cents: pick("cash") },
      { key: "ar", label: "AR", cents: pick("ar") },
      { key: "pre", label: "Prepaid", cents: pick("pre") },
      { key: "ppe", label: "Net PPE", cents: pick("nppe") },
      { key: "inv", label: "Investments", cents: pick("inv") },
    ],
    liabilities: [
      { key: "cl", label: "Current liabilities", cents: pick("tcl") },
      { key: "lt", label: "LT mortgage", cents: pick("mlt") },
    ],
    equity: [{ key: "eq", label: "Members' equity", cents: pick("te") }],
  };
}

async function trendForEntity(entityId: string, year: number, month: number): Promise<TrendPoint[]> {
  const periods = await listPeriods(entityId);
  const points: TrendPoint[] = [];
  for (const period of periods) {
    if (period.year > year || (period.year === year && period.month > month)) continue;
    const inPeriod = await loadPostedLines({ entityIds: [entityId], from: period.startDate, to: period.endDate });
    const throughEnd = await loadPostedLines({ entityIds: [entityId], through: period.endDate });
    const throughStart = await loadPostedLines({
      entityIds: [entityId],
      through: new Date(period.startDate.getTime() - 1),
    });
    const is = buildIncomeStatement({ throughEnd, inPeriod });
    const principal = principalPaydownFromLines(throughStart, throughEnd);
    const ds = is.interest + principal;
    points.push({
      period: `${period.year}-${String(period.month).padStart(2, "0")}`,
      noiCents: is.noi,
      egiCents: is.egi,
      opexCents: is.opex,
      opexRatioBps: opexRatioBps(is.opex, is.egi),
      bookEconomicOccupancyBps: is.gpr > 0n ? bookEconomicOccupancy(is.egi, is.gpr).economicOccupancyBps : null,
      dscrBps: ds > 0n ? Number((is.noi * 10_000n) / ds) : null,
      interestCents: is.interest,
      principalCents: principal,
    });
  }
  return points;
}

export async function loadPeriodSnapshot(opts: {
  entityId: string;
  entityType: string;
  year: number;
  month: number;
}): Promise<PeriodSnapshot> {
  if (opts.entityType === "HOLDCO") {
    throw new Error("HoldCo has no operating pack. Switch to RCP-OPCO or an SPE.");
  }
  const period = `${opts.year}-${String(opts.month).padStart(2, "0")}`;
  const ltv = ratioAvailability("ltl");
  const delq = ratioAvailability("delinquency");

  if (opts.entityType === "OPCO") {
    return loadOpCoSnapshot({ ...opts, period, ltvReason: ltv.reason, delinquencyReason: delq.reason });
  }
  return loadSpeSnapshot({ ...opts, period, ltvReason: ltv.reason, delinquencyReason: delq.reason });
}

async function loadSpeSnapshot(opts: {
  entityId: string;
  year: number;
  month: number;
  period: string;
  ltvReason: string;
  delinquencyReason: string;
}): Promise<PeriodSnapshot> {
  const pack = await buildOperatingPackage({
    entityId: opts.entityId,
    year: opts.year,
    month: opts.month,
    consolidated: false,
  });
  const dash = await buildPropertyDashboard({ entityId: opts.entityId, year: opts.year, month: opts.month });
  const actual = pack.operating.actual;
  const budget = pack.operating.budget;
  const inPeriodMap = debitNetMap(pack.scope.inPeriod);
  const endMap = asOfAssetMap(pack.scope.throughEnd);
  const startMap = asOfAssetMap(pack.scope.throughStart);
  const cash = cashBreakdown(endMap);
  const controllable = sumByCodes(inPeriodMap, CONTROLLABLE_OPEX_CODES);
  const periodCapex = periodPpeAdditionsCents(startMap, endMap);
  const loan = dash.loans[0];
  const interest = loan?.interestCents ?? actual.interest;
  const principal = loan?.principalCents ?? principalPaydownFromLines(pack.scope.throughStart, pack.scope.throughEnd);
  const reserveReq = loan?.reserveRequirementCents ?? 0n;
  const cfads = cfadsCents({ periodNoiCents: actual.noi, periodCapexCents: periodCapex, reserveRequirementCents: reserveReq });
  const variance = pairVariance(actual.noi, budget?.noi ?? null, pack.operating.prior?.noi ?? null);
  const rr = pack.kpis.rentRoll;
  const covenants = loan
    ? loan.covenants
    : computeCovenants({
        noiCents: actual.noi,
        interestCents: interest,
        principalCents: principal,
        upbCents: 0n,
        dscrThresholdBps: 12_500,
        debtYieldThresholdBps: 800,
      });
  const bs = buildBalanceSheet({
    throughEnd: pack.scope.throughEnd,
    throughStart: pack.scope.throughStart,
    inPeriod: pack.scope.inPeriod,
  });
  const slices = bsSlices(bs);
  const capex = (await loadCapexProjects([opts.entityId])).map((p) => ({
    name: p.name,
    entityCode: p.entity.code,
    classification: p.classification,
    status: p.status,
    budgetCents: p.budgetCents,
    spentCents: p.spentCents,
  }));
  const trends = await trendForEntity(opts.entityId, opts.year, opts.month);
  const t12 = dash.t12;
  const entity = pack.scope.entity;
  const wfRecord = await loadSpeWaterfall(opts.entityId);
  const wfRun = wfRecord
    ? runRecordWaterfall(wfRecord, cfads > 0n ? cfads : 0n, { periodMonths: 1, europeanPromoteOpen: true })
    : null;
  const controls = await loadOpsControls({
    entityId: opts.entityId,
    entityIds: [opts.entityId],
    entityCode: entity.code,
    year: opts.year,
    month: opts.month,
    throughEnd: pack.scope.throughEnd,
    units: pack.units,
    asOf: pack.scope.period.endDate,
    propertyCount: 1,
  });

  return {
    entityCode: entity.code,
    entityName: entity.name,
    entityType: "SPE",
    period: opts.period,
    year: opts.year,
    month: opts.month,
    unitCount: entity.unitCount ?? 0,
    strategy: entity.strategy,
    viewLabel: "Standalone",
    lookThroughLabel: null,
    combinedNote: null,
    rollupIsNotGaap: false,
    gprCents: actual.gpr,
    vacancyCents: actual.vacancy,
    concessionsCents: actual.concessions,
    egrCents: actual.egr,
    otherIncomeCents: actual.otherIncome,
    egiCents: actual.egi,
    opexCents: actual.opex,
    noiCents: actual.noi,
    interestCents: interest,
    depreciationCents: actual.depreciation,
    amFeesCents: actual.amFees,
    amIncomeCents: actual.amIncome,
    netIncomeCents: actual.netIncome,
    principalCents: principal,
    btcfCents: btcfCents({ periodNoiCents: actual.noi, interestCents: interest, principalCents: principal }),
    budgetNoiCents: budget?.noi ?? null,
    budgetGprCents: budget?.gpr ?? null,
    budgetVacancyCents: budget?.vacancy ?? null,
    budgetConcessionsCents: budget?.concessions ?? null,
    budgetOtherIncomeCents: budget?.otherIncome ?? null,
    budgetEgiCents: budget?.egi ?? null,
    budgetOpexCents: budget?.opex ?? null,
    priorNoiCents: pack.operating.prior?.noi ?? null,
    opexLines: opexLinesFrom(actual, budget),
    incomeBridgeLines: incomeBridge(actual, budget),
    opexRatioBps: opexRatioBps(actual.opex, actual.egi),
    controllableOpexCents: controllable,
    controllableOpexRatioBps: opexRatioBps(controllable, actual.egi),
    noiPerUnitCents: noiPerUnitCents(actual.noi, entity.unitCount ?? 0),
    noiVarianceCents: variance.variance,
    noiVarianceBps: variance.varianceBps,
    physicalOccupancyBps: rr?.physicalOccupancyBps ?? null,
    occupiedCount: rr?.occupiedCount ?? null,
    rentableCount: rr?.rentableCount ?? null,
    downCount: rr?.downCount ?? null,
    bookEconomicOccupancyBps: pack.kpis.bookEconomic?.economicOccupancyBps ?? null,
    breakevenOccupancyBps: pack.kpis.breakeven?.breakevenOccupancyBps ?? null,
    lossToLeaseCents: rr?.lossToLease ?? null,
    cashOperatingCents: cash.operating,
    cashReserveCents: cash.reserve,
    cashEscrowCents: cash.escrow,
    cashDepositsCents: cash.deposits,
    cashTotalCents: cash.total,
    periodCapexCents: periodCapex,
    reserveRequirementCents: reserveReq,
    cfadsCents: cfads,
    cfadsDscrBps: cfadsDscrBps(cfads, interest + principal),
    liquidityMonthsHundredths: liquidityMonthsHundredths(cash.total, actual.opex),
    dscrBps: covenants.dscrBps,
    dscrThresholdBps: covenants.dscrThresholdBps,
    dscrPass: covenants.dscrPass,
    debtYieldBps: covenants.debtYieldBps,
    debtYieldThresholdBps: covenants.debtYieldThresholdBps,
    debtYieldPass: covenants.debtYieldPass,
    upbCents: loan?.currentUpbCents ?? 0n,
    maturityDate: loan ? loan.maturityDate.toISOString().slice(0, 10) : null,
    monthsRemaining: loan?.monthsRemaining ?? null,
    t12MonthsAvailable: t12.monthsAvailable,
    t12NoiCents: t12.noiCents,
    t12Complete: t12.definition === "t12",
    t12Label: formatNoiDefinition(t12.definition),
    ltvGated: true,
    delinquencyGated: true,
    ltvReason: opts.ltvReason,
    delinquencyReason: opts.delinquencyReason,
    feeIncomeCents: null,
    gaRatioBps: null,
    lookThroughNoiCents: null,
    combinedRollupNoiCents: null,
    waterfallApplied: Boolean(wfRun && !wfRun.lookThrough),
    cashLookThroughCents: cash.total,
    cfadsLookThroughCents: cfads,
    lpShareOfDistributableCents: wfRun?.lpCents ?? 0n,
    gpShareOfDistributableCents: wfRun?.gpCents ?? (cfads > 0n ? cfads : 0n),
    lpPrefUnpaidCents: wfRun?.unpaidPrefAfterCents ?? 0n,
    waterfallNote: wfRun && !wfRun.lookThrough ? wfRun.notes.join(" ") : null,
    trends,
    loans: dash.loans.map((l) => ({
      entityCode: l.entityCode,
      entityName: l.entityName,
      lenderName: l.lenderName,
      name: l.name,
      currentUpbCents: l.currentUpbCents,
      interestCents: l.interestCents,
      principalCents: l.principalCents,
      reserveRequirementCents: l.reserveRequirementCents,
      maturityDate: l.maturityDate.toISOString().slice(0, 10),
      monthsRemaining: l.monthsRemaining,
      dscrBps: l.covenants.dscrBps,
      dscrThresholdBps: l.covenants.dscrThresholdBps,
      dscrPass: l.covenants.dscrPass,
      debtYieldBps: l.covenants.debtYieldBps,
      debtYieldThresholdBps: l.covenants.debtYieldThresholdBps,
      debtYieldPass: l.covenants.debtYieldPass,
    })),
    watchlist: [],
    concentration: [
      {
        entityCode: entity.code,
        entityName: entity.name,
        noiCents: actual.noi,
        shareBps: 10_000,
        unitCount: entity.unitCount ?? 0,
        opexRatioBps: opexRatioBps(actual.opex, actual.egi),
        bookEconomicOccupancyBps: pack.kpis.bookEconomic?.economicOccupancyBps ?? null,
        physicalOccupancyBps: rr?.physicalOccupancyBps ?? null,
        dscrBps: covenants.dscrBps,
        dscrPass: covenants.dscrPass,
      },
    ],
    bsAssets: slices.assets,
    bsLiabilities: slices.liabilities,
    bsEquity: slices.equity,
    bsTotalAssetsCents: bs.totalAssets,
    bsTotalLiabilitiesCents: bs.totalLiabilities,
    bsTotalEquityCents: bs.totalEquity,
    bsBalanced: bs.balanced,
    capexProjects: capex,
    closeStatus: controls.closeStatus,
    glDebtCents: controls.glDebtCents,
    leaseRollover12mCount: controls.leaseRollover12mCount,
    propertyCount: controls.propertyCount,
    vaultDocCount: controls.vaultDocCount,
    schedulerJobCount: controls.schedulerJobCount,
  };
}

async function loadOpCoSnapshot(opts: {
  entityId: string;
  year: number;
  month: number;
  period: string;
  ltvReason: string;
  delinquencyReason: string;
}): Promise<PeriodSnapshot> {
  const dash = await buildOpCoDashboard({ opcoId: opts.entityId, year: opts.year, month: opts.month });
  const opco = await prisma.entity.findUniqueOrThrow({
    where: { id: opts.entityId },
    include: { children: true },
  });
  const spes = opco.children.filter((c) => c.type === "SPE" && c.lifecycleStatus !== "ARCHIVED").sort((a, b) => a.code.localeCompare(b.code));
  const spePacks = await Promise.all(
    spes.map((spe) =>
      buildOperatingPackage({ entityId: spe.id, year: opts.year, month: opts.month, consolidated: false }).then((pack) => ({
        spe,
        pack,
      })),
    ),
  );
  const combinedScope = await resolveReportScope({
    entityId: opts.entityId,
    year: opts.year,
    month: opts.month,
    consolidated: true,
  });
  const combinedIs = buildIncomeStatement({
    throughEnd: combinedScope.throughEnd,
    throughStart: combinedScope.throughStart,
    inPeriod: combinedScope.inPeriod,
    eliminate: true,
  });
  const combinedBs = buildBalanceSheet({
    throughEnd: combinedScope.throughEnd,
    throughStart: combinedScope.throughStart,
    inPeriod: combinedScope.inPeriod,
    eliminate: true,
  });
  const opcoPack = await buildOperatingPackage({
    entityId: opts.entityId,
    year: opts.year,
    month: opts.month,
    consolidated: false,
  });

  let gpr = 0n;
  let vacancy = 0n;
  let concessions = 0n;
  let otherIncome = 0n;
  let egi = 0n;
  let opex = 0n;
  let noi = 0n;
  let interest = 0n;
  let depreciation = 0n;
  let amFees = 0n;
  let principal = 0n;
  let periodCapex = 0n;
  let cashOperating = 0n;
  let cashReserve = 0n;
  let cashEscrow = 0n;
  let cashDeposits = 0n;
  let cashTotal = 0n;
  let controllable = 0n;
  const opexAcc = new Map<string, { label: string; code: string; actual: bigint; budget: bigint }>();
  for (const g of OPEX_GROUPS) opexAcc.set(g.key, { label: g.label, code: g.code, actual: 0n, budget: 0n });
  let budgetNoi: bigint | null = 0n;
  let budgetGpr: bigint | null = 0n;
  let budgetVac: bigint | null = 0n;
  let budgetConc: bigint | null = 0n;
  let budgetOi: bigint | null = 0n;
  let budgetEgi: bigint | null = 0n;
  let budgetOpex: bigint | null = 0n;
  let hasBudget = false;
  let occupied = 0;
  let rentable = 0;
  let down = 0;
  let lossToLease = 0n;
  let hasRr = false;
  const allUnits: UnitSnapshot[] = [];

  for (const row of spePacks) {
    const a = row.pack.operating.actual;
    const b = row.pack.operating.budget;
    gpr += a.gpr;
    vacancy += a.vacancy;
    concessions += a.concessions;
    otherIncome += a.otherIncome;
    egi += a.egi;
    opex += a.opex;
    noi += a.noi;
    interest += a.interest;
    depreciation += a.depreciation;
    amFees += a.amFees;
    principal += principalPaydownFromLines(row.pack.scope.throughStart, row.pack.scope.throughEnd);
    const start = asOfAssetMap(row.pack.scope.throughStart);
    const end = asOfAssetMap(row.pack.scope.throughEnd);
    periodCapex += periodPpeAdditionsCents(start, end);
    const cash = cashBreakdown(end);
    cashOperating += cash.operating;
    cashReserve += cash.reserve;
    cashEscrow += cash.escrow;
    cashDeposits += cash.deposits;
    cashTotal += cash.total;
    controllable += sumByCodes(debitNetMap(row.pack.scope.inPeriod), CONTROLLABLE_OPEX_CODES);
    for (const g of OPEX_GROUPS) {
      const acc = opexAcc.get(g.key)!;
      acc.actual += a.rows.find((r) => r.key === g.key)?.amount ?? 0n;
      if (b) {
        acc.budget += b.rows.find((r) => r.key === g.key)?.amount ?? 0n;
      }
    }
    if (b) {
      hasBudget = true;
      budgetNoi = (budgetNoi ?? 0n) + b.noi;
      budgetGpr = (budgetGpr ?? 0n) + b.gpr;
      budgetVac = (budgetVac ?? 0n) + b.vacancy;
      budgetConc = (budgetConc ?? 0n) + b.concessions;
      budgetOi = (budgetOi ?? 0n) + b.otherIncome;
      budgetEgi = (budgetEgi ?? 0n) + b.egi;
      budgetOpex = (budgetOpex ?? 0n) + b.opex;
    }
    const rr = row.pack.kpis.rentRoll;
    if (rr) {
      hasRr = true;
      occupied += rr.occupiedCount;
      rentable += rr.rentableCount;
      down += rr.downCount;
      lossToLease += rr.lossToLease;
    }
    allUnits.push(...row.pack.units);
  }

  const opcoEnd = asOfAssetMap(opcoPack.scope.throughEnd);
  const opcoCash = cashBreakdown(opcoEnd);
  cashOperating += opcoCash.operating;
  cashReserve += opcoCash.reserve;
  cashEscrow += opcoCash.escrow;
  cashDeposits += opcoCash.deposits;
  cashTotal += opcoCash.total;

  const loans = await loadPortfolioDebt(opts.year, opts.month);
  const lookThroughUpb = loans.reduce((acc, l) => acc + l.currentUpbCents, 0n);
  const reserveReq = loans.reduce((acc, l) => acc + l.reserveRequirementCents, 0n);
  const loanInterest = loans.reduce((acc, l) => acc + l.interestCents, 0n);
  const loanPrincipal = loans.reduce((acc, l) => acc + l.principalCents, 0n);
  const useInterest = loanInterest || interest;
  const usePrincipal = loanPrincipal || principal;
  const cfads = cfadsCents({ periodNoiCents: noi, periodCapexCents: periodCapex, reserveRequirementCents: reserveReq });
  const covenants = computeCovenants({
    noiCents: noi,
    interestCents: useInterest,
    principalCents: usePrincipal,
    upbCents: lookThroughUpb,
    dscrThresholdBps: 12_500,
    debtYieldThresholdBps: 800,
  });
  const variance = pairVariance(noi, hasBudget ? budgetNoi : null, null);
  const stackedRr = hasRr ? summarizeRentRoll(allUnits) : null;
  const book = gpr > 0n ? bookEconomicOccupancy(egi, gpr) : null;
  const egr = gpr - vacancy - concessions;
  const feeIncome = opcoPack.operating.actual.amIncome;
  const ga = sumByCodes(debitNetMap(opcoPack.scope.inPeriod), ["5110", "5610", "5990"]);
  const slices = bsSlices(combinedBs);
  const speIds = spes.map((s) => s.id);
  const capex = (await loadCapexProjects([opts.entityId, ...speIds])).map((p) => ({
    name: p.name,
    entityCode: p.entity.code,
    classification: p.classification,
    status: p.status,
    budgetCents: p.budgetCents,
    spentCents: p.spentCents,
  }));

  const trendParts = await Promise.all(spes.map((spe) => trendForEntity(spe.id, opts.year, opts.month)));
  const periodSet = new Set<string>();
  for (const series of trendParts) for (const p of series) periodSet.add(p.period);
  const trends: TrendPoint[] = [...periodSet].sort().map((label) => {
    const pts = trendParts.map((s) => s.find((p) => p.period === label)).filter(Boolean) as TrendPoint[];
    const noiSum = pts.reduce((acc, p) => acc + p.noiCents, 0n);
    const egiSum = pts.reduce((acc, p) => acc + p.egiCents, 0n);
    const opexSum = pts.reduce((acc, p) => acc + p.opexCents, 0n);
    const intSum = pts.reduce((acc, p) => acc + p.interestCents, 0n);
    const prinSum = pts.reduce((acc, p) => acc + p.principalCents, 0n);
    const ds = intSum + prinSum;
    return {
      period: label,
      noiCents: noiSum,
      egiCents: egiSum,
      opexCents: opexSum,
      opexRatioBps: opexRatioBps(opexSum, egiSum),
      bookEconomicOccupancyBps: null,
      dscrBps: ds > 0n ? Number((noiSum * 10_000n) / ds) : null,
      interestCents: intSum,
      principalCents: prinSum,
    };
  });
  // Book economic occupancy per stacked month: EGI / GPR. Reconstruct GPR from EGI and stored occ when possible.
  for (let i = 0; i < trends.length; i += 1) {
    const pts = trendParts.map((s) => s.find((p) => p.period === trends[i]!.period)).filter(Boolean) as TrendPoint[];
    let egiSum = 0n;
    let impliedGpr = 0n;
    for (const p of pts) {
      egiSum += p.egiCents;
      if (p.bookEconomicOccupancyBps && p.bookEconomicOccupancyBps > 0) {
        impliedGpr += (p.egiCents * 10_000n) / BigInt(p.bookEconomicOccupancyBps);
      }
    }
    trends[i]!.bookEconomicOccupancyBps = impliedGpr > 0n ? bookEconomicOccupancy(egiSum, impliedGpr).economicOccupancyBps : null;
  }

  const lookThroughUnits = dash.properties.reduce((acc, p) => acc + p.unitCount, 0);
  const near = loans[0];
  const controls = await loadOpsControls({
    entityId: opts.entityId,
    entityIds: [opts.entityId, ...spes.map((s) => s.id)],
    entityCode: opco.code,
    year: opts.year,
    month: opts.month,
    throughEnd: combinedScope.throughEnd,
    units: allUnits,
    asOf: combinedScope.period.endDate,
    propertyCount: dash.properties.length || spes.length,
  });

  return {
    entityCode: opco.code,
    entityName: opco.name,
    entityType: "OPCO",
    period: opts.period,
    year: opts.year,
    month: opts.month,
    unitCount: lookThroughUnits,
    strategy: null,
    viewLabel: dash.viewLabel,
    lookThroughLabel: dash.lookThroughLabel,
    combinedNote: dash.combinedNote,
    rollupIsNotGaap: true,
    gprCents: gpr,
    vacancyCents: vacancy,
    concessionsCents: concessions,
    egrCents: egr,
    otherIncomeCents: otherIncome,
    egiCents: egi,
    opexCents: opex,
    noiCents: noi,
    interestCents: useInterest,
    depreciationCents: depreciation,
    amFeesCents: amFees,
    amIncomeCents: feeIncome,
    netIncomeCents: combinedIs.netIncome,
    principalCents: usePrincipal,
    btcfCents: btcfCents({ periodNoiCents: noi, interestCents: useInterest, principalCents: usePrincipal }),
    budgetNoiCents: hasBudget ? budgetNoi : null,
    budgetGprCents: hasBudget ? budgetGpr : null,
    budgetVacancyCents: hasBudget ? budgetVac : null,
    budgetConcessionsCents: hasBudget ? budgetConc : null,
    budgetOtherIncomeCents: hasBudget ? budgetOi : null,
    budgetEgiCents: hasBudget ? budgetEgi : null,
    budgetOpexCents: hasBudget ? budgetOpex : null,
    priorNoiCents: null,
    opexLines: [...opexAcc.entries()].map(([key, v]) => ({
      key,
      label: v.label,
      code: v.code,
      actualCents: v.actual,
      budgetCents: hasBudget ? v.budget : null,
    })),
    incomeBridgeLines: [
      { key: "gpr", label: "Gross Potential Rent", code: "4010", actualCents: gpr, budgetCents: hasBudget ? budgetGpr : null },
      { key: "vac", label: "Vacancy Loss", code: "4020", actualCents: vacancy, budgetCents: hasBudget ? budgetVac : null },
      { key: "conc", label: "Concessions", code: "4030", actualCents: concessions, budgetCents: hasBudget ? budgetConc : null },
      { key: "oi", label: "Other Income", code: "4100", actualCents: otherIncome, budgetCents: hasBudget ? budgetOi : null },
    ],
    opexRatioBps: opexRatioBps(opex, egi),
    controllableOpexCents: controllable,
    controllableOpexRatioBps: opexRatioBps(controllable, egi),
    noiPerUnitCents: noiPerUnitCents(noi, lookThroughUnits),
    noiVarianceCents: variance.variance,
    noiVarianceBps: variance.varianceBps,
    physicalOccupancyBps: stackedRr?.physicalOccupancyBps ?? null,
    occupiedCount: stackedRr?.occupiedCount ?? (hasRr ? occupied : null),
    rentableCount: stackedRr?.rentableCount ?? (hasRr ? rentable : null),
    downCount: stackedRr?.downCount ?? (hasRr ? down : null),
    bookEconomicOccupancyBps: book?.economicOccupancyBps ?? null,
    breakevenOccupancyBps:
      gpr > 0n
        ? breakevenOccupancy({
            opex,
            interest: useInterest,
            principalPaydown: usePrincipal,
            otherIncome,
            gpr,
          }).breakevenOccupancyBps
        : null,
    lossToLeaseCents: hasRr ? lossToLease : null,
    cashOperatingCents: dash.waterfallApplied && cashTotal > 0n
      ? (cashOperating * dash.cashAfterWaterfallCents) / cashTotal
      : cashOperating,
    cashReserveCents: dash.waterfallApplied && cashTotal > 0n
      ? (cashReserve * dash.cashAfterWaterfallCents) / cashTotal
      : cashReserve,
    cashEscrowCents: dash.waterfallApplied && cashTotal > 0n
      ? (cashEscrow * dash.cashAfterWaterfallCents) / cashTotal
      : cashEscrow,
    cashDepositsCents: dash.waterfallApplied && cashTotal > 0n
      ? dash.cashAfterWaterfallCents -
        (cashOperating * dash.cashAfterWaterfallCents) / cashTotal -
        (cashReserve * dash.cashAfterWaterfallCents) / cashTotal -
        (cashEscrow * dash.cashAfterWaterfallCents) / cashTotal
      : cashDeposits,
    cashTotalCents: dash.cashAfterWaterfallCents,
    periodCapexCents: periodCapex,
    reserveRequirementCents: reserveReq,
    cfadsCents: dash.cfadsAfterWaterfallCents,
    cfadsDscrBps: cfadsDscrBps(dash.cfadsAfterWaterfallCents, useInterest + usePrincipal),
    liquidityMonthsHundredths: liquidityMonthsHundredths(dash.cashAfterWaterfallCents, opex),
    dscrBps: covenants.dscrBps,
    dscrThresholdBps: covenants.dscrThresholdBps,
    dscrPass: covenants.dscrPass,
    debtYieldBps: covenants.debtYieldBps,
    debtYieldThresholdBps: covenants.debtYieldThresholdBps,
    debtYieldPass: covenants.debtYieldPass,
    upbCents: lookThroughUpb,
    maturityDate: near ? near.maturityDate.toISOString().slice(0, 10) : null,
    monthsRemaining: near ? Math.min(...loans.map((l) => l.monthsRemaining)) : null,
    t12MonthsAvailable: dash.t12.monthsAvailable,
    t12NoiCents: dash.t12.noiCents,
    t12Complete: dash.t12.definition === "t12",
    t12Label: formatNoiDefinition(dash.t12.definition),
    ltvGated: true,
    delinquencyGated: true,
    ltvReason: opts.ltvReason,
    delinquencyReason: opts.delinquencyReason,
    feeIncomeCents: feeIncome,
    gaRatioBps: gaRatioBps(ga, feeIncome),
    lookThroughNoiCents: noi,
    combinedRollupNoiCents: combinedIs.noi,
    waterfallApplied: dash.waterfallApplied,
    cashLookThroughCents: dash.cashLookThroughCents,
    cfadsLookThroughCents: dash.cfadsLookThroughCents,
    lpShareOfDistributableCents: dash.lpShareCfadsCents,
    gpShareOfDistributableCents: dash.cfadsAfterWaterfallCents,
    lpPrefUnpaidCents: dash.lpPrefUnpaidCents,
    waterfallNote: dash.waterfallNote,
    trends,
    loans: loans.map((l) => ({
      entityCode: l.entityCode,
      entityName: l.entityName,
      lenderName: l.lenderName,
      name: l.name,
      currentUpbCents: l.currentUpbCents,
      interestCents: l.interestCents,
      principalCents: l.principalCents,
      reserveRequirementCents: l.reserveRequirementCents,
      maturityDate: l.maturityDate.toISOString().slice(0, 10),
      monthsRemaining: l.monthsRemaining,
      dscrBps: l.covenants.dscrBps,
      dscrThresholdBps: l.covenants.dscrThresholdBps,
      dscrPass: l.covenants.dscrPass,
      debtYieldBps: l.covenants.debtYieldBps,
      debtYieldThresholdBps: l.covenants.debtYieldThresholdBps,
      debtYieldPass: l.covenants.debtYieldPass,
    })),
    watchlist: dash.watchlist,
    concentration: dash.concentration.map((c) => {
      const pack = spePacks.find((p) => p.spe.code === c.entityCode);
      const loan = loans.find((l) => l.entityCode === c.entityCode);
      const a = pack?.pack.operating.actual;
      return {
        entityCode: c.entityCode,
        entityName: c.entityName,
        noiCents: c.noiCents,
        shareBps: c.shareBps,
        unitCount: c.unitCount,
        opexRatioBps: a ? opexRatioBps(a.opex, a.egi) : null,
        bookEconomicOccupancyBps: a && a.gpr > 0n ? bookEconomicOccupancy(a.egi, a.gpr).economicOccupancyBps : null,
        physicalOccupancyBps: pack?.pack.kpis.rentRoll?.physicalOccupancyBps ?? null,
        dscrBps: loan?.covenants.dscrBps ?? null,
        dscrPass: loan?.covenants.dscrPass ?? null,
      };
    }),
    bsAssets: slices.assets,
    bsLiabilities: slices.liabilities,
    bsEquity: slices.equity,
    bsTotalAssetsCents: combinedBs.totalAssets,
    bsTotalLiabilitiesCents: combinedBs.totalLiabilities,
    bsTotalEquityCents: combinedBs.totalEquity,
    bsBalanced: combinedBs.balanced,
    capexProjects: capex,
    closeStatus: controls.closeStatus,
    glDebtCents: controls.glDebtCents,
    leaseRollover12mCount: controls.leaseRollover12mCount,
    propertyCount: controls.propertyCount,
    vaultDocCount: controls.vaultDocCount,
    schedulerJobCount: controls.schedulerJobCount,
  };
}
