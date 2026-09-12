import { computeCovenants, monthsToMaturity, type CovenantResult } from "@rcp/debt";
import { buildIncomeStatement } from "@rcp/ledger";
import { loadLoans, mortgageGlBalances } from "./loans";
import { loadPostedLines } from "./queries";
import { prisma } from "./prisma";

export type PortfolioLoanRow = {
  loanId: string;
  entityCode: string;
  entityName: string;
  lenderName: string;
  name: string;
  originalPrincipalCents: bigint;
  currentUpbCents: bigint;
  glCurrentCents: bigint;
  glLtCents: bigint;
  glUpbCents: bigint;
  interestRateBps: number;
  paymentCents: bigint;
  maturityDate: Date;
  monthsRemaining: number;
  reserveRequirementCents: bigint;
  interestCents: bigint;
  principalCents: bigint;
  currentPortionCents: bigint;
  longTermPortionCents: bigint;
  covenants: CovenantResult;
};

export async function loadPortfolioDebt(year = 2026, month = 8): Promise<PortfolioLoanRow[]> {
  const loans = await loadLoans();
  const rows: PortfolioLoanRow[] = [];
  const asOf = new Date(Date.UTC(year, month - 1, 28, 16, 0, 0));

  for (const loan of loans) {
    const period = await prisma.period.findUnique({
      where: { entityId_year_month: { entityId: loan.entityId, year, month } },
    });
    if (!period) continue;
    const payment = loan.payments.find((p) => p.year === year && p.month === month);
    const gl = await mortgageGlBalances(loan.entityId, period.endDate);
    const inPeriod = await loadPostedLines({
      entityIds: [loan.entityId],
      from: period.startDate,
      to: period.endDate,
    });
    const throughEnd = await loadPostedLines({ entityIds: [loan.entityId], through: period.endDate });
    const is = buildIncomeStatement({ throughEnd, inPeriod });
    const interestCents = payment?.interestCents ?? is.interest;
    const principalCents = payment?.principalCents ?? 0n;
    rows.push({
      loanId: loan.id,
      entityCode: loan.entity.code,
      entityName: loan.entity.name,
      lenderName: loan.lenderName,
      name: loan.name,
      originalPrincipalCents: loan.originalPrincipalCents,
      currentUpbCents: loan.currentUpbCents,
      glCurrentCents: gl.currentCents,
      glLtCents: gl.ltCents,
      glUpbCents: gl.upbCents,
      interestRateBps: loan.interestRateBps,
      paymentCents: loan.paymentCents,
      maturityDate: loan.maturityDate,
      monthsRemaining: monthsToMaturity(asOf, loan.maturityDate),
      reserveRequirementCents: loan.reserveRequirementCents,
      interestCents,
      principalCents,
      currentPortionCents: payment?.currentPortionCents ?? gl.currentCents,
      longTermPortionCents: payment?.longTermPortionCents ?? gl.ltCents,
      covenants: computeCovenants({
        noiCents: is.noi,
        interestCents,
        principalCents,
        upbCents: loan.currentUpbCents,
        dscrThresholdBps: loan.dscrThresholdBps,
        debtYieldThresholdBps: loan.debtYieldThresholdBps,
      }),
    });
  }
  return rows;
}
