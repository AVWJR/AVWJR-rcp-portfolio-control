import {
  buildAmortizationSchedule,
  computeCovenants,
  currentPortionRollAmount,
  monthsToMaturity,
  splitCurrentLt,
  type CovenantResult,
} from "@rcp/debt";
import { creditMinusDebit, rollupBalances } from "@rcp/ledger";
import { prisma } from "./prisma";
import { loadPostedLines } from "./queries";

export async function loadLoans(entityIds?: string[]) {
  return prisma.loan.findMany({
    where: entityIds ? { entityId: { in: entityIds } } : undefined,
    include: { entity: true, payments: { orderBy: [{ year: "asc" }, { month: "asc" }] } },
    orderBy: { maturityDate: "asc" },
  });
}

export async function mortgageGlBalances(entityId: string, through: Date) {
  const lines = await loadPostedLines({ entityIds: [entityId], through });
  const balances = rollupBalances(lines);
  const current = balances.find((b) => b.code === "2110");
  const lt = balances.find((b) => b.code === "2210");
  const currentCents = current ? creditMinusDebit(current) : 0n;
  const ltCents = lt ? creditMinusDebit(lt) : 0n;
  return { currentCents, ltCents, upbCents: currentCents + ltCents };
}

export function loanCovenants(opts: {
  noiCents: bigint;
  interestCents: bigint;
  principalCents: bigint;
  upbCents: bigint;
  dscrThresholdBps: number;
  debtYieldThresholdBps: number;
}): CovenantResult {
  return computeCovenants(opts);
}

export function nextSchedule(opts: {
  upbCents: bigint;
  interestRateBps: number;
  paymentCents: bigint;
  startYear: number;
  startMonth: number;
  periods?: number;
}) {
  return buildAmortizationSchedule({
    upbCents: opts.upbCents,
    annualRateBps: opts.interestRateBps,
    paymentCents: opts.paymentCents,
    startYear: opts.startYear,
    startMonth: opts.startMonth,
    periods: opts.periods ?? 12,
  });
}

export function rollNeeded(opts: {
  glCurrentCents: bigint;
  glLtCents: bigint;
  upbCents: bigint;
  interestRateBps: number;
  paymentCents: bigint;
  startYear: number;
  startMonth: number;
}) {
  const split = splitCurrentLt({
    upbCents: opts.upbCents,
    annualRateBps: opts.interestRateBps,
    paymentCents: opts.paymentCents,
    startYear: opts.startYear,
    startMonth: opts.startMonth,
  });
  return {
    ...split,
    rollFromLtCents: currentPortionRollAmount({
      glCurrentCents: opts.glCurrentCents,
      glLtCents: opts.glLtCents,
      targetCurrentCents: split.currentPortionCents,
    }),
  };
}

export function remainingTermMonths(maturity: Date, asOf = new Date(Date.UTC(2026, 7, 31))) {
  return monthsToMaturity(asOf, maturity);
}
