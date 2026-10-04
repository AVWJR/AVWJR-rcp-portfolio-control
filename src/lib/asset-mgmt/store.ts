import type { PlanEventKind } from "@prisma/client";
import { prisma, type Db } from "@/lib/prisma";
import { buildOperatingPackage } from "@/lib/operating";
import { describePlan, type PlanFacts, type PlanRecommendation } from "./analyze";
import { BLEND_METHOD } from "./formulas";
import { booksAreActive, controllableBudget, loadPlanFacts, loadStoredPlan, periodEndIso } from "./load";
import {
  AssetPlanError,
  PLAN_IDEA_ONLY,
  PLAN_NOT_OWNED,
  PMS_NOTE,
  dateAtNyNoon,
  decisionSideEffects,
  type DecisionInput,
  type IncomeInput,
  type WeeklyInput,
} from "./policy";
import { isOwnedSpe } from "@/lib/owned-spe";

/** Tables a plan action may write. Not units, journals, loans, or the deal itself. */
export const PLAN_WRITE_MODELS = ["assetPlan", "marketObservation", "planRecommendation", "incomeOpportunity", "planEvent"] as const;

function fingerprint(row: { code: string; impactCents: bigint | null; reason: string }): string {
  return `${row.code}|${row.impactCents == null ? "" : row.impactCents.toString()}|${row.reason}`;
}

async function requireOwned(entityId: string) {
  const entity = await prisma.entity.findUnique({ where: { id: entityId } });
  if (!entity || entity.type !== "SPE") throw new AssetPlanError("Unknown deal.", 404);
  if (!isOwnedSpe(entity)) throw new AssetPlanError(PLAN_NOT_OWNED, 409);
  return entity;
}

async function factsFor(entityId: string, year: number, month: number): Promise<PlanFacts> {
  const entity = await requireOwned(entityId);
  const pack = await buildOperatingPackage({ entityId, year, month, consolidated: false });
  const facts = await loadPlanFacts({
    entityId,
    entityCode: entity.code,
    year,
    month,
    periodEnd: periodEndIso(year, month),
    booksActive: booksAreActive(pack.scope.inPeriod),
    egiCents: pack.operating.actual.egi,
    noiCents: pack.operating.actual.noi,
    otherIncomeCents: pack.operating.actual.otherIncome,
    inPeriod: pack.scope.inPeriod,
    throughEnd: pack.scope.throughEnd,
    throughStart: pack.scope.throughStart,
    units: pack.units,
    dealUnitCount: entity.unitCountOverride ?? entity.unitCount,
    businessPlanNote: entity.businessPlan,
    controllableBudgetCents: controllableBudget(pack.operating),
  });
  const stored = await loadStoredPlan(entityId);
  facts.observations = stored.observations;
  facts.opportunities = stored.opportunities;
  return facts;
}

async function persistScore(db: Db, opts: {
  planId: string;
  analysisRecommendations: PlanRecommendation[];
  snapshotJson: string;
  actor: string;
  sourceAsOf: Date | null;
  weekly?: { observationId: string; reason: string };
}) {
  const open = await db.planRecommendation.findMany({ where: { planId: opts.planId, status: "OPEN" } });
  const next = new Map(opts.analysisRecommendations.map((row) => [fingerprint(row), row]));
  const previous = new Map(open.map((row) => [fingerprint(row), row]));

  for (const row of open) {
    const key = fingerprint(row);
    if (next.has(key)) continue;
    await db.planRecommendation.update({
      where: { id: row.id },
      data: { status: "SUPERSEDED", supersededAt: new Date() },
    });
    await db.planEvent.create({
      data: {
        planId: opts.planId,
        kind: "RECOMMENDATION_SUPERSEDED",
        actor: opts.actor,
        reason: "A newer score replaced this recommendation. The earlier row stays in the log.",
        subjectType: "recommendation",
        subjectId: row.id,
        beforeJson: JSON.stringify({ code: row.code, impactCents: row.impactCents?.toString() ?? null, reason: row.reason }),
        status: "SUPERSEDED",
        sourceAsOf: opts.sourceAsOf,
      },
    });
  }

  for (const [key, row] of next) {
    if (previous.has(key)) continue;
    const created = await db.planRecommendation.create({
      data: {
        planId: opts.planId,
        code: row.code,
        title: row.title,
        reason: row.reason,
        impactCents: row.impactCents,
        revpauDeltaCents: row.revpauDeltaCents,
        confidence: row.confidence,
        status: "OPEN",
        sourceLabel: row.sourceLabel,
        sourceAsOf: opts.sourceAsOf,
      },
    });
    await db.planEvent.create({
      data: {
        planId: opts.planId,
        kind: "RECOMMENDATION_CREATED",
        actor: opts.actor,
        reason: row.reason,
        subjectType: "recommendation",
        subjectId: created.id,
        afterJson: JSON.stringify({ code: row.code, impactCents: row.impactCents?.toString() ?? null }),
        status: "OPEN",
        sourceAsOf: opts.sourceAsOf,
        expectedEffectCents: row.impactCents,
      },
    });
  }

  if (opts.weekly) {
    await db.planEvent.create({
      data: {
        planId: opts.planId,
        kind: "WEEKLY_UPDATE",
        actor: opts.actor,
        reason: opts.weekly.reason,
        subjectType: "observation",
        subjectId: opts.weekly.observationId,
        sourceAsOf: opts.sourceAsOf,
        note: PMS_NOTE,
      },
    });
  }

  await db.planEvent.create({
    data: {
      planId: opts.planId,
      kind: "PLAN_ANALYZED" satisfies PlanEventKind,
      actor: opts.actor,
      reason: "The plan was scored again from this deal's rent roll, books, and saved observations.",
      subjectType: "plan",
      subjectId: opts.planId,
      afterJson: opts.snapshotJson,
      kpiAfterJson: opts.snapshotJson,
      sourceAsOf: opts.sourceAsOf,
      note: PMS_NOTE,
    },
  });

  await db.assetPlan.update({
    where: { id: opts.planId },
    data: { status: "ANALYZED", lastAnalyzedAt: new Date(), blendMethodVersion: BLEND_METHOD.version },
  });
}

export async function saveWeeklyUpdate(opts: {
  entityId: string;
  year: number;
  month: number;
  actor: string;
  input: WeeklyInput;
}) {
  decisionSideEffects();
  const facts = await factsFor(opts.entityId, opts.year, opts.month);
  const draft = {
    id: "pending",
    sourceName: opts.input.sourceName,
    sourceType: opts.input.sourceType,
    geography: opts.input.geography,
    floorplan: opts.input.floorplan,
    valueCents: opts.input.valueCents,
    rangeLowCents: opts.input.rangeLowCents,
    rangeHighCents: opts.input.rangeHighCents,
    trendNote: opts.input.trendNote,
    asOfDate: opts.input.asOfDate,
    vintageDate: opts.input.vintageDate,
    retrievedAt: opts.input.retrievedAt,
    termsNote: opts.input.termsNote,
  };
  facts.observations = [...facts.observations, draft];
  const analysis = describePlan(facts);
  const observationId = await prisma.$transaction(async (tx) => {
    const plan = await tx.assetPlan.upsert({
      where: { entityId: opts.entityId },
      update: {},
      create: { entityId: opts.entityId, blendMethodVersion: BLEND_METHOD.version, status: "OPEN" },
    });
    const observation = await tx.marketObservation.create({
      data: {
        planId: plan.id,
        sourceName: opts.input.sourceName,
        sourceType: opts.input.sourceType,
        geography: opts.input.geography,
        floorplan: opts.input.floorplan,
        beds: opts.input.beds,
        valueCents: opts.input.valueCents,
        rangeLowCents: opts.input.rangeLowCents,
        rangeHighCents: opts.input.rangeHighCents,
        trendNote: opts.input.trendNote,
        vintageDate: opts.input.vintageDate ? dateAtNyNoon(opts.input.vintageDate) : null,
        asOfDate: dateAtNyNoon(opts.input.asOfDate),
        retrievedAt: dateAtNyNoon(opts.input.retrievedAt),
        termsNote: opts.input.termsNote,
      },
    });
    await persistScore(tx, {
      planId: plan.id,
      analysisRecommendations: analysis.recommendations,
      snapshotJson: JSON.stringify(analysis.snapshot),
      actor: opts.actor,
      sourceAsOf: dateAtNyNoon(opts.input.asOfDate),
      weekly: {
        observationId: observation.id,
        reason: `Weekly update from ${opts.input.sourceName} as of ${opts.input.asOfDate}. ${opts.input.termsNote}`,
      },
    });
    return observation.id;
  });
  return { external: false as const, observationId };
}

export async function saveIncomeIdea(opts: {
  entityId: string;
  year: number;
  month: number;
  actor: string;
  input: IncomeInput;
}) {
  decisionSideEffects();
  await factsFor(opts.entityId, opts.year, opts.month);
  const createdId = await prisma.$transaction(async (tx) => {
    const plan = await tx.assetPlan.upsert({
      where: { entityId: opts.entityId },
      update: {},
      create: { entityId: opts.entityId, blendMethodVersion: BLEND_METHOD.version, status: "OPEN" },
    });
    const created = await tx.incomeOpportunity.create({
      data: {
        planId: plan.id,
        category: opts.input.category,
        title: opts.input.title,
        currentCaptureCents: opts.input.currentCaptureCents,
        fullRolloutCents: opts.input.fullRolloutCents,
        setupCostCents: opts.input.setupCostCents,
        ownerName: opts.input.ownerName,
        steps: opts.input.steps,
        legalNote: opts.input.legalNote,
        status: "IDEA",
      },
    });
    await tx.planEvent.create({
      data: {
        planId: plan.id,
        kind: "ACTION",
        actor: opts.actor,
        reason: `Income idea added: ${opts.input.title}.`,
        subjectType: "opportunity",
        subjectId: created.id,
        afterJson: JSON.stringify({ status: "IDEA", title: opts.input.title, category: opts.input.category }),
        status: "IDEA",
        ownerName: opts.input.ownerName,
        note: PMS_NOTE,
      },
    });
    return created.id;
  });
  return { id: createdId, external: false as const };
}

export async function decideIncomeIdea(opts: {
  entityId: string;
  year: number;
  month: number;
  actor: string;
  input: DecisionInput;
}) {
  const effects = decisionSideEffects();
  if (effects.deletesHistory || effects.external || effects.pmsWrite) {
    throw new AssetPlanError("Plan actions cannot leave RCP.");
  }
  const plan = await prisma.assetPlan.findFirst({
    where: { entityId: opts.entityId, opportunities: { some: { id: opts.input.opportunityId } } },
  });
  const opportunity = plan
    ? await prisma.incomeOpportunity.findFirst({ where: { id: opts.input.opportunityId, planId: plan.id } })
    : null;
  if (!opportunity || !plan) throw new AssetPlanError(PLAN_IDEA_ONLY, 404);
  if (opportunity.status !== "IDEA") throw new AssetPlanError(PLAN_IDEA_ONLY, 409);
  const nextStatus = opts.input.decision === "APPROVE" ? "APPROVED" : "DECLINED";
  const facts = await factsFor(opts.entityId, opts.year, opts.month);
  facts.opportunities = facts.opportunities.map((row) => (row.id === opportunity.id ? { ...row, status: nextStatus } : row));
  const analysis = describePlan(facts);
  const gap =
    opportunity.currentCaptureCents != null && opportunity.fullRolloutCents != null && opportunity.fullRolloutCents > opportunity.currentCaptureCents
      ? opportunity.fullRolloutCents - opportunity.currentCaptureCents
      : null;

  await prisma.$transaction(async (tx) => {
    await tx.incomeOpportunity.update({ where: { id: opportunity.id }, data: { status: nextStatus } });
    await tx.planEvent.create({
      data: {
        planId: plan.id,
        kind: "DECISION",
        actor: opts.actor,
        reason: opts.input.reason,
        subjectType: "opportunity",
        subjectId: opportunity.id,
        beforeJson: JSON.stringify({ status: "IDEA" }),
        afterJson: JSON.stringify({ status: nextStatus }),
        status: nextStatus,
        ownerName: opts.input.ownerName,
        dueDate: opts.input.dueDate ? dateAtNyNoon(opts.input.dueDate) : null,
        expectedEffectCents: nextStatus === "APPROVED" ? gap : null,
        kpiBeforeJson: JSON.stringify(analysis.snapshot),
        note: PMS_NOTE,
      },
    });
    await tx.planEvent.create({
      data: {
        planId: plan.id,
        kind: "ACTION",
        actor: opts.actor,
        reason: opts.input.reason,
        subjectType: "opportunity",
        subjectId: opportunity.id,
        status: nextStatus === "APPROVED" ? "OPEN" : "DECLINED",
        ownerName: opts.input.ownerName ?? "Unassigned",
        dueDate: opts.input.dueDate ? dateAtNyNoon(opts.input.dueDate) : null,
        note: PMS_NOTE,
      },
    });
    await persistScore(tx, {
      planId: plan.id,
      analysisRecommendations: analysis.recommendations,
      snapshotJson: JSON.stringify(analysis.snapshot),
      actor: opts.actor,
      sourceAsOf: null,
    });
  });
  return { status: nextStatus, external: false as const };
}
