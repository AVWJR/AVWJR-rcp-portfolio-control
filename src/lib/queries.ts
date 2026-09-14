import type { PostedLine } from "@rcp/ledger";
import { isArchivedSpe, liveSpeChildren } from "./archive";
import { prisma } from "./prisma";

export async function listEntities(opts?: { includeArchived?: boolean }) {
  const rows = await prisma.entity.findMany({
    orderBy: [{ type: "asc" }, { code: "asc" }],
    include: { parent: true, children: true },
  });
  if (opts?.includeArchived) return rows;
  return rows
    .filter((entity) => !isArchivedSpe(entity))
    .map((entity) => ({
      ...entity,
      children: liveSpeChildren(entity.children),
    }));
}

export async function getEntityByCode(code: string) {
  return prisma.entity.findUnique({
    where: { code },
    include: { parent: true, children: true },
  });
}

export async function listPeriods(entityId: string) {
  return prisma.period.findMany({
    where: { entityId },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });
}

function toPosted(lines: { debit: bigint; credit: bigint; account: { code: string } }[]): PostedLine[] {
  return lines.map((l) => ({
    accountCode: l.account.code,
    debit: l.debit,
    credit: l.credit,
  }));
}

export async function loadPostedLines(opts: {
  entityIds: string[];
  through?: Date;
  from?: Date;
  to?: Date;
}): Promise<PostedLine[]> {
  const lines = await prisma.journalLine.findMany({
    where: {
      journal: {
        status: "POSTED",
        entityId: { in: opts.entityIds },
        ...(opts.through
          ? { date: { lte: opts.through } }
          : opts.from || opts.to
            ? {
                date: {
                  ...(opts.from ? { gte: opts.from } : {}),
                  ...(opts.to ? { lte: opts.to } : {}),
                },
              }
            : {}),
      },
    },
    include: { account: true },
  });
  return toPosted(lines);
}

export async function consolidationEntityIds(entityId: string): Promise<string[]> {
  const kids = await prisma.entity.findMany({
    where: { parentId: entityId },
    select: { id: true, type: true, lifecycleStatus: true },
  });
  const speIds = kids.filter((k) => k.type === "SPE" && k.lifecycleStatus !== "ARCHIVED").map((k) => k.id);
  return [entityId, ...speIds];
}
