/**
 * Saves the ratios the app already computes. Does not invent LP IRR, LP cash yield,
 * RCP IRR, or a fee. Those columns stay null and the screen says Phase 2 / fee needed.
 * Each call inserts a new row. Older snapshots are kept. Age never deletes one.
 */

import { opexRatioBps, trailingNoi } from "@rcp/analytics";
import { buildIncomeStatement, isLookThroughTemplate, residualPromoteSplit } from "@rcp/ledger";
import { incomeStatementFromBudget, type BudgetByCode } from "@rcp/reporting";
import { prisma } from "@/lib/prisma";
import { BROKER_T12_SOURCE } from "@/lib/t12-overlay";
import { isOwnedSpe } from "@/lib/owned-spe";
import { buildOperatingPackage } from "@/lib/operating";
import { loadLoans } from "@/lib/loans";
import { loadPostedLines, listPeriods } from "@/lib/queries";
import { loadSpeWaterfall } from "@/lib/waterfall";

function bps(numerator: bigint, denominator: bigint): number | null {
  if (denominator <= 0n) return null;
  return Number((numerator * 10_000n) / denominator);
}

async function monthlyBrokerT12(entityId: string): Promise<{ monthlyNoi: bigint; opex: bigint; egi: bigint } | null> {
  const stored = await prisma.budgetLine.findMany({
    where: { entityId, source: BROKER_T12_SOURCE },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  if (!stored.length) return null;
  const year = stored[0]!.year;
  const month = stored[0]!.month;
  const map: BudgetByCode = new Map();
  for (const row of stored) {
    if (row.year !== year || row.month !== month) continue;
    map.set(row.accountCode, (map.get(row.accountCode) ?? 0n) + row.amount);
  }
  const stmt = incomeStatementFromBudget(map);
  return { monthlyNoi: stmt.noi, opex: stmt.opex, egi: stmt.egi };
}

async function monthlyNoi(entityId: string, throughYear: number, throughMonth: number): Promise<bigint[]> {
  const periods = await listPeriods(entityId);
  const values: bigint[] = [];
  for (const period of periods) {
    if (period.year > throughYear || (period.year === throughYear && period.month > throughMonth)) continue;
    const inPeriod = await loadPostedLines({ entityIds: [entityId], from: period.startDate, to: period.endDate });
    const throughEnd = await loadPostedLines({ entityIds: [entityId], through: period.endDate });
    values.push(buildIncomeStatement({ throughEnd, inPeriod }).noi);
  }
  return values;
}

export async function captureDealSnapshot(opts: {
  entityId: string;
  year: number;
  month: number;
  actor?: string;
}) {
  const entity = await prisma.entity.findUnique({
    where: { id: opts.entityId },
    include: { vaultDocuments: { select: { filename: true, kind: true } } },
  });
  if (!entity || entity.type !== "SPE") {
    throw new Error("Snapshots are saved on a property SPE.");
  }

  const periodLabel = `${opts.year}-${String(opts.month).padStart(2, "0")}`;
  const owned = isOwnedSpe(entity);
  const broker = owned ? null : await monthlyBrokerT12(entity.id);
  const postedJournals = owned
    ? 1
    : await prisma.journal.count({ where: { entityId: entity.id, status: "POSTED" } });
  const useBroker = broker != null && broker.monthlyNoi !== 0n;
  const useBooks = !useBroker && (owned || postedJournals > 0);

  let periodNoi: bigint | null = null;
  let annualizedNoi: bigint | null = null;
  let opex = 0n;
  let egi = 0n;
  let basisLabel = "No NOI on file";
  let noiBasisLabel = "No NOI on file. Ratios stay blank. Nothing was invented from empty books.";
  let occupancyBps: number | null = null;
  let units = entity.unitCountOverride ?? entity.unitCount;

  if (useBroker && broker) {
    periodNoi = broker.monthlyNoi;
    annualizedNoi = broker.monthlyNoi * 12n;
    opex = broker.opex;
    egi = broker.egi;
    basisLabel = "Broker T12 (not in the books)";
    noiBasisLabel = "Broker T12 (not in the books). Annualized figures use the stored monthly broker T12 × 12.";
  } else if (useBooks) {
    const pack = await buildOperatingPackage({
      entityId: entity.id,
      year: opts.year,
      month: opts.month,
      consolidated: false,
    });
    const actual = pack.operating.actual;
    const t12 = trailingNoi(await monthlyNoi(entity.id, opts.year, opts.month));
    const annual = t12.definition === "t12" ? t12.noiCents : actual.noi * 12n;
    periodNoi = actual.noi;
    annualizedNoi = annual;
    opex = actual.opex;
    egi = actual.egi;
    occupancyBps = pack.kpis.rentRoll?.physicalOccupancyBps ?? null;
    units = entity.unitCountOverride ?? entity.unitCount ?? pack.kpis.rentRoll?.unitCount ?? null;
    if (t12.definition === "t12") {
      basisLabel = "T12";
      noiBasisLabel = "T12 NOI";
    } else {
      basisLabel = "period NOI × 12";
      noiBasisLabel = `T12 incomplete (${t12.monthsAvailable}/12). Annualized figures use period NOI × 12. DSCR uses this month's NOI and debt service.`;
    }
    if (!owned && annual === 0n) {
      periodNoi = null;
      annualizedNoi = null;
      basisLabel = "No NOI on file";
      noiBasisLabel = "No NOI on file. Ratios stay blank. Nothing was invented from empty books.";
    }
  }

  const noiReady = periodNoi != null && annualizedNoi != null && annualizedNoi !== 0n;

  const loans = await loadLoans([entity.id]);
  const loan = loans[0];
  let interest = 0n;
  let principal = 0n;
  let upb = 0n;
  if (loan) {
    const payment = loan.payments.find((row) => row.year === opts.year && row.month === opts.month);
    interest = payment?.interestCents ?? 0n;
    principal = payment?.principalCents ?? 0n;
    upb = loan.currentUpbCents;
  }
  const debtService = interest + principal;
  const dscrBps = noiReady && debtService > 0n ? bps(periodNoi!, debtService) : null;
  const debtYieldBps = noiReady && upb > 0n ? bps(annualizedNoi!, upb) : null;

  const price = entity.purchasePriceCents;
  const value = entity.appraisedValueCents ?? entity.purchasePriceCents;
  const capRateBps = noiReady && price != null && price > 0n ? bps(annualizedNoi!, price) : null;
  const ltvBps = value != null && value > 0n && upb > 0n ? bps(upb, value) : null;

  const pricePerUnitCents = price != null && units != null && units > 0 ? price / BigInt(units) : null;

  const waterfall = await loadSpeWaterfall(entity.id);
  const lpEquity = waterfall?.lpContributedCents ?? 0n;
  const gpBps = waterfall?.config.gpCoInvestBps ?? 0;
  let equityRequired: bigint | null = null;
  if (lpEquity > 0n && gpBps < 10_000) {
    equityRequired = (lpEquity * 10_000n) / BigInt(10_000 - gpBps);
  }
  const cashAfterDebt = noiReady ? annualizedNoi! - debtService * 12n : null;
  const cashOnCashBps =
    noiReady && cashAfterDebt != null && equityRequired != null && equityRequired > 0n
      ? bps(cashAfterDebt, equityRequired)
      : null;

  const residual = waterfall ? residualPromoteSplit(waterfall.config.tiers) : null;
  const promoteSplitLabel = residual ? `LP ${residual.lpSplitBps / 100}% / GP ${residual.gpSplitBps / 100}%` : null;
  const coGp = waterfall?.config.coGpOfPromoteBps ?? 0;
  const rcpShareBps = waterfall && isLookThroughTemplate(waterfall.config.templateId)
    ? 10_000
    : residual
      ? Math.round((residual.gpSplitBps * (10_000 - coGp)) / 10_000)
      : null;

  const expenseRatioBps = noiReady ? opexRatioBps(opex, egi) : null;
  const asOfDate = new Date(Date.UTC(opts.year, opts.month - 1, 1, 16, 0, 0));
  const sourceFiles = JSON.stringify(
    entity.vaultDocuments.map((file) => ({ filename: file.filename, kind: file.kind })),
  );

  return prisma.dealAnalysisSnapshot.create({
    data: {
      entityId: entity.id,
      asOfDate,
      periodLabel,
      recordedBy: opts.actor ?? "principal",
      basisLabel,
      noiBasisLabel,
      sourceFiles,
      dscrBps,
      debtYieldBps,
      cashOnCashBps,
      occupancyBps,
      expenseRatioBps,
      noiCents: noiReady ? periodNoi : null,
      annualizedNoiCents: noiReady ? annualizedNoi : null,
      capRateBps,
      ltvBps,
      pricePerUnitCents,
      prefRateBps: waterfall?.config.prefRateBps ?? null,
      catchUpBps: waterfall?.config.catchUpEnabled ? waterfall.config.catchUpBps : null,
      promoteSplitLabel,
      coGpOfPromoteBps: waterfall ? coGp : null,
      gpCoInvestBps: waterfall ? gpBps : null,
      equityRequiredCents: equityRequired,
      lpEquityCents: lpEquity > 0n ? lpEquity : null,
      rcpShareBps,
      unitCount: units,
      lpNetIrrBps: null,
      lpAvgCashYieldBps: null,
      lpYear1CashYieldBps: null,
      rcpIrrBps: null,
    },
  });
}

export async function backfillDealSnapshots(opts: { year: number; month: number; actor?: string; entityIds?: string[] }) {
  const spes = await prisma.entity.findMany({
    where: {
      type: "SPE",
      ...(opts.entityIds?.length ? { id: { in: opts.entityIds } } : {}),
    },
    select: { id: true, code: true },
    orderBy: { code: "asc" },
  });
  const saved: { code: string; id: string }[] = [];
  for (const spe of spes) {
    try {
      const row = await captureDealSnapshot({
        entityId: spe.id,
        year: opts.year,
        month: opts.month,
        actor: opts.actor ?? "principal",
      });
      saved.push({ code: spe.code, id: row.id });
    } catch (error) {
      // A deal removed while the button is running is skipped. Existing snapshots stay.
      if (error instanceof Error && /property SPE/.test(error.message)) continue;
      throw error;
    }
  }
  return saved;
}
