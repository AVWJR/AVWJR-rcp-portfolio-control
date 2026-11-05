import { DEAL_STATUS_LABEL, effectiveDealStatus, type DealStatusValue } from "@/lib/deal-status";
import { dealFeeNeededLabel } from "@/lib/library/fees";
import { analysisStaleLevel, type StaleLevel } from "@/lib/library/staleness";
import { isOwnedSpe } from "@/lib/owned-spe";
import { prisma } from "@/lib/prisma";
import { dealCashNotes, projectDealReturns, resolveEquityRequiredCents } from "@/lib/returns/project-deal";
import { readAnnualCfadsCents, readAnnualDebtServiceCents } from "@/lib/returns/read-cash";
import { loadSpeWaterfall } from "@/lib/waterfall";
import type { LibraryFact } from "./criteria";

export type LibraryRow = LibraryFact & {
  name: string;
  statusLabel: string;
  stale: StaleLevel;
  snapshotId: string | null;
  recordedAt: string | null;
  asOfLabel: string | null;
  basisLabel: string | null;
  noiBasisLabel: string | null;
  sourceFiles: { filename: string; kind: string }[];
  streetAddress: string | null;
  city: string | null;
  submarket: string | null;
  msa: string | null;
  propertyType: string | null;
  assetClass: string | null;
  businessPlan: string | null;
  vintageYear: number | null;
  amFeeBps: number | null;
  otherLpFeeCents: number | null;
  otherLpFeeNote: string | null;
  lpYear1CashYieldBps: number | null;
  lpIrrNote: string | null;
  rcpIrrNote: string | null;
  returnNotes: string[];
  feeAccruedUnpaidCents: number | null;
  returnGap: string | null;
  purchasePriceCents: number | null;
  appraisedValueCents: number | null;
  renovationBudgetCents: number | null;
  holdPeriodYears: number | null;
  unitCountOverride: number | null;
};

function num(value: bigint | null | undefined): number | null {
  if (value == null) return null;
  return Number(value);
}

function files(json: string | null | undefined): { filename: string; kind: string }[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as { filename?: string; kind?: string }[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row) => row && typeof row.filename === "string")
      .map((row) => ({ filename: row.filename!, kind: row.kind ?? "file" }));
  } catch {
    return [];
  }
}

export async function loadLibraryRows(now = new Date(), period?: { year: number; month: number } | null): Promise<LibraryRow[]> {
  const year = period?.year;
  const month = period?.month;
  const spes = await prisma.entity.findMany({
    where: { type: "SPE" },
    orderBy: { code: "asc" },
    include: {
      analysisSnapshots: { orderBy: { recordedAt: "desc" }, take: 1 },
    },
  });

  const rows: LibraryRow[] = [];
  for (const spe of spes) {
    const snap = spe.analysisSnapshots[0] ?? null;
    const status = effectiveDealStatus(spe);
    const feeNeeded = dealFeeNeededLabel(spe) != null;
    const returns = await libraryReturns(spe, snap, year, month);
    rows.push({
      code: spe.code,
      name: spe.name,
      dealStatus: status,
      statusLabel: DEAL_STATUS_LABEL[status],
      stale: analysisStaleLevel(snap?.recordedAt ?? null, now),
      snapshotId: snap?.id ?? null,
      recordedAt: snap?.recordedAt.toISOString() ?? null,
      asOfLabel: snap?.periodLabel ?? null,
      basisLabel: snap?.basisLabel ?? null,
      noiBasisLabel: snap?.noiBasisLabel ?? null,
      sourceFiles: files(snap?.sourceFiles),
      dscrBps: snap?.dscrBps ?? null,
      debtYieldBps: snap?.debtYieldBps ?? null,
      capRateBps: snap?.capRateBps ?? null,
      ltvBps: snap?.ltvBps ?? null,
      cashOnCashBps: snap?.cashOnCashBps ?? null,
      occupancyBps: snap?.occupancyBps ?? null,
      expenseRatioBps: snap?.expenseRatioBps ?? null,
      pricePerUnitCents: num(snap?.pricePerUnitCents),
      unitCount: snap?.unitCount ?? spe.unitCountOverride ?? spe.unitCount,
      lpNetIrrBps: returns.lpNetIrrBps,
      lpCashYieldBps: returns.lpCashYieldBps,
      rcpIrrBps: returns.rcpIrrBps,
      state: spe.state,
      metro: spe.metro,
      msa: spe.msa,
      submarket: spe.submarket,
      city: spe.city,
      propertyType: spe.propertyType,
      assetClass: spe.assetClass,
      vintageYear: spe.vintageYear,
      businessPlan: spe.businessPlan,
      prefRateBps: snap?.prefRateBps ?? null,
      catchUpBps: snap?.catchUpBps ?? null,
      coGpBps: snap?.coGpOfPromoteBps ?? null,
      equityRequiredCents: num(returns.equityRequiredCents),
      feeNeeded,
      streetAddress: spe.streetAddress,
      purchasePriceCents: num(spe.purchasePriceCents),
      appraisedValueCents: num(spe.appraisedValueCents),
      renovationBudgetCents: num(spe.renovationBudgetCents),
      holdPeriodYears: spe.holdPeriodYears,
      unitCountOverride: spe.unitCountOverride,
      amFeeBps: spe.amFeeBps,
      otherLpFeeCents: num(spe.otherLpFeeCents),
      otherLpFeeNote: spe.otherLpFeeNote,
      lpYear1CashYieldBps: returns.lpYear1CashYieldBps,
      lpIrrNote: returns.lpIrrNote,
      rcpIrrNote: returns.rcpIrrNote,
      returnNotes: returns.returnNotes,
      feeAccruedUnpaidCents: returns.feeAccruedUnpaidCents > 0n ? Number(returns.feeAccruedUnpaidCents) : null,
      returnGap: returns.returnGap,
      metricGaps: returns.metricGaps,
    });
  }
  return rows;
}

async function libraryReturns(
  spe: { id: string; code: string; type: string; lifecycleStatus: string; dealStatus: string; holdPeriodYears: number | null; amFeeBps: number | null; otherLpFeeCents: bigint | null; purchasePriceCents: bigint | null },
  snap: { annualizedNoiCents: bigint | null; equityRequiredCents: bigint | null; noiCents: bigint | null; dscrBps: number | null } | null,
  year: number | undefined,
  month: number | undefined,
): Promise<{
  lpNetIrrBps: number | null;
  lpCashYieldBps: number | null;
  lpYear1CashYieldBps: number | null;
  rcpIrrBps: number | null;
  lpIrrNote: string | null;
  rcpIrrNote: string | null;
  returnNotes: string[];
  feeAccruedUnpaidCents: bigint;
  equityRequiredCents: bigint | null;
  returnGap: string | null;
  metricGaps: Partial<Record<"lpNetIrr" | "lpCashYield" | "rcpIrr", string>>;
}> {
  const blank = {
    lpNetIrrBps: null,
    lpCashYieldBps: null,
    lpYear1CashYieldBps: null,
    rcpIrrBps: null,
    lpIrrNote: null as string | null,
    rcpIrrNote: null as string | null,
    returnNotes: [] as string[],
    feeAccruedUnpaidCents: 0n,
    equityRequiredCents: null as bigint | null,
    returnGap: null as string | null,
    metricGaps: {} as Partial<Record<"lpNetIrr" | "lpCashYield" | "rcpIrr", string>>,
  };
  try {
    const waterfall = await loadSpeWaterfall(spe.id);
    if (!waterfall) return blank;
    const owned = isOwnedSpe(spe);
    let year1 = 0n;
    if (owned) year1 = await readAnnualCfadsCents(spe.id, year, month);
    const annualizedNoi = snap?.annualizedNoiCents ?? null;
    if (year1 <= 0n && annualizedNoi != null && annualizedNoi > 0n) year1 = annualizedNoi;
    const lpEquity = waterfall.lpContributedCents > 0n ? waterfall.lpContributedCents : 0n;
    const equityRequired = resolveEquityRequiredCents({
      lpContributedCents: lpEquity,
      gpCoInvestBps: waterfall.config.gpCoInvestBps ?? 0,
      snapshotCents: snap?.equityRequiredCents ?? null,
    });
    const withEquity = { ...blank, equityRequiredCents: equityRequired };
    const debt = await readAnnualDebtServiceCents({
      entityId: spe.id,
      owned,
      year,
      month,
      snapshotNoiCents: snap?.noiCents ?? null,
      snapshotDscrBps: snap?.dscrBps ?? null,
    });
    const metrics = projectDealReturns({
      config: waterfall.config,
      lpContributedCents: waterfall.lpContributedCents,
      unreturnedCapitalCents: waterfall.unreturnedCapitalCents,
      unpaidPrefCents: waterfall.unpaidPrefCents,
      prefPaidToDateCents: waterfall.prefPaidToDateCents,
      year1CfadsCents: year1,
      holdYears: spe.holdPeriodYears && spe.holdPeriodYears > 0 ? spe.holdPeriodYears : 5,
      growthBps: 0,
      exitEquityProceedsCents: 0n,
      amFeeBps: spe.amFeeBps,
      otherLpFeeCents: spe.otherLpFeeCents,
      purchasePriceCents: spe.purchasePriceCents,
      equityRequiredCents: equityRequired,
      annualDebtServiceCents: debt,
    });
    const metricGaps: Partial<Record<"lpNetIrr" | "lpCashYield" | "rcpIrr", string>> = {};
    if (metrics.gap) {
      metricGaps.lpNetIrr = metrics.gap;
      metricGaps.lpCashYield = metrics.gap;
      metricGaps.rcpIrr = metrics.gap;
      return { ...withEquity, returnGap: metrics.gap, metricGaps };
    }
    if (metrics.lpNetIrrBps == null && metrics.lpIrrNote) metricGaps.lpNetIrr = metrics.lpIrrNote;
    if (metrics.rcpIrrBps == null && metrics.rcpIrrNote) metricGaps.rcpIrr = metrics.rcpIrrNote;
    return {
      lpNetIrrBps: metrics.lpNetIrrBps,
      lpCashYieldBps: metrics.lpAvgCashYieldBps,
      lpYear1CashYieldBps: metrics.lpYear1CashYieldBps,
      rcpIrrBps: metrics.rcpIrrBps,
      lpIrrNote: metrics.lpIrrNote,
      rcpIrrNote: metrics.rcpIrrNote,
      returnNotes: dealCashNotes(metrics.notes),
      feeAccruedUnpaidCents: metrics.feeAccruedUnpaidCents,
      equityRequiredCents: equityRequired,
      returnGap: null,
      metricGaps,
    };
  } catch {
    return blank;
  }
}

export type DealProfile = {
  code: string;
  name: string;
  dealStatus: DealStatusValue;
  statusLabel: string;
  permanentDemo: boolean;
  lifecycleStatus: string;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  metro: string | null;
  msa: string | null;
  submarket: string | null;
  propertyType: string | null;
  vintageYear: number | null;
  assetClass: string | null;
  unitCount: number | null;
  unitCountOverride: number | null;
  businessPlan: string | null;
  holdPeriodYears: number | null;
  purchasePriceCents: number | null;
  appraisedValueCents: number | null;
  renovationBudgetCents: number | null;
  amFeeBps: number | null;
  otherLpFeeCents: number | null;
  otherLpFeeNote: string | null;
  feeNeeded: boolean;
  latest: {
    id: string;
    periodLabel: string;
    recordedAt: string;
    basisLabel: string;
    noiBasisLabel: string;
    stale: StaleLevel;
  } | null;
};

export async function loadDealProfile(code: string): Promise<DealProfile | null> {
  const spe = await prisma.entity.findUnique({
    where: { code: code.trim().toUpperCase() },
    include: { analysisSnapshots: { orderBy: { recordedAt: "desc" }, take: 1 } },
  });
  if (!spe || spe.type !== "SPE") return null;
  const status = effectiveDealStatus(spe);
  const snap = spe.analysisSnapshots[0] ?? null;
  const { isPermanentDemoSpe } = await import("@/lib/archive");
  return {
    code: spe.code,
    name: spe.name,
    dealStatus: status,
    statusLabel: DEAL_STATUS_LABEL[status],
    permanentDemo: isPermanentDemoSpe(spe.code),
    lifecycleStatus: spe.lifecycleStatus,
    streetAddress: spe.streetAddress,
    city: spe.city,
    state: spe.state,
    metro: spe.metro,
    msa: spe.msa,
    submarket: spe.submarket,
    propertyType: spe.propertyType,
    vintageYear: spe.vintageYear,
    assetClass: spe.assetClass,
    unitCount: spe.unitCount,
    unitCountOverride: spe.unitCountOverride,
    businessPlan: spe.businessPlan,
    holdPeriodYears: spe.holdPeriodYears,
    purchasePriceCents: num(spe.purchasePriceCents),
    appraisedValueCents: num(spe.appraisedValueCents),
    renovationBudgetCents: num(spe.renovationBudgetCents),
    amFeeBps: spe.amFeeBps,
    otherLpFeeCents: num(spe.otherLpFeeCents),
    otherLpFeeNote: spe.otherLpFeeNote,
    feeNeeded: dealFeeNeededLabel(spe) != null,
    latest: snap
      ? {
          id: snap.id,
          periodLabel: snap.periodLabel,
          recordedAt: snap.recordedAt.toISOString(),
          basisLabel: snap.basisLabel,
          noiBasisLabel: snap.noiBasisLabel,
          stale: analysisStaleLevel(snap.recordedAt),
        }
      : null,
  };
}
