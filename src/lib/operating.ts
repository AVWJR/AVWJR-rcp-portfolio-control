import {
  bookEconomicOccupancy,
  breakevenOccupancy,
  summarizeRentRoll,
  type BookEconomicOccupancy,
  type BreakevenOccupancy,
  type RentRollKpis,
  type UnitSnapshot,
} from "@rcp/properties";
import { ratioAvailability } from "@rcp/analytics";
import { buildIncomeStatement, principalPaydownFromLines, type IncomeStatement } from "@rcp/ledger";
import { operatingStatementFromReports, type OperatingStatement } from "@rcp/reporting";
import { loadBudgetMap } from "./budgets";
import { loadUnits } from "./rent-roll";
import { resolveReportScope } from "./reports-server";

export type PropertyKpis = {
  rentRoll: RentRollKpis | null;
  bookEconomic: BookEconomicOccupancy | null;
  breakeven: BreakevenOccupancy | null;
  delinquency: ReturnType<typeof ratioAvailability>;
  occupancyGate: ReturnType<typeof ratioAvailability>;
};

export function priorYearSameMonth(year: number, month: number): { year: number; month: number } {
  return { year: year - 1, month };
}

export function previousCalendarMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

async function scopeInput(opts: { entityId: string; year: number; month: number; consolidated: boolean }) {
  const scope = await resolveReportScope(opts);
  return {
    throughEnd: scope.throughEnd,
    throughStart: scope.throughStart,
    inPeriod: scope.inPeriod,
    eliminate: scope.consolidated,
  };
}

export async function buildOperatingPackage(opts: {
  entityId: string;
  year: number;
  month: number;
  consolidated: boolean;
}): Promise<{
  scope: Awaited<ReturnType<typeof resolveReportScope>>;
  operating: OperatingStatement;
  mom: IncomeStatement | null;
  units: UnitSnapshot[];
  kpis: PropertyKpis;
}> {
  const scope = await resolveReportScope(opts);
  const sameMonthLastYear = priorYearSameMonth(opts.year, opts.month);
  const momMonth = previousCalendarMonth(opts.year, opts.month);
  let priorInput = null;
  let mom: IncomeStatement | null = null;
  try {
    priorInput = await scopeInput({
      entityId: opts.entityId,
      year: sameMonthLastYear.year,
      month: sameMonthLastYear.month,
      consolidated: opts.consolidated,
    });
  } catch {
    priorInput = null;
  }
  try {
    const momInput = await scopeInput({
      entityId: opts.entityId,
      year: momMonth.year,
      month: momMonth.month,
      consolidated: opts.consolidated,
    });
    mom = buildIncomeStatement(momInput);
  } catch {
    mom = null;
  }

  const budget = await loadBudgetMap({
    entityIds: scope.entityIds,
    year: opts.year,
    month: opts.month,
    eliminate: scope.consolidated,
  });

  const operating = operatingStatementFromReports({
    actualInput: {
      throughEnd: scope.throughEnd,
      throughStart: scope.throughStart,
      inPeriod: scope.inPeriod,
      eliminate: scope.consolidated,
    },
    budget: budget.size > 0 ? budget : null,
    priorInput,
  });

  const allUnits = await loadUnits(scope.entityIds);
  const hasRentRoll = allUnits.length > 0;
  const rentRoll = hasRentRoll ? summarizeRentRoll(allUnits) : null;

  const actual = operating.actual;
  const bookEconomic = actual.gpr > 0n ? bookEconomicOccupancy(actual.egi, actual.gpr) : null;

  const principal = principalPaydownFromLines(
    scope.throughStart,
    scope.throughEnd,
  );
  const breakeven =
    actual.gpr > 0n
      ? breakevenOccupancy({
          opex: actual.opex,
          interest: actual.interest,
          principalPaydown: principal,
          otherIncome: actual.otherIncome,
          gpr: actual.gpr,
        })
      : null;

  return {
    scope,
    operating,
    mom,
    units: allUnits,
    kpis: {
      rentRoll,
      bookEconomic,
      breakeven,
      delinquency: ratioAvailability("delinquency"),
      occupancyGate: ratioAvailability("occupancy", { hasRentRoll }),
    },
  };
}
