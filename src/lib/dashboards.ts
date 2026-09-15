import {
  CASH_CODES,
  CONTROLLABLE_OPEX_CODES,
  OPCO_GA_CODES,
  RATIO_DICTIONARY,
  annualizePeriodNoi,
  cashBreakdown,
  cfadsCents,
  cfadsDscrBps,
  formatMonthsHundredths,
  formatNoiDefinition,
  gaRatioBps,
  getRatioDefinition,
  liquidityMonthsHundredths,
  noiConcentration,
  noiPerUnitCents,
  opexRatioBps,
  periodPpeAdditionsCents,
  ratioAvailability,
  statementHref,
  sumByCodes,
  trailingNoi,
  type ConcentrationRow,
  type LiveContributor,
  type RatioDefinition,
  type RatioId,
  type TrailingNoi,
} from "@rcp/analytics";
import { computeCovenants, formatMultipleBps, formatPercentBps, monthsToMaturity } from "@rcp/debt";
import {
  buildIncomeStatement,
  formatUsd,
  netByCode,
  principalPaydownFromLines,
  rollupBalances,
  type PostedLine,
} from "@rcp/ledger";
import { formatRatioBps } from "@rcp/properties";
import { pairVariance } from "@rcp/reporting";
import { loadPortfolioDebt, type PortfolioLoanRow } from "./debt-view";
import { buildOperatingPackage } from "./operating";
import { prisma } from "./prisma";
import { listPeriods, loadPostedLines } from "./queries";
import { resolveReportScope } from "./reports-server";
import { loadBrokerT12Overlay, type BrokerT12OverlaySummary } from "./t12-overlay";
import { loadLiveSpeWaterfalls, rollupWaterfallPools } from "./waterfall";

export type LiveRatio = {
  id: RatioId;
  definition: RatioDefinition;
  display: string;
  hint: string;
  gated: boolean;
  noiLabel: string | null;
  contributors: LiveContributor[];
  notes: string[];
};

export type PropertyDashboard = {
  kind: "property";
  entityCode: string;
  entityName: string;
  period: string;
  unitCount: number;
  strategy: string | null;
  viewLabel: "Standalone";
  tiles: LiveRatio[];
  t12: TrailingNoi;
  loans: PortfolioLoanRow[];
  brokerOverlay: BrokerT12OverlaySummary | null;
};

export type CovenantWatch = {
  entityCode: string;
  entityName: string;
  lenderName: string;
  reason: string;
  dscrDisplay: string;
  debtYieldDisplay: string;
  monthsRemaining: number;
  href: string;
};

export type OpCoDashboard = {
  kind: "opco";
  entityCode: string;
  entityName: string;
  period: string;
  viewLabel: "Combined roll-up (not GAAP consolidation)";
  lookThroughLabel: "Look-through property stack (wholly owned SPEs)";
  tiles: LiveRatio[];
  concentration: ConcentrationRow[];
  watchlist: CovenantWatch[];
  properties: {
    entityCode: string;
    entityName: string;
    unitCount: number;
    strategy: string | null;
    noiCents: bigint;
    href: string;
    templateId: string;
    cfadsGpCents: bigint;
    cfadsLpCents: bigint;
    afterWaterfall: boolean;
  }[];
  t12: TrailingNoi;
  combinedNote: string;
  waterfallApplied: boolean;
  cashLookThroughCents: bigint;
  cfadsLookThroughCents: bigint;
  cashAfterWaterfallCents: bigint;
  cfadsAfterWaterfallCents: bigint;
  lpShareCfadsCents: bigint;
  lpPrefUnpaidCents: bigint;
  waterfallNote: string;
};

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

function qs(entityCode: string, period: string, view?: string) {
  return { entityCode, period, view };
}

function hrefFor(
  statement: NonNullable<RatioDefinition["contributors"][number]["statement"]> | undefined,
  entityCode: string,
  period: string,
  view?: string,
) {
  if (!statement) return `/dashboard/${entityCode}?entity=${entityCode}&period=${period}`;
  return statementHref(statement, entityCode, period, view);
}

function contributor(
  spec: RatioDefinition["contributors"][number],
  entityCode: string,
  period: string,
  amountCents?: bigint,
  text?: string,
  view?: string,
): LiveContributor {
  return {
    kind: spec.kind,
    code: spec.code,
    field: spec.field,
    label: spec.label,
    amountCents,
    text,
    href: hrefFor(spec.statement, entityCode, period, view),
  };
}

async function monthlyNoiSeries(entityId: string, throughYear: number, throughMonth: number): Promise<bigint[]> {
  const periods = await listPeriods(entityId);
  const values: bigint[] = [];
  for (const period of periods) {
    if (period.year > throughYear || (period.year === throughYear && period.month > throughMonth)) continue;
    const inPeriod = await loadPostedLines({
      entityIds: [entityId],
      from: period.startDate,
      to: period.endDate,
    });
    const throughEnd = await loadPostedLines({ entityIds: [entityId], through: period.endDate });
    values.push(buildIncomeStatement({ throughEnd, inPeriod }).noi);
  }
  return values;
}

export async function buildPropertyDashboard(opts: {
  entityId: string;
  year: number;
  month: number;
}): Promise<PropertyDashboard> {
  const period = `${opts.year}-${String(opts.month).padStart(2, "0")}`;
  const pack = await buildOperatingPackage({
    entityId: opts.entityId,
    year: opts.year,
    month: opts.month,
    consolidated: false,
  });
  const scope = pack.scope;
  const actual = pack.operating.actual;
  const budget = pack.operating.budget;
  const entity = scope.entity;
  const inPeriodMap = debitNetMap(scope.inPeriod);
  const endMap = asOfAssetMap(scope.throughEnd);
  const startMap = asOfAssetMap(scope.throughStart);
  const cash = cashBreakdown(endMap);
  const controllable = sumByCodes(inPeriodMap, CONTROLLABLE_OPEX_CODES);
  const periodCapex = periodPpeAdditionsCents(startMap, endMap);
  const loans = (await loadPortfolioDebt(opts.year, opts.month)).filter((l) => l.entityCode === entity.code);
  const loan = loans[0];
  const reserveReq = loan?.reserveRequirementCents ?? 0n;
  const interest = loan?.interestCents ?? actual.interest;
  const principal = loan?.principalCents ?? principalPaydownFromLines(scope.throughStart, scope.throughEnd);
  const debtService = interest + principal;
  const cfads = cfadsCents({
    periodNoiCents: actual.noi,
    periodCapexCents: periodCapex,
    reserveRequirementCents: reserveReq,
  });
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
  const t12 = trailingNoi(await monthlyNoiSeries(entity.id, opts.year, opts.month));
  const noiUnit = noiPerUnitCents(actual.noi, entity.unitCount ?? 0);
  const variance = pairVariance(actual.noi, budget?.noi ?? null, pack.operating.prior?.noi ?? null);
  const rr = pack.kpis.rentRoll;
  const book = pack.kpis.bookEconomic;
  const be = pack.kpis.breakeven;
  const hasRentRoll = (rr?.unitCount ?? 0) > 0;
  const occGate = ratioAvailability("occupancy", { hasRentRoll });
  const ltvGate = ratioAvailability("ltl");
  const delq = ratioAvailability("delinquency");
  const ctx = qs(entity.code, period);
  const brokerOverlay = await loadBrokerT12Overlay(entity.id);

  const tiles: LiveRatio[] = [
    live({
      id: "noi_period",
      display: formatUsd(actual.noi),
      hint: "AM fees sit below this line",
      contributors: contribAmounts(ctx, "noi_period", {
        "4010": actual.gpr,
        "4020": actual.vacancy,
        "4030": actual.concessions,
        "4100": actual.otherIncome,
        "5110": inPeriodMap.get("5110") ?? 0n,
        "5210": inPeriodMap.get("5210") ?? 0n,
        "5310": inPeriodMap.get("5310") ?? 0n,
        "5410": inPeriodMap.get("5410") ?? 0n,
        "5510": inPeriodMap.get("5510") ?? 0n,
        "5610": inPeriodMap.get("5610") ?? 0n,
        "5710": inPeriodMap.get("5710") ?? 0n,
        "5810": inPeriodMap.get("5810") ?? 0n,
        "5910": inPeriodMap.get("5910") ?? 0n,
        "5990": inPeriodMap.get("5990") ?? 0n,
      }),
    }),
    live({
      id: "noi_t12",
      display: t12.definition === "t12" ? formatUsd(t12.noiCents) : `${formatUsd(t12.noiCents)} · ${t12.monthsAvailable}/12 mo`,
      hint: t12.definition === "t12" ? "Trailing twelve period NOI" : "Incomplete — not annualized, not labeled T12 ready",
      notes: [
        t12.definition === "incomplete"
          ? `Only ${t12.monthsAvailable} month(s) of books. Demo seed operating month is 2026-08.`
          : "T12 complete.",
      ],
      contributors: [contributor({ kind: "account", code: "NOI", label: "Stacked period NOI", statement: "os" }, entity.code, period, t12.noiCents)],
    }),
    live({
      id: "noi_per_unit",
      display: noiUnit === null ? "—" : formatUsd(noiUnit),
      hint: `${entity.unitCount ?? 0} units including DOWN`,
      contributors: [
        contributor({ kind: "account", code: "NOI", label: "Period NOI", statement: "os" }, entity.code, period, actual.noi),
        contributor({ kind: "entity", field: "unitCount", label: "SPE unit count" }, entity.code, period, undefined, String(entity.unitCount ?? 0)),
      ],
    }),
    live({
      id: "egi",
      display: formatUsd(actual.egi),
      hint: "GPR − vacancy − concessions + other income",
      contributors: contribAmounts(ctx, "egi", {
        "4010": actual.gpr,
        "4020": actual.vacancy,
        "4030": actual.concessions,
        "4100": actual.otherIncome,
      }),
    }),
    live({
      id: "opex_ratio",
      display: formatRatioBps(opexRatioBps(actual.opex, actual.egi)),
      hint: "In-NOI OpEx ÷ EGI",
      contributors: [
        contributor({ kind: "account", code: "OX", label: "Total Operating Expenses", statement: "os" }, entity.code, period, actual.opex),
        contributor({ kind: "account", code: "EGI", label: "Effective Gross Income", statement: "os" }, entity.code, period, actual.egi),
      ],
    }),
    live({
      id: "controllable_opex",
      display: formatUsd(controllable),
      hint: "Tagged 5110/5210/5310/5410/5510/5610/5990",
      contributors: contribAmounts(
        ctx,
        "controllable_opex",
        Object.fromEntries(CONTROLLABLE_OPEX_CODES.map((c) => [c, inPeriodMap.get(c) ?? 0n])),
      ),
    }),
    live({
      id: "controllable_opex_ratio",
      display: formatRatioBps(opexRatioBps(controllable, actual.egi)),
      hint: "Controllable OpEx ÷ EGI",
      contributors: [
        contributor({ kind: "account", code: "CTL", label: "Controllable OpEx", statement: "os" }, entity.code, period, controllable),
        contributor({ kind: "account", code: "EGI", label: "Effective Gross Income", statement: "os" }, entity.code, period, actual.egi),
      ],
    }),
    live({
      id: "cash",
      display: formatUsd(cash.total),
      hint: `Op ${formatUsd(cash.operating)} · RR ${formatUsd(cash.reserve)}`,
      contributors: [
        contributor({ kind: "account", code: CASH_CODES.operating, label: "Cash — Operating", statement: "bs" }, entity.code, period, cash.operating),
        contributor({ kind: "account", code: CASH_CODES.reserve, label: "Cash — Replacement Reserve", statement: "bs" }, entity.code, period, cash.reserve),
        contributor({ kind: "account", code: CASH_CODES.escrow, label: "Cash — Escrow / Impound", statement: "bs" }, entity.code, period, cash.escrow),
        contributor({ kind: "account", code: CASH_CODES.deposits, label: "Cash — Security Deposits", statement: "bs" }, entity.code, period, cash.deposits),
      ],
    }),
    live({
      id: "capex_vs_reserves",
      display: `CapEx ${formatUsd(periodCapex)}`,
      hint: `Reserve cash ${formatUsd(cash.reserve)} · req ${formatUsd(reserveReq)} / mo`,
      contributors: [
        contributor({ kind: "capex", field: "periodPpeAdditions", label: "Period PPE additions", statement: "capex" }, entity.code, period, periodCapex),
        contributor({ kind: "account", code: "1020", label: "Cash — Replacement Reserve", statement: "bs" }, entity.code, period, cash.reserve),
        contributor({ kind: "loan", field: "reserveRequirementCents", label: "Monthly reserve requirement", statement: "debt" }, entity.code, period, reserveReq),
      ],
    }),
    live({
      id: "cfads",
      display: formatUsd(cfads),
      hint: "Period NOI − PPE additions − reserve requirement",
      contributors: [
        contributor({ kind: "account", code: "NOI", label: "Period NOI", statement: "os" }, entity.code, period, actual.noi),
        contributor({ kind: "capex", field: "periodPpeAdditions", label: "Period PPE additions", statement: "cf" }, entity.code, period, periodCapex),
        contributor({ kind: "loan", field: "reserveRequirementCents", label: "Monthly reserve requirement", statement: "debt" }, entity.code, period, reserveReq),
      ],
    }),
    live({
      id: "cfads_dscr",
      display: formatMultipleBps(cfadsDscrBps(cfads, debtService)),
      hint: `DS ${formatUsd(debtService)}`,
      contributors: [
        contributor({ kind: "account", code: "CFADS", label: "CFADS", statement: "os" }, entity.code, period, cfads),
        contributor({ kind: "account", code: "6110", label: "Interest Expense", statement: "os" }, entity.code, period, interest),
        contributor({ kind: "loan", field: "principalCents", label: "Principal paydown", statement: "debt" }, entity.code, period, principal),
      ],
    }),
    live({
      id: "budget_variance_noi",
      display: variance.variance === null ? "—" : formatUsd(variance.variance),
      hint: variance.varianceBps === null ? "No budget" : `vs budget ${formatRatioBps(variance.varianceBps)}`,
      contributors: [
        contributor({ kind: "account", code: "NOI", label: "Actual period NOI", statement: "os" }, entity.code, period, actual.noi),
        contributor({ kind: "budget", field: "noi", label: "Budget NOI", statement: "os" }, entity.code, period, budget?.noi),
      ],
    }),
    live({
      id: "physical_occupancy",
      display: rr ? formatRatioBps(rr.physicalOccupancyBps) : "—",
      hint: rr ? `${rr.occupiedCount} / ${rr.rentableCount} rentable · ${rr.downCount} down` : occGate.reason,
      gated: !hasRentRoll,
      notes: [occGate.reason],
      contributors: rr
        ? [
            contributor({ kind: "rent_roll", field: "occupiedCount", label: "Occupied units", statement: "rent_roll" }, entity.code, period, undefined, String(rr.occupiedCount)),
            contributor({ kind: "rent_roll", field: "rentableCount", label: "Rentable units (ex-DOWN)", statement: "rent_roll" }, entity.code, period, undefined, String(rr.rentableCount)),
          ]
        : [],
    }),
    live({
      id: "loss_to_lease",
      display: rr ? formatUsd(rr.lossToLease) : "—",
      hint: "Occupied Σ max(0, market − in-place). Not LTV.",
      gated: !hasRentRoll,
      contributors: rr
        ? [
            contributor({ kind: "rent_roll", field: "lossToLease", label: "Loss-to-lease", statement: "rent_roll" }, entity.code, period, rr.lossToLease),
            contributor({ kind: "rent_roll", field: "inPlaceRent", label: "In-place rent", statement: "rent_roll" }, entity.code, period, rr.inPlaceRent),
          ]
        : [],
    }),
    live({
      id: "economic_occupancy_book",
      display: book ? formatRatioBps(book.economicOccupancyBps) : "—",
      hint: "Book: EGI / GPR",
      contributors: [
        contributor({ kind: "account", code: "EGI", label: "Effective Gross Income", statement: "os" }, entity.code, period, actual.egi),
        contributor({ kind: "account", code: "4010", label: "Gross Potential Rent", statement: "os" }, entity.code, period, actual.gpr),
      ],
    }),
    live({
      id: "breakeven_occupancy",
      display: be ? formatRatioBps(be.breakevenOccupancyBps) : "—",
      hint: "(OpEx + interest + principal − other income) / GPR",
      contributors: be
        ? [
            contributor({ kind: "account", code: "OX", label: "In-NOI OpEx", statement: "os" }, entity.code, period, be.opex),
            contributor({ kind: "account", code: "6110", label: "Interest Expense", statement: "os" }, entity.code, period, be.interest),
            contributor({ kind: "loan", field: "principalCents", label: "Principal paydown", statement: "debt" }, entity.code, period, be.principalPaydown),
            contributor({ kind: "account", code: "4100", label: "Other Income", statement: "os" }, entity.code, period, be.otherIncome),
            contributor({ kind: "account", code: "4010", label: "Gross Potential Rent", statement: "os" }, entity.code, period, be.gpr),
          ]
        : [],
    }),
    live({
      id: "dscr",
      display: formatMultipleBps(covenants.dscrBps),
      hint: loan
        ? `Threshold ${formatMultipleBps(covenants.dscrThresholdBps)} · ${covenants.dscrPass ? "pass" : "fail"}`
        : "No loan file",
      contributors: [
        contributor({ kind: "account", code: "NOI", label: "Period NOI", statement: "os" }, entity.code, period, actual.noi),
        contributor({ kind: "account", code: "6110", label: "Interest Expense", statement: "debt" }, entity.code, period, interest),
        contributor({ kind: "loan", field: "principalCents", label: "Principal", statement: "debt" }, entity.code, period, principal),
      ],
    }),
    live({
      id: "debt_yield",
      display: formatPercentBps(covenants.debtYieldBps),
      hint: `Annualized period NOI ${formatUsd(annualizePeriodNoi(actual.noi))} / UPB`,
      contributors: [
        contributor({ kind: "account", code: "NOI", label: "Period NOI × 12", statement: "os" }, entity.code, period, annualizePeriodNoi(actual.noi)),
        contributor({ kind: "loan", field: "currentUpbCents", label: "Current UPB", statement: "debt" }, entity.code, period, loan?.currentUpbCents),
      ],
    }),
    live({
      id: "upb",
      display: loan ? formatUsd(loan.currentUpbCents) : "—",
      hint: loan ? `GL ${formatUsd(loan.glUpbCents)}` : "No loan file",
      contributors: loan
        ? [
            contributor({ kind: "loan", field: "currentUpbCents", label: "Loan-file UPB", statement: "debt" }, entity.code, period, loan.currentUpbCents),
            contributor({ kind: "account", code: "2110", label: "Mortgage Payable — Current", statement: "tb" }, entity.code, period, loan.glCurrentCents),
            contributor({ kind: "account", code: "2210", label: "Mortgage Payable — Long Term", statement: "tb" }, entity.code, period, loan.glLtCents),
          ]
        : [],
    }),
    live({
      id: "maturity",
      display: loan ? loan.maturityDate.toISOString().slice(0, 10) : "—",
      hint: loan ? `${loan.monthsRemaining} months remaining` : "No loan file",
      contributors: loan
        ? [
            contributor(
              { kind: "loan", field: "maturityDate", label: "Maturity date", statement: "debt" },
              entity.code,
              period,
              undefined,
              `${loan.maturityDate.toISOString().slice(0, 10)} · ${loan.monthsRemaining} mo`,
            ),
          ]
        : [],
    }),
    live({
      id: "ltv",
      display: "Gated",
      hint: ltvGate.reason,
      gated: true,
      notes: [ltvGate.reason],
      contributors: loan
        ? [contributor({ kind: "loan", field: "currentUpbCents", label: "UPB (value missing)", statement: "debt" }, entity.code, period, loan.currentUpbCents)]
        : [],
    }),
    live({
      id: "delinquency",
      display: "Not available",
      hint: delq.reason,
      gated: true,
      notes: [delq.reason],
      contributors: [
        contributor({ kind: "account", code: "1110", label: "AR control total (not aging)", statement: "tb" }, entity.code, period, endMap.get("1110") ?? 0n),
      ],
    }),
  ];

  return {
    kind: "property",
    entityCode: entity.code,
    entityName: entity.name,
    period,
    unitCount: entity.unitCount ?? 0,
    strategy: entity.strategy,
    viewLabel: "Standalone",
    tiles,
    t12,
    loans,
    brokerOverlay,
  };
}

export async function buildOpCoDashboard(opts: {
  opcoId: string;
  year: number;
  month: number;
}): Promise<OpCoDashboard> {
  const period = `${opts.year}-${String(opts.month).padStart(2, "0")}`;
  const opco = await prisma.entity.findUniqueOrThrow({
    where: { id: opts.opcoId },
    include: { children: true },
  });
  const spes = opco.children.filter((c) => c.type === "SPE" && c.lifecycleStatus !== "ARCHIVED").sort((a, b) => a.code.localeCompare(b.code));
  const spePacks = (
    await Promise.all(
      spes.map(async (spe) => {
        try {
          const pack = await buildOperatingPackage({
            entityId: spe.id,
            year: opts.year,
            month: opts.month,
            consolidated: false,
          });
          return { spe, pack };
        } catch {
          return null;
        }
      }),
    )
  ).filter((row): row is NonNullable<typeof row> => row !== null);

  const opcoScope = await resolveReportScope({
    entityId: opco.id,
    year: opts.year,
    month: opts.month,
    consolidated: false,
  });
  const opcoIs = buildIncomeStatement({
    throughEnd: opcoScope.throughEnd,
    throughStart: opcoScope.throughStart,
    inPeriod: opcoScope.inPeriod,
  });
  const opcoEnd = asOfAssetMap(opcoScope.throughEnd);
  const opcoPeriod = debitNetMap(opcoScope.inPeriod);
  const combinedScope = await resolveReportScope({
    entityId: opco.id,
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
  // Cash is not eliminated; IC cash isn't a thing. Use stacked cash of OpCo + SPEs.
  const stackedCash = cashBreakdown(opcoEnd);
  let stackedCashTotal = stackedCash.total;
  let lookThroughOpex = 0n;
  let lookThroughNoi = 0n;
  let lookThroughUnits = 0;
  const propertyRows: OpCoDashboard["properties"] = [];
  const spePoolDraft: { entityCode: string; cashCents: bigint; noiCents: bigint; capexCents: bigint }[] = [];
  for (const row of spePacks) {
    lookThroughNoi += row.pack.operating.actual.noi;
    lookThroughOpex += row.pack.operating.actual.opex;
    lookThroughUnits += row.spe.unitCount ?? 0;
    const speEnd = asOfAssetMap(row.pack.scope.throughEnd);
    const speStart = asOfAssetMap(row.pack.scope.throughStart);
    const speCash = cashBreakdown(speEnd).total;
    stackedCashTotal += speCash;
    spePoolDraft.push({
      entityCode: row.spe.code,
      cashCents: speCash,
      noiCents: row.pack.operating.actual.noi,
      capexCents: periodPpeAdditionsCents(speStart, speEnd),
    });
    propertyRows.push({
      entityCode: row.spe.code,
      entityName: row.spe.name,
      unitCount: row.spe.unitCount ?? 0,
      strategy: row.spe.strategy,
      noiCents: row.pack.operating.actual.noi,
      href: `/dashboard/${row.spe.code}?entity=${row.spe.code}&period=${period}`,
      templateId: "look_through_100",
      cfadsGpCents: 0n,
      cfadsLpCents: 0n,
      afterWaterfall: false,
    });
  }

  const concentration = noiConcentration(
    propertyRows.map((p) => ({
      entityCode: p.entityCode,
      entityName: p.entityName,
      noiCents: p.noiCents,
      unitCount: p.unitCount,
    })),
  );
  const loans = await loadPortfolioDebt(opts.year, opts.month);
  const lookThroughUpb = loans.reduce((acc, l) => acc + l.currentUpbCents, 0n);
  const lookThroughDs = loans.reduce((acc, l) => acc + l.interestCents + l.principalCents, 0n);
  const lookThroughCapex = spePacks.reduce((acc, row) => {
    const start = asOfAssetMap(row.pack.scope.throughStart);
    const end = asOfAssetMap(row.pack.scope.throughEnd);
    return acc + periodPpeAdditionsCents(start, end);
  }, 0n);
  const lookThroughReserveReq = loans.reduce((acc, l) => acc + l.reserveRequirementCents, 0n);
  const lookThroughCfads = cfadsCents({
    periodNoiCents: lookThroughNoi,
    periodCapexCents: lookThroughCapex,
    reserveRequirementCents: lookThroughReserveReq,
  });
  const waterfallRecords = await loadLiveSpeWaterfalls(opco.id);
  const spePools = spePoolDraft.map((row) => {
    const loan = loans.find((l) => l.entityCode === row.entityCode);
    return {
      entityCode: row.entityCode,
      cashCents: row.cashCents,
      cfadsCents: cfadsCents({
        periodNoiCents: row.noiCents,
        periodCapexCents: row.capexCents,
        reserveRequirementCents: loan?.reserveRequirementCents ?? 0n,
      }),
    };
  });
  const waterfall = rollupWaterfallPools(waterfallRecords, spePools, stackedCash.total, 1);
  for (const row of propertyRows) {
    const speWf = waterfall.spes.find((s) => s.entityCode === row.entityCode);
    if (!speWf) continue;
    row.templateId = speWf.templateId;
    row.cfadsGpCents = speWf.cfadsGpCents;
    row.cfadsLpCents = speWf.cfadsLpCents;
    row.afterWaterfall = !speWf.lookThrough;
  }
  const displayCash = waterfall.cashGpCents;
  const displayCfads = waterfall.cfadsGpCents;
  const lookThroughCovenants = computeCovenants({
    noiCents: lookThroughNoi,
    interestCents: loans.reduce((acc, l) => acc + l.interestCents, 0n),
    principalCents: loans.reduce((acc, l) => acc + l.principalCents, 0n),
    upbCents: lookThroughUpb,
    dscrThresholdBps: 12_500,
    debtYieldThresholdBps: 800,
  });
  const feeIncome = opcoIs.amIncome;
  const ga = sumByCodes(opcoPeriod, OPCO_GA_CODES);
  const t12Parts = await Promise.all(spes.map((spe) => monthlyNoiSeries(spe.id, opts.year, opts.month)));
  const months = Math.max(0, ...t12Parts.map((s) => s.length));
  const stackedMonthly: bigint[] = [];
  for (let i = 0; i < months; i += 1) {
    stackedMonthly.push(t12Parts.reduce((acc, series) => acc + (series[i] ?? 0n), 0n));
  }
  const t12 = trailingNoi(stackedMonthly);
  const ltvGate = ratioAvailability("ltl");
  const asOf = new Date(Date.UTC(opts.year, opts.month - 1, 28, 16, 0, 0));
  const watchlist: CovenantWatch[] = loans
    .filter((loan) => loan.covenants.dscrPass === false || loan.covenants.debtYieldPass === false || monthsToMaturity(asOf, loan.maturityDate) <= 12)
    .map((loan) => {
      const reasons = [
        loan.covenants.dscrPass === false ? "DSCR fail" : null,
        loan.covenants.debtYieldPass === false ? "Debt yield fail" : null,
        monthsToMaturity(asOf, loan.maturityDate) <= 12 ? "Maturity ≤ 12 mo" : null,
      ].filter(Boolean);
      return {
        entityCode: loan.entityCode,
        entityName: loan.entityName,
        lenderName: loan.lenderName,
        reason: reasons.join(" · "),
        dscrDisplay: formatMultipleBps(loan.covenants.dscrBps),
        debtYieldDisplay: formatPercentBps(loan.covenants.debtYieldBps),
        monthsRemaining: loan.monthsRemaining,
        href: `/dashboard/${loan.entityCode}?entity=${loan.entityCode}&period=${period}`,
      };
    });

  const tiles: LiveRatio[] = [
    live({
      id: "properties_units",
      display: `${spes.length} / ${lookThroughUnits}`,
      hint: "Properties / units (including DOWN)",
      contributors: propertyRows.map((p) =>
        contributor({ kind: "entity", field: "unitCount", label: `${p.entityCode} units` }, p.entityCode, period, undefined, String(p.unitCount)),
      ),
    }),
    live({
      id: "noi_period",
      display: formatUsd(lookThroughNoi),
      hint: "Look-through Σ SPE period NOI — not combined roll-up NI",
      contributors: propertyRows.map((p) =>
        contributor({ kind: "account", code: "NOI", label: `${p.entityCode} period NOI`, statement: "os" }, p.entityCode, period, p.noiCents),
      ),
    }),
    live({
      id: "noi_t12",
      display: t12.definition === "t12" ? formatUsd(t12.noiCents) : `${formatUsd(t12.noiCents)} · ${t12.monthsAvailable}/12 mo`,
      hint: "Look-through stacked period NOI. Incomplete T12 is not annualized.",
      notes: [
        t12.definition === "incomplete"
          ? `Only ${t12.monthsAvailable} month(s) of SPE books. Demo seed operating month is 2026-08.`
          : "T12 complete.",
      ],
      contributors: [contributor({ kind: "account", code: "NOI", label: "Stacked SPE period NOI", statement: "os" }, opco.code, period, t12.noiCents, undefined, "combined")],
    }),
    live({
      id: "noi_per_unit",
      display: noiPerUnitCents(lookThroughNoi, lookThroughUnits) === null ? "—" : formatUsd(noiPerUnitCents(lookThroughNoi, lookThroughUnits)!),
      hint: "Look-through period NOI ÷ Σ SPE units",
      contributors: [
        contributor({ kind: "account", code: "NOI", label: "Look-through period NOI", statement: "os" }, opco.code, period, lookThroughNoi, undefined, "combined"),
        contributor({ kind: "entity", field: "unitCount", label: "Portfolio units" }, opco.code, period, undefined, String(lookThroughUnits)),
      ],
    }),
    live({
      id: "cash",
      display: formatUsd(displayCash),
      hint: waterfall.applied
        ? "RCP/GP cash after waterfall (not gross SPE cash as if wholly owned). Liquidity proxy, not a bank rec."
        : "OpCo + SPE cash (1010–1040). Liquidity proxy, not a bank rec. 100% look-through until a deal waterfall is saved.",
      contributors: [
        contributor({ kind: "account", code: "1010", label: waterfall.applied ? "Cash after waterfall" : "Stacked cash", statement: "bs" }, opco.code, period, displayCash, undefined, "combined"),
      ],
    }),
    live({
      id: "liquidity_months",
      display: formatMonthsHundredths(liquidityMonthsHundredths(displayCash, lookThroughOpex)),
      hint: waterfall.applied
        ? "RCP/GP cash after waterfall ÷ look-through SPE OpEx"
        : "Stacked cash ÷ look-through SPE OpEx",
      contributors: [
        contributor({ kind: "account", code: "1010", label: waterfall.applied ? "Cash after waterfall" : "Stacked cash", statement: "bs" }, opco.code, period, displayCash, undefined, "combined"),
        contributor({ kind: "account", code: "OX", label: "Look-through SPE OpEx", statement: "os" }, opco.code, period, lookThroughOpex, undefined, "combined"),
      ],
    }),
    live({
      id: "look_through_upb",
      display: formatUsd(lookThroughUpb),
      hint: "Σ SPE first-mortgage UPB. Not LTV.",
      contributors: loans.map((loan) =>
        contributor({ kind: "loan", field: "currentUpbCents", label: `${loan.entityCode} UPB`, statement: "debt" }, loan.entityCode, period, loan.currentUpbCents),
      ),
    }),
    live({
      id: "dscr",
      display: formatMultipleBps(lookThroughCovenants.dscrBps),
      hint: `Look-through period NOI / stacked DS ${formatUsd(lookThroughDs)}`,
      contributors: [
        contributor({ kind: "account", code: "NOI", label: "Look-through period NOI", statement: "os" }, opco.code, period, lookThroughNoi, undefined, "combined"),
        contributor({ kind: "loan", field: "debtService", label: "Stacked debt service", statement: "debt" }, opco.code, period, lookThroughDs),
      ],
    }),
    live({
      id: "debt_yield",
      display: formatPercentBps(lookThroughCovenants.debtYieldBps),
      hint: "Annualized look-through period NOI / stacked UPB",
      contributors: [
        contributor({ kind: "account", code: "NOI", label: "Look-through NOI × 12", statement: "os" }, opco.code, period, annualizePeriodNoi(lookThroughNoi), undefined, "combined"),
        contributor({ kind: "loan", field: "currentUpbCents", label: "Stacked UPB", statement: "debt" }, opco.code, period, lookThroughUpb),
      ],
    }),
    live({
      id: "cfads",
      display: formatUsd(displayCfads),
      hint: waterfall.applied
        ? "CFADS after waterfall — RCP/GP share of distributable cash. Not gross SPE CFADS."
        : "Look-through NOI − stacked PPE additions − stacked reserve req. 100% look-through until a deal waterfall is saved.",
      contributors: [
        contributor({ kind: "account", code: "NOI", label: "Look-through period NOI", statement: "os" }, opco.code, period, lookThroughNoi, undefined, "combined"),
        contributor({ kind: "capex", field: "periodPpeAdditions", label: "Stacked PPE additions", statement: "cf" }, opco.code, period, lookThroughCapex, undefined, "combined"),
        contributor({ kind: "loan", field: "reserveRequirementCents", label: "Stacked reserve requirement", statement: "debt" }, opco.code, period, lookThroughReserveReq),
      ],
    }),
    live({
      id: "fee_income",
      display: formatUsd(feeIncome),
      hint: "OpCo standalone 7010. Eliminated on combined roll-up.",
      contributors: [
        contributor({ kind: "account", code: "7010", label: "Asset Management Fee Income", statement: "os" }, opco.code, period, feeIncome),
      ],
    }),
    live({
      id: "ga_ratio",
      display: formatRatioBps(gaRatioBps(ga, feeIncome)),
      hint: "OpCo (5110+5610+5990) ÷ 7010",
      contributors: [
        contributor({ kind: "account", code: "5110", label: "Payroll", statement: "os" }, opco.code, period, opcoPeriod.get("5110") ?? 0n),
        contributor({ kind: "account", code: "5610", label: "Administrative", statement: "os" }, opco.code, period, opcoPeriod.get("5610") ?? 0n),
        contributor({ kind: "account", code: "5990", label: "Other Operating Expenses", statement: "os" }, opco.code, period, opcoPeriod.get("5990") ?? 0n),
        contributor({ kind: "account", code: "7010", label: "Asset Management Fee Income", statement: "os" }, opco.code, period, feeIncome),
      ],
    }),
    ...(waterfall.applied
      ? [
          live({
            id: "rcp_after_waterfall",
            display: formatUsd(waterfall.cashGpCents),
            hint: "RCP/GP cash after waterfall (same as Cash tile when a template is saved)",
            contributors: waterfall.spes.map((s) =>
              contributor({ kind: "entity", field: "gpShare", label: `${s.entityCode} GP/RCP cash` }, s.entityCode, period, s.cashGpCents),
            ),
          }),
          live({
            id: "lp_share_not_upstreamed",
            display: formatUsd(waterfall.cfadsLpCents),
            hint: "LP share of period CFADS — not upstreamed to OpCo",
            contributors: waterfall.spes.map((s) =>
              contributor({ kind: "entity", field: "lpShare", label: `${s.entityCode} LP CFADS` }, s.entityCode, period, s.cfadsLpCents),
            ),
          }),
          live({
            id: "lp_pref_unpaid",
            display: formatUsd(waterfall.unpaidPrefCents),
            hint: "LP pref unpaid after this period’s CFADS waterfall",
            contributors: waterfall.spes.map((s) =>
              contributor({ kind: "entity", field: "unpaidPref", label: `${s.entityCode} LP pref unpaid` }, s.entityCode, period, s.unpaidPrefAfterCents),
            ),
          }),
        ]
      : []),
    live({
      id: "ltv",
      display: "Gated",
      hint: ltvGate.reason,
      gated: true,
      notes: [ltvGate.reason],
      contributors: [
        contributor({ kind: "loan", field: "currentUpbCents", label: "Stacked UPB (value missing)", statement: "debt" }, opco.code, period, lookThroughUpb),
      ],
    }),
    live({
      id: "delinquency",
      display: "Not available",
      hint: ratioAvailability("delinquency").reason,
      gated: true,
      notes: [ratioAvailability("delinquency").reason],
      contributors: [],
    }),
  ];

  return {
    kind: "opco",
    entityCode: opco.code,
    entityName: opco.name,
    period,
    viewLabel: "Combined roll-up (not GAAP consolidation)",
    lookThroughLabel: "Look-through property stack (wholly owned SPEs)",
    tiles,
    concentration,
    watchlist,
    properties: propertyRows,
    t12,
    combinedNote: `Combined roll-up NOI ${formatUsd(combinedIs.noi)} after IC 1310/2310 and AM 6310/7010 elimination. Look-through property NOI ${formatUsd(lookThroughNoi)} is the operating stack. ${waterfall.note} Neither NOI figure is a GAAP consolidation.`,
    waterfallApplied: waterfall.applied,
    cashLookThroughCents: stackedCashTotal,
    cfadsLookThroughCents: lookThroughCfads,
    cashAfterWaterfallCents: displayCash,
    cfadsAfterWaterfallCents: displayCfads,
    lpShareCfadsCents: waterfall.cfadsLpCents,
    lpPrefUnpaidCents: waterfall.unpaidPrefCents,
    waterfallNote: waterfall.note,
  };
}

export async function buildDashboardForEntity(opts: {
  entityId: string;
  entityType: string;
  year: number;
  month: number;
}): Promise<PropertyDashboard | OpCoDashboard> {
  if (opts.entityType === "OPCO") {
    return buildOpCoDashboard({ opcoId: opts.entityId, year: opts.year, month: opts.month });
  }
  return buildPropertyDashboard({ entityId: opts.entityId, year: opts.year, month: opts.month });
}

export function liveRatioById(tiles: LiveRatio[], id: RatioId): LiveRatio | undefined {
  return tiles.find((t) => t.id === id);
}

export function dictionaryIndex() {
  return RATIO_DICTIONARY;
}

function contribAmounts(
  ctx: { entityCode: string; period: string; view?: string },
  id: RatioId,
  amounts: Record<string, bigint>,
): LiveContributor[] {
  const def = getRatioDefinition(id);
  if (!def) return [];
  return def.contributors.map((spec) =>
    contributor(spec, ctx.entityCode, ctx.period, spec.code ? amounts[spec.code] : undefined, undefined, ctx.view),
  );
}

function live(opts: {
  id: RatioId;
  display: string;
  hint: string;
  contributors?: LiveContributor[];
  gated?: boolean;
  notes?: string[];
}): LiveRatio {
  const definition = getRatioDefinition(opts.id);
  if (!definition) {
    throw new Error(`Unknown ratio ${opts.id}`);
  }
  return {
    id: opts.id,
    definition,
    display: opts.display,
    hint: opts.hint,
    gated: opts.gated ?? definition.status === "gated",
    noiLabel: definition.noiDefinition ? formatNoiDefinition(definition.noiDefinition) : null,
    contributors: opts.contributors ?? [],
    notes: opts.notes ?? [],
  };
}

export type { LiveContributor };
