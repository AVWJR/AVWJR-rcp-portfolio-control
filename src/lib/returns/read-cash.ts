/**
 * Cash-flow reads for Library and Models.
 * Uses periods that already exist. Never inserts a Period or a checklist.
 */

import { cfadsCents, periodPpeAdditionsCents } from "@rcp/analytics";
import { buildIncomeStatement, netByCode, rollupBalances } from "@rcp/ledger";
import { loadPostedLines } from "@/lib/queries";
import { prisma } from "@/lib/prisma";

export type ReadablePeriod = {
  id: string;
  year: number;
  month: number;
  startDate: Date;
  endDate: Date;
};

/**
 * The selected month when that Period row already exists.
 * Otherwise the latest closed period, or the latest period that has a posted journal.
 */
export async function resolveReadablePeriod(
  entityId: string,
  year?: number | null,
  month?: number | null,
): Promise<ReadablePeriod | null> {
  if (year != null && month != null && year > 0 && month >= 1 && month <= 12) {
    const existing = await prisma.period.findUnique({
      where: { entityId_year_month: { entityId, year, month } },
      select: { id: true, year: true, month: true, startDate: true, endDate: true },
    });
    if (existing) return existing;
  }
  return prisma.period.findFirst({
    where: {
      entityId,
      OR: [{ status: { in: ["SOFT_CLOSED", "CLOSED"] } }, { journals: { some: { status: "POSTED" } } }],
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { id: true, year: true, month: true, startDate: true, endDate: true },
  });
}

async function monthlyCfadsCents(entityId: string, period: ReadablePeriod): Promise<bigint> {
  const throughEnd = await loadPostedLines({ entityIds: [entityId], through: period.endDate });
  const throughStart = await loadPostedLines({
    entityIds: [entityId],
    through: new Date(period.startDate.getTime() - 1),
  });
  const inPeriod = await loadPostedLines({ entityIds: [entityId], from: period.startDate, to: period.endDate });
  const statement = buildIncomeStatement({ throughEnd, throughStart, inPeriod });
  const endBalances = rollupBalances(throughEnd);
  const startBalances = rollupBalances(throughStart);
  const endMap = new Map(endBalances.map((row) => [row.code, netByCode(endBalances, row.code)]));
  const startMap = new Map(startBalances.map((row) => [row.code, netByCode(startBalances, row.code)]));
  const loan = await prisma.loan.findFirst({
    where: { entityId },
    orderBy: { createdAt: "asc" },
    select: { reserveRequirementCents: true },
  });
  return cfadsCents({
    periodNoiCents: statement.noi,
    periodCapexCents: periodPpeAdditionsCents(startMap, endMap),
    reserveRequirementCents: loan?.reserveRequirementCents ?? 0n,
  });
}

/** Annualized CFADS from an existing period. Missing books return 0. Never opens a month. */
export async function readAnnualCfadsCents(entityId: string, year?: number | null, month?: number | null): Promise<bigint> {
  const period = await resolveReadablePeriod(entityId, year, month);
  if (!period) return 0n;
  const monthly = await monthlyCfadsCents(entityId, period);
  if (monthly <= 0n) return 0n;
  return monthly * 12n;
}

/**
 * Annual debt service from loan actuals, or from the contractual payment.
 * No loan means zero. A loan with no payment on file returns null (debt service needed).
 * A deal that is not on the books uses snapshot DSCR when that implies a payment.
 */
export async function readAnnualDebtServiceCents(opts: {
  entityId: string;
  owned: boolean;
  year?: number | null;
  month?: number | null;
  snapshotNoiCents?: bigint | null;
  snapshotDscrBps?: number | null;
}): Promise<bigint | null> {
  if (!opts.owned) {
    const noi = opts.snapshotNoiCents;
    const dscr = opts.snapshotDscrBps;
    if (noi == null || noi <= 0n || dscr == null || dscr <= 0) return null;
    const monthly = (noi * 10_000n) / BigInt(dscr);
    return monthly > 0n ? monthly * 12n : null;
  }
  const loans = await prisma.loan.findMany({
    where: { entityId: opts.entityId },
    include: { payments: { select: { year: true, month: true, interestCents: true, principalCents: true } } },
  });
  if (!loans.length) return 0n;
  const period = await resolveReadablePeriod(opts.entityId, opts.year, opts.month);
  let annual = 0n;
  for (const loan of loans) {
    const row = period ? loan.payments.find((payment) => payment.year === period.year && payment.month === period.month) : undefined;
    if (row && row.interestCents + row.principalCents > 0n) {
      annual += (row.interestCents + row.principalCents) * 12n;
      continue;
    }
    if (loan.paymentCents > 0n) {
      annual += loan.paymentCents * 12n;
      continue;
    }
    return null;
  }
  return annual;
}
