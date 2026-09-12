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
import { operatingStatementFromReports, type OperatingStatement } from "@rcp/reporting";
import { principalPaydownFromLines } from "@rcp/ledger";
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

export async function buildOperatingPackage(opts: {
  entityId: string;
  year: number;
  month: number;
  consolidated: boolean;
}): Promise<{
  scope: Awaited<ReturnType<typeof resolveReportScope>>;
  operating: OperatingStatement;
  units: UnitSnapshot[];
  kpis: PropertyKpis;
}> {
  const scope = await resolveReportScope(opts);
  const priorMonth = opts.month === 1 ? 12 : opts.month - 1;
  const priorYear = opts.month === 1 ? opts.year - 1 : opts.year;
  let priorInput = null;
  try {
    const prior = await resolveReportScope({
      entityId: opts.entityId,
      year: priorYear,
      month: priorMonth,
      consolidated: opts.consolidated,
    });
    priorInput = {
      throughEnd: prior.throughEnd,
      throughStart: prior.throughStart,
      inPeriod: prior.inPeriod,
      eliminate: prior.consolidated,
    };
  } catch {
    priorInput = null;
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
