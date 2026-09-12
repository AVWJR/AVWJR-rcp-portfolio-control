import type { EntityType, SpeStrategy } from "@prisma/client";
import { MASTER_COA } from "@rcp/ledger";
import { prisma } from "./prisma";

export async function seedMasterCoaTemplate() {
  const existing = await prisma.account.count({ where: { isTemplate: true, entityId: null } });
  if (existing > 0) return existing;

  await prisma.account.createMany({
    data: MASTER_COA.map((row) => ({
      entityId: null,
      isTemplate: true,
      code: row.code,
      name: row.name,
      type: row.type,
      normalBalance: row.normalBalance,
      isContra: row.isContra,
      isBelowNoi: row.isBelowNoi,
      isCash: row.isCash,
      reportGroup: row.reportGroup,
      sortOrder: row.sortOrder,
      cashFlowClass: row.cashFlowClass,
    })),
  });
  return MASTER_COA.length;
}

export async function cloneCoaToEntity(entityId: string) {
  const template = await prisma.account.findMany({
    where: { isTemplate: true },
    orderBy: { sortOrder: "asc" },
  });
  if (template.length === 0) {
    throw new Error("Master CoA template is empty — run seed first");
  }

  const already = await prisma.account.count({ where: { entityId } });
  if (already > 0) return already;

  await prisma.account.createMany({
    data: template.map((row) => ({
      entityId,
      isTemplate: false,
      code: row.code,
      name: row.name,
      type: row.type,
      normalBalance: row.normalBalance,
      isContra: row.isContra,
      isBelowNoi: row.isBelowNoi,
      isCash: row.isCash,
      reportGroup: row.reportGroup,
      sortOrder: row.sortOrder,
      cashFlowClass: row.cashFlowClass,
    })),
  });
  return template.length;
}

export async function createEntityWithCoa(input: {
  code: string;
  name: string;
  type: EntityType;
  parentId?: string;
  ownershipBps?: number;
  unitCount?: number;
  strategy?: SpeStrategy;
}) {
  const entity = await prisma.entity.create({
    data: {
      code: input.code,
      name: input.name,
      type: input.type,
      parentId: input.parentId,
      ownershipBps: input.ownershipBps ?? 10_000,
      unitCount: input.unitCount,
      strategy: input.strategy,
      currency: "USD",
      locale: "en-US",
      timezone: "America/New_York",
    },
  });
  await cloneCoaToEntity(entity.id);
  return entity;
}
