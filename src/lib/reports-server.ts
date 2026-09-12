import {
  buildBalanceSheet,
  buildCashFlow,
  buildIncomeStatement,
  buildTrialBalance,
} from "@rcp/ledger";
import { consolidationEntityIds, loadPostedLines } from "./queries";
import { prisma } from "./prisma";

export async function resolveReportScope(opts: {
  entityId: string;
  year: number;
  month: number;
  consolidated: boolean;
}) {
  const entity = await prisma.entity.findUnique({
    where: { id: opts.entityId },
    include: { children: true },
  });
  if (!entity) throw new Error("Entity not found");

  const period = await prisma.period.findUnique({
    where: { entityId_year_month: { entityId: entity.id, year: opts.year, month: opts.month } },
  });
  if (!period) throw new Error("Period not found");

  const canConsolidate = entity.type === "OPCO" && entity.children.some((c) => c.type === "SPE");
  const consolidated = opts.consolidated && canConsolidate;
  const entityIds = consolidated ? await consolidationEntityIds(entity.id) : [entity.id];

  const start = period.startDate;
  const end = period.endDate;

  const throughEnd = await loadPostedLines({ entityIds, through: end });
  const throughStart = await loadPostedLines({
    entityIds,
    through: new Date(start.getTime() - 1),
  });
  const inPeriod = await loadPostedLines({ entityIds, from: start, to: end });

  return {
    entity,
    period,
    canConsolidate,
    consolidated,
    entityIds,
    throughEnd,
    throughStart,
    inPeriod,
  };
}

export async function buildAllStatements(opts: {
  entityId: string;
  year: number;
  month: number;
  consolidated: boolean;
}) {
  const scope = await resolveReportScope(opts);
  const input = {
    throughEnd: scope.throughEnd,
    throughStart: scope.throughStart,
    inPeriod: scope.inPeriod,
    eliminate: scope.consolidated,
  };
  return {
    ...scope,
    tb: buildTrialBalance(input),
    is: buildIncomeStatement(input),
    bs: buildBalanceSheet(input),
    cf: buildCashFlow(input),
  };
}
