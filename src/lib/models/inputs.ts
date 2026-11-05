import { europeanPromoteOpen, loadSpeWaterfall, type SpeWaterfallRecord } from "@/lib/waterfall";
import { readAnnualCfadsCents, readAnnualDebtServiceCents, readAnnualNoiCents } from "@/lib/returns/read-cash";
import { resolveEquityRequiredCents } from "@/lib/returns/project-deal";
import { effectiveDealStatus, isOwnedSpe } from "@/lib/owned-spe";
import { analysisStaleLevel, type StaleLevel } from "@/lib/library/staleness";
import type { LibraryFact } from "@/lib/library/criteria";
import { dealFeeNeededLabel } from "@/lib/library/fees";
import { prisma } from "@/lib/prisma";
import type { ModelDealInput } from "./project";
import { membershipDecision, modelKind, NOT_YET_SCREENED } from "./membership";

function num(value: bigint | null | undefined): number | null {
  if (value == null) return null;
  return Number(value);
}

export async function loadModelDealInputs(opts: {
  entityIds: string[];
  modelKind: string;
  year?: number | null;
  month?: number | null;
  optimizerEligible: Map<string, boolean>;
}): Promise<ModelDealInput[]> {
  if (!opts.entityIds.length) return [];
  const entities = await prisma.entity.findMany({
    where: { id: { in: opts.entityIds } },
    include: { analysisSnapshots: { orderBy: { recordedAt: "desc" }, take: 1 }, loans: { select: { currentUpbCents: true } } },
  });
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const records: SpeWaterfallRecord[] = [];
  for (const id of opts.entityIds) {
    const record = await loadSpeWaterfall(id);
    if (record) records.push(record);
  }
  const gate = europeanPromoteOpen(records, 12);
  const recordById = new Map(records.map((record) => [record.entityId, record]));
  const kind = modelKind(opts.modelKind);
  const out: ModelDealInput[] = [];

  for (const id of opts.entityIds) {
    const entity = byId.get(id);
    const record = recordById.get(id);
    if (!entity || !record) continue;
    const status = effectiveDealStatus(entity);
    const decision = membershipDecision(status, kind);
    const snap = entity.analysisSnapshots[0] ?? null;
    const owned = isOwnedSpe(entity);
    let year1 = 0n;
    if (owned) year1 = await readAnnualCfadsCents(entity.id, opts.year, opts.month);
    if (year1 <= 0n && snap?.annualizedNoiCents != null && snap.annualizedNoiCents > 0n) {
      year1 = snap.annualizedNoiCents;
    }
    const lpEquity = record.lpContributedCents > 0n ? record.lpContributedCents : 0n;
    const equityRequired = resolveEquityRequiredCents({
      lpContributedCents: lpEquity,
      gpCoInvestBps: record.config.gpCoInvestBps ?? 0,
      snapshotCents: snap?.equityRequiredCents ?? null,
    });
    const annualDebtServiceCents = await readAnnualDebtServiceCents({
      entityId: entity.id,
      owned,
      year: opts.year,
      month: opts.month,
      snapshotNoiCents: snap?.noiCents ?? null,
      snapshotDscrBps: snap?.dscrBps ?? null,
    });
    const upb = entity.loans.reduce((sum, loan) => sum + loan.currentUpbCents, 0n);
    let annualizedNoi = snap?.annualizedNoiCents != null && snap.annualizedNoiCents > 0n ? snap.annualizedNoiCents : null;
    if (annualizedNoi == null && owned) {
      const bookNoi = await readAnnualNoiCents(entity.id, opts.year, opts.month);
      if (bookNoi > 0n) annualizedNoi = bookNoi;
    }
    const flag = decision.ok ? decision.flag : status === "ARCHIVED" ? "view only" : null;
    const optimizerEligible = decision.ok ? decision.optimizerEligible : false;
    const fact: LibraryFact = {
      code: entity.code,
      dscrBps: snap?.dscrBps ?? null,
      debtYieldBps: snap?.debtYieldBps ?? null,
      capRateBps: snap?.capRateBps ?? null,
      ltvBps: snap?.ltvBps ?? null,
      cashOnCashBps: snap?.cashOnCashBps ?? null,
      occupancyBps: snap?.occupancyBps ?? null,
      expenseRatioBps: snap?.expenseRatioBps ?? null,
      pricePerUnitCents: num(snap?.pricePerUnitCents),
      unitCount: snap?.unitCount ?? entity.unitCountOverride ?? entity.unitCount,
      lpNetIrrBps: snap?.lpNetIrrBps ?? null,
      lpCashYieldBps: snap?.lpAvgCashYieldBps ?? null,
      rcpIrrBps: snap?.rcpIrrBps ?? null,
      state: entity.state,
      metro: entity.metro,
      msa: entity.msa,
      submarket: entity.submarket,
      city: entity.city,
      propertyType: entity.propertyType,
      assetClass: entity.assetClass,
      vintageYear: entity.vintageYear,
      businessPlan: entity.businessPlan,
      prefRateBps: snap?.prefRateBps ?? record.config.prefRateBps,
      catchUpBps: snap?.catchUpBps ?? null,
      coGpBps: record.config.coGpOfPromoteBps,
      equityRequiredCents: num(equityRequired),
      dealStatus: status,
      feeNeeded: dealFeeNeededLabel(entity) != null,
    };
    out.push({
      code: entity.code,
      name: entity.name,
      dealStatus: status,
      optimizerEligible,
      flag: status === "PIPELINE" ? NOT_YET_SCREENED : flag,
      stale: analysisStaleLevel(snap?.recordedAt ?? null) as StaleLevel,
      metro: entity.metro,
      state: entity.state,
      propertyType: entity.propertyType,
      vintageYear: entity.vintageYear,
      equityRequiredCents: equityRequired,
      dscrBps: snap?.dscrBps ?? null,
      debtYieldBps: snap?.debtYieldBps ?? null,
      annualizedNoiCents: annualizedNoi,
      upbCents: upb,
      fact,
      returns: {
        config: record.config,
        lpContributedCents: record.lpContributedCents,
        unreturnedCapitalCents: record.unreturnedCapitalCents,
        unpaidPrefCents: record.unpaidPrefCents,
        prefPaidToDateCents: record.prefPaidToDateCents,
        year1CfadsCents: year1,
        europeanPromoteOpen: gate,
        amFeeBps: entity.amFeeBps,
        otherLpFeeCents: entity.otherLpFeeCents,
        purchasePriceCents: entity.purchasePriceCents,
        equityRequiredCents: equityRequired,
        annualDebtServiceCents,
      },
    });
  }
  return out;
}
