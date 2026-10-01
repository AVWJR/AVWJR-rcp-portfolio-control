import { parseCriteria, type Criterion } from "@/lib/library/criteria";
import { loadOpcoGaBudgetCents } from "@/lib/library/profile";
import { prisma } from "@/lib/prisma";
import { effectiveDealStatus } from "@/lib/owned-spe";
import { MAX_COMPARE, membershipDecision, modelKind, MODEL_LIVE, MODEL_TEST, type ModelKind } from "./membership";
import { loadModelDealInputs } from "./inputs";
import { projectModel, type ModelAssumptions, type ModelProjection } from "./project";

export class ModelError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ModelError";
    this.status = status;
  }
}

const DEMO_CODES = new Set(["SPE-WBG", "SPE-CVC", "SPE-HCR"]);

function cleanName(name: string): string {
  const trimmed = name.trim().slice(0, 120);
  if (!trimmed) throw new ModelError("Name the Model.");
  return trimmed;
}

function clampHold(value: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.min(15, Math.max(1, Math.round(value)));
}

function optionalBps(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(10_000, Math.max(0, Math.round(n)));
}

function optionalCents(value: unknown): bigint | null {
  if (value == null || value === "") return null;
  if (typeof value === "bigint") return value < 0n ? 0n : value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.max(0, Math.round(value)));
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.trim().replace(/[$,]/g, ""));
    if (!Number.isFinite(n) || n < 0) return null;
    return BigInt(Math.round(n * 100));
  }
  return null;
}

async function requireModel(id: string) {
  const model = await prisma.portfolioModel.findUnique({
    where: { id },
    include: { deals: { orderBy: { sortOrder: "asc" } } },
  });
  if (!model) throw new ModelError("That Model is gone.", 404);
  return model;
}

export async function listModels() {
  return prisma.portfolioModel.findMany({
    orderBy: { updatedAt: "desc" },
    include: { deals: { select: { id: true } } },
  });
}

export async function createModel(input: { name: string; kind?: string | null }) {
  const kind: ModelKind = input.kind === MODEL_TEST ? MODEL_TEST : MODEL_LIVE;
  return prisma.portfolioModel.create({
    data: { name: cleanName(input.name), kind },
  });
}

export async function copyModel(id: string) {
  const source = await requireModel(id);
  const copy = await prisma.portfolioModel.create({
    data: {
      name: cleanName(`Copy of ${source.name}`.slice(0, 120)),
      kind: source.kind,
      holdYears: source.holdYears,
      growthBps: source.growthBps,
      exitCapRateBps: source.exitCapRateBps,
      opcoPrefRateBps: source.opcoPrefRateBps,
      opcoPrefCapitalCents: source.opcoPrefCapitalCents,
      opcoLpSplitBps: source.opcoLpSplitBps,
      opcoGpSplitBps: source.opcoGpSplitBps,
      criteriaJson: source.criteriaJson,
      copiedFromId: source.id,
      deals: {
        create: source.deals.map((deal) => ({
          entityId: deal.entityId,
          sortOrder: deal.sortOrder,
          optimizerEligible: deal.optimizerEligible,
        })),
      },
    },
  });
  return copy;
}

export async function deleteModel(id: string) {
  await requireModel(id);
  await prisma.portfolioModel.delete({ where: { id } });
}

export async function addModelDeal(modelId: string, code: string) {
  const model = await requireModel(modelId);
  const entity = await prisma.entity.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!entity || entity.type !== "SPE") throw new ModelError("Pick a property SPE.");
  const status = effectiveDealStatus(entity);
  const decision = membershipDecision(status, modelKind(model.kind));
  if (!decision.ok) throw new ModelError(decision.reason);
  const existing = model.deals.find((deal) => deal.entityId === entity.id);
  if (existing) throw new ModelError("That deal is already in this Model.");
  const row = await prisma.portfolioModelDeal.create({
    data: {
      modelId: model.id,
      entityId: entity.id,
      sortOrder: model.deals.length,
      optimizerEligible: decision.optimizerEligible,
    },
  });
  return { id: row.id, code: entity.code, optimizerEligible: row.optimizerEligible, flag: decision.flag };
}

export async function removeModelDeal(modelId: string, code: string) {
  const model = await requireModel(modelId);
  const entity = await prisma.entity.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!entity) throw new ModelError("That deal is not in this Model.", 404);
  const row = model.deals.find((deal) => deal.entityId === entity.id);
  if (!row) throw new ModelError("That deal is not in this Model.", 404);
  await prisma.portfolioModelDeal.delete({ where: { id: row.id } });
  if (DEMO_CODES.has(entity.code)) {
    const fresh = await prisma.entity.findUnique({ where: { id: entity.id }, select: { dealStatus: true, code: true } });
    if (fresh?.dealStatus !== entity.dealStatus) {
      throw new ModelError("Removing a deal from a Model must not change the deal.");
    }
  }
}

export async function updateModelAssumptions(modelId: string, body: Record<string, unknown>) {
  await requireModel(modelId);
  const holdYears = clampHold(typeof body.holdYears === "number" ? body.holdYears : Number(body.holdYears ?? 5));
  const growthPercent = typeof body.growthPercent === "number" ? body.growthPercent : Number(body.growthPercent ?? 0);
  const growthBps = Number.isFinite(growthPercent) ? Math.min(10_000, Math.max(0, Math.round(growthPercent * 100))) : 0;
  const exitCapRateBps = optionalBps(body.exitCapPercent == null || body.exitCapPercent === "" ? null : Number(body.exitCapPercent) * 100);
  const opcoPrefRateBps = optionalBps(body.opcoPrefPercent == null || body.opcoPrefPercent === "" ? null : Number(body.opcoPrefPercent) * 100);
  const opcoPrefCapitalCents = optionalCents(body.opcoPrefCapitalUsd);
  await prisma.portfolioModel.update({
    where: { id: modelId },
    data: { holdYears, growthBps, exitCapRateBps, opcoPrefRateBps, opcoPrefCapitalCents },
  });
}

export async function updateModelCriteria(modelId: string, criteria: unknown) {
  await requireModel(modelId);
  const parsed = parseCriteria(criteria);
  await prisma.portfolioModel.update({
    where: { id: modelId },
    data: { criteriaJson: JSON.stringify(parsed) },
  });
  return parsed;
}

function assumptionsOf(model: {
  holdYears: number;
  growthBps: number;
  exitCapRateBps: number | null;
  opcoPrefRateBps: number | null;
  opcoPrefCapitalCents: bigint | null;
  opcoLpSplitBps: number;
  opcoGpSplitBps: number;
}): ModelAssumptions {
  return {
    holdYears: model.holdYears,
    growthBps: model.growthBps,
    exitCapRateBps: model.exitCapRateBps,
    opcoPrefRateBps: model.opcoPrefRateBps,
    opcoPrefCapitalCents: model.opcoPrefCapitalCents,
    opcoLpSplitBps: model.opcoLpSplitBps,
    opcoGpSplitBps: model.opcoGpSplitBps,
  };
}

export async function loadModelProjection(id: string, year: number, month: number): Promise<{
  id: string;
  name: string;
  kind: ModelKind;
  assumptions: ModelAssumptions;
  criteria: Criterion[];
  projection: ModelProjection;
}> {
  const model = await requireModel(id);
  const kind = modelKind(model.kind);
  for (const deal of model.deals) {
    const entity = await prisma.entity.findUnique({ where: { id: deal.entityId } });
    if (!entity) continue;
    const decision = membershipDecision(effectiveDealStatus(entity), kind);
    const eligible = decision.ok ? decision.optimizerEligible : false;
    if (eligible !== deal.optimizerEligible) {
      await prisma.portfolioModelDeal.update({ where: { id: deal.id }, data: { optimizerEligible: eligible } });
      deal.optimizerEligible = eligible;
    }
  }
  const inputs = await loadModelDealInputs({
    entityIds: model.deals.map((deal) => deal.entityId),
    modelKind: kind,
    year,
    month,
    optimizerEligible: new Map(model.deals.map((deal) => [deal.entityId, deal.optimizerEligible])),
  });
  const criteria = parseCriteria(JSON.parse(model.criteriaJson || "[]") as unknown);
  const ga = await loadOpcoGaBudgetCents();
  return {
    id: model.id,
    name: model.name,
    kind,
    assumptions: assumptionsOf(model),
    criteria,
    projection: projectModel({ assumptions: assumptionsOf(model), criteria, gaBudgetCents: ga, deals: inputs }),
  };
}

export async function compareModelProjections(ids: string[], year: number, month: number) {
  const unique = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (unique.length > MAX_COMPARE) {
    throw new ModelError(`Compare up to ${MAX_COMPARE} Models.`);
  }
  const rows = [];
  for (const id of unique) rows.push(await loadModelProjection(id, year, month));
  return rows;
}
