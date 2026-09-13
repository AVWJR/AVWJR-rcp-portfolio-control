import type { DealIntake, DealIntakeFile, SpeStrategy } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { defaultOpCoCode, isDealFileSource, type DealFileSource, type DealIntakePatch } from "./types";

export type IntakeWithFiles = DealIntake & { files: DealIntakeFile[]; entity: { code: string; name: string } | null };

export async function createIntake(patch: DealIntakePatch = {}) {
  return prisma.dealIntake.create({
    data: {
      status: "DRAFT",
      currentStep: patch.currentStep ?? 1,
      goal: patch.goal ?? null,
      targetPeriod: patch.targetPeriod ?? "2026-08",
      speName: patch.speName ?? null,
      speCode: patch.speCode ?? null,
      unitCount: patch.unitCount ?? null,
      strategy: (patch.strategy as SpeStrategy | null) ?? null,
      parentOpCoCode: patch.parentOpCoCode ?? defaultOpCoCode(),
      sourcesJson: JSON.stringify(patch.sources ?? ["upload"]),
    },
    include: { files: true, entity: { select: { code: true, name: true } } },
  });
}

export async function getIntake(id: string): Promise<IntakeWithFiles | null> {
  return prisma.dealIntake.findUnique({
    where: { id },
    include: { files: { orderBy: { createdAt: "asc" } }, entity: { select: { code: true, name: true } } },
  });
}

export async function updateIntake(id: string, patch: DealIntakePatch) {
  const existing = await getIntake(id);
  if (!existing) throw new Error("Intake draft not found. Start again from Add Deal.");

  const sources = patch.sources
    ? JSON.stringify(patch.sources.filter(isDealFileSource))
    : undefined;

  let status = patch.status ?? existing.status;
  if (!patch.status && status !== "APPLIED" && status !== "FAILED") {
    if (existing.files.length === 0 && (patch.speName || existing.speName)) status = "AWAITING_FILES";
    if (existing.files.length > 0 || patch.currentStep === 4) status = "READY";
  }

  return prisma.dealIntake.update({
    where: { id },
    data: {
      currentStep: patch.currentStep ?? existing.currentStep,
      status,
      goal: patch.goal === undefined ? existing.goal : patch.goal,
      targetPeriod: patch.targetPeriod === undefined ? existing.targetPeriod : patch.targetPeriod,
      speName: patch.speName === undefined ? existing.speName : patch.speName,
      speCode: patch.speCode === undefined ? existing.speCode : patch.speCode,
      unitCount: patch.unitCount === undefined ? existing.unitCount : patch.unitCount,
      strategy: patch.strategy === undefined ? existing.strategy : patch.strategy,
      parentOpCoCode: patch.parentOpCoCode ?? existing.parentOpCoCode,
      sourcesJson: sources ?? existing.sourcesJson,
      loanName: patch.loanName === undefined ? existing.loanName : patch.loanName,
      loanLender: patch.loanLender === undefined ? existing.loanLender : patch.loanLender,
      loanUpbCents: patch.loanUpbCents === undefined ? existing.loanUpbCents : patch.loanUpbCents,
      loanRateBps: patch.loanRateBps === undefined ? existing.loanRateBps : patch.loanRateBps,
      loanPaymentCents: patch.loanPaymentCents === undefined ? existing.loanPaymentCents : patch.loanPaymentCents,
      loanOrigination: patch.loanOrigination === undefined ? existing.loanOrigination : patch.loanOrigination,
      loanMaturity: patch.loanMaturity === undefined ? existing.loanMaturity : patch.loanMaturity,
      dscrThresholdBps: patch.dscrThresholdBps === undefined ? existing.dscrThresholdBps : patch.dscrThresholdBps,
      debtYieldThresholdBps:
        patch.debtYieldThresholdBps === undefined ? existing.debtYieldThresholdBps : patch.debtYieldThresholdBps,
      lastError: patch.lastError === undefined ? existing.lastError : patch.lastError,
      entityId: patch.entityId === undefined ? existing.entityId : patch.entityId,
    },
    include: { files: { orderBy: { createdAt: "asc" } }, entity: { select: { code: true, name: true } } },
  });
}

export function parseSources(json: string): DealFileSource[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return ["upload"];
    return parsed.filter((row): row is DealFileSource => typeof row === "string" && isDealFileSource(row));
  } catch {
    return ["upload"];
  }
}

export function publicIntake(row: IntakeWithFiles) {
  return serialize({
    id: row.id,
    status: row.status,
    currentStep: row.currentStep,
    goal: row.goal,
    targetPeriod: row.targetPeriod,
    speName: row.speName,
    speCode: row.speCode,
    unitCount: row.unitCount,
    strategy: row.strategy,
    parentOpCoCode: row.parentOpCoCode,
    entityId: row.entityId,
    entityCode: row.entity?.code ?? null,
    entityName: row.entity?.name ?? null,
    sources: parseSources(row.sourcesJson),
    loanName: row.loanName,
    loanLender: row.loanLender,
    loanUpbCents: row.loanUpbCents,
    loanRateBps: row.loanRateBps,
    loanPaymentCents: row.loanPaymentCents,
    loanOrigination: row.loanOrigination,
    loanMaturity: row.loanMaturity,
    dscrThresholdBps: row.dscrThresholdBps,
    debtYieldThresholdBps: row.debtYieldThresholdBps,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    files: row.files.map((file) => ({
      id: file.id,
      source: file.source,
      classification: file.classification,
      filename: file.filename,
      mimeType: file.mimeType,
      byteSize: file.byteSize,
      vaultDocumentId: file.vaultDocumentId,
      remoteId: file.remoteId,
      status: file.status,
      lastError: file.lastError,
      createdAt: file.createdAt,
    })),
  });
}
