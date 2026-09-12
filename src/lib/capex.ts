import { cipSpendLines, placeInServiceLines } from "@rcp/debt";
import type { CapexClassification, CapexProjectStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { postJournal } from "./post-journal";

export async function loadCapexProjects(entityIds?: string[]) {
  return prisma.capexProject.findMany({
    where: entityIds ? { entityId: { in: entityIds } } : undefined,
    include: { entity: true, costs: { orderBy: { date: "asc" } } },
    orderBy: [{ entityId: "asc" }, { name: "asc" }],
  });
}

export async function recordCipSpend(opts: {
  projectId: string;
  entityId: string;
  periodId: string;
  date: Date;
  amountCents: bigint;
  cashCents: bigint;
  apCents: bigint;
  memo: string;
}) {
  const project = await prisma.capexProject.findUnique({ where: { id: opts.projectId } });
  if (!project) throw new Error("Capex project not found");
  if (project.classification !== "CAPEX") {
    throw new Error("R&M projects are not capitalized to CIP");
  }
  const lines = cipSpendLines({
    amountCents: opts.amountCents,
    cashCents: opts.cashCents,
    apCents: opts.apCents,
  });
  const journal = await postJournal({
    entityId: opts.entityId,
    periodId: opts.periodId,
    date: opts.date,
    memo: opts.memo,
    source: "capex-cip",
    lines,
  });
  const spentCents = project.spentCents + opts.amountCents;
  const cipCents = project.cipCents + opts.amountCents;
  await prisma.capexProject.update({
    where: { id: project.id },
    data: {
      spentCents,
      cipCents,
      status: "CIP" satisfies CapexProjectStatus,
    },
  });
  await prisma.capexCost.create({
    data: {
      projectId: project.id,
      date: opts.date,
      amountCents: opts.amountCents,
      kind: "CIP_SPEND",
      accountCode: "1460",
      memo: opts.memo,
      journalId: journal.id,
    },
  });
  return journal;
}

export async function placeProjectInService(opts: {
  projectId: string;
  entityId: string;
  periodId: string;
  date: Date;
  amountCents: bigint;
  memo: string;
}) {
  const project = await prisma.capexProject.findUnique({ where: { id: opts.projectId } });
  if (!project) throw new Error("Capex project not found");
  if (opts.amountCents > project.cipCents) {
    throw new Error("Cannot place more in service than remains in CIP");
  }
  const lines = placeInServiceLines({
    amountCents: opts.amountCents,
    fixedAssetAccountCode: project.fixedAssetAccountCode,
  });
  const journal = await postJournal({
    entityId: opts.entityId,
    periodId: opts.periodId,
    date: opts.date,
    memo: opts.memo,
    source: "capex-pis",
    lines,
  });
  const cipCents = project.cipCents - opts.amountCents;
  const placedInServiceCents = project.placedInServiceCents + opts.amountCents;
  const status: CapexProjectStatus = cipCents === 0n ? "PLACED_IN_SERVICE" : "CIP";
  await prisma.capexProject.update({
    where: { id: project.id },
    data: {
      cipCents,
      placedInServiceCents,
      placedInServiceAt: status === "PLACED_IN_SERVICE" ? opts.date : project.placedInServiceAt,
      status,
    },
  });
  await prisma.capexCost.create({
    data: {
      projectId: project.id,
      date: opts.date,
      amountCents: opts.amountCents,
      kind: "PLACE_IN_SERVICE",
      accountCode: project.fixedAssetAccountCode,
      memo: opts.memo,
      journalId: journal.id,
    },
  });
  return journal;
}

export function classificationLabel(value: CapexClassification): string {
  return value === "REPAIRS_MAINTENANCE" ? "R&M (in NOI)" : "CapEx";
}
