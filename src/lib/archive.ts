import { prisma } from "@/lib/prisma";

export const ARCHIVE_ACTOR_PRINCIPAL = "principal";

/** Seeded property SPEs that stay on the live Deals list. */
export const PERMANENT_DEMO_SPE_CODES = ["SPE-WBG", "SPE-CVC", "SPE-HCR"] as const;

export class ArchiveValidationError extends Error {
  readonly field?: string;
  readonly status: number;
  constructor(message: string, field?: string, status = 400) {
    super(message);
    this.name = "ArchiveValidationError";
    this.field = field;
    this.status = status;
  }
}

export type SpeArchiveRow = {
  id: string;
  code: string;
  name: string;
  type: "SPE";
  parentCode: string | null;
  unitCount: number | null;
  strategy: string | null;
  lifecycleStatus: "LIVE" | "ARCHIVED";
  archivedAt: Date | null;
  archivedBy: string | null;
  restoredAt: Date | null;
  restoredBy: string | null;
};

export function isPermanentDemoSpe(code: string): boolean {
  return (PERMANENT_DEMO_SPE_CODES as readonly string[]).includes(code.trim().toUpperCase());
}

export function permanentDemoDeleteMessage(code: string): string {
  const spe = code.trim().toUpperCase();
  return `${spe} is a permanent demo SPE. It cannot be deleted. It stays on the live Deals list and in the OpCo roll-up.`;
}

export function isArchivedSpe(entity: { type: string; lifecycleStatus?: string | null }): boolean {
  return entity.type === "SPE" && entity.lifecycleStatus === "ARCHIVED";
}

export function isLiveSpe(entity: { type: string; lifecycleStatus?: string | null }): boolean {
  return entity.type === "SPE" && entity.lifecycleStatus !== "ARCHIVED";
}

export function liveSpeWhere() {
  return { type: "SPE" as const, lifecycleStatus: "LIVE" as const };
}

export function liveSpeChildren<T extends { type: string; lifecycleStatus?: string | null }>(children: T[]): T[] {
  return children.filter((child) => child.type !== "SPE" || child.lifecycleStatus !== "ARCHIVED");
}

export function confirmCodesMatch(provided: string, expected: string): boolean {
  return provided.trim().toUpperCase() === expected.trim().toUpperCase();
}

export function deleteImpactCopy(opts: { code: string; name: string }): string {
  return (
    `Deleting ${opts.name} (${opts.code}) takes it off the live Deals list and out of the OpCo combined roll-up. ` +
    `It stays studyable under gold nav Deal Archive. Books, ledgers, and vault documents remain. ` +
    `This is not a hard wipe. Restore later only from Deal Archive — not from Deals.`
  );
}

/** @deprecated Use deleteImpactCopy — live UI says Delete; storage is still soft-archive. */
export const archiveImpactCopy = deleteImpactCopy;

export function restoreImpactCopy(opts: { code: string; name: string }): string {
  return (
    `Restoring ${opts.name} (${opts.code}) puts it back on the live Deals list and back into the OpCo combined roll-up. ` +
    `Books and vault were never deleted. Type the SPE code to confirm.`
  );
}

function toRow(entity: {
  id: string;
  code: string;
  name: string;
  type: string;
  unitCount: number | null;
  strategy: string | null;
  lifecycleStatus: string;
  archivedAt: Date | null;
  archivedBy: string | null;
  restoredAt: Date | null;
  restoredBy: string | null;
  parent: { code: string } | null;
}): SpeArchiveRow {
  return {
    id: entity.id,
    code: entity.code,
    name: entity.name,
    type: "SPE",
    parentCode: entity.parent?.code ?? null,
    unitCount: entity.unitCount,
    strategy: entity.strategy,
    lifecycleStatus: entity.lifecycleStatus === "ARCHIVED" ? "ARCHIVED" : "LIVE",
    archivedAt: entity.archivedAt,
    archivedBy: entity.archivedBy,
    restoredAt: entity.restoredAt,
    restoredBy: entity.restoredBy,
  };
}

async function loadSpe(code: string) {
  const entity = await prisma.entity.findUnique({
    where: { code: code.trim().toUpperCase() },
    include: { parent: true },
  });
  if (!entity) {
    throw new ArchiveValidationError(`No SPE found for code ${code.trim().toUpperCase()}.`, "code", 404);
  }
  if (entity.type !== "SPE") {
    throw new ArchiveValidationError(
      `${entity.code} is a ${entity.type}, not a property SPE. Only SPEs can be deleted or restored.`,
      "code",
    );
  }
  return entity;
}

function assertConfirmCode(confirmCode: string | undefined, expected: string) {
  if (!confirmCode?.trim()) {
    throw new ArchiveValidationError("Type the SPE code to confirm.", "confirmCode");
  }
  if (!confirmCodesMatch(confirmCode, expected)) {
    throw new ArchiveValidationError(
      `Confirmation must match the SPE code ${expected} exactly (letters and numbers).`,
      "confirmCode",
    );
  }
}

export async function archiveSpe(opts: {
  code: string;
  confirmCode?: string;
  actor?: string;
}): Promise<SpeArchiveRow> {
  const entity = await loadSpe(opts.code);
  if (isPermanentDemoSpe(entity.code)) {
    throw new ArchiveValidationError(permanentDemoDeleteMessage(entity.code), "code");
  }
  assertConfirmCode(opts.confirmCode, entity.code);
  if (entity.lifecycleStatus === "ARCHIVED") {
    throw new ArchiveValidationError(`${entity.code} is already in Deal Archive.`, "code");
  }
  const updated = await prisma.entity.update({
    where: { id: entity.id },
    data: {
      lifecycleStatus: "ARCHIVED",
      archivedAt: new Date(),
      archivedBy: opts.actor ?? ARCHIVE_ACTOR_PRINCIPAL,
    },
    include: { parent: true },
  });
  return toRow(updated);
}

export async function restoreSpe(opts: {
  code: string;
  confirmCode?: string;
  actor?: string;
}): Promise<SpeArchiveRow> {
  const entity = await loadSpe(opts.code);
  assertConfirmCode(opts.confirmCode, entity.code);
  if (entity.lifecycleStatus !== "ARCHIVED") {
    throw new ArchiveValidationError(`${entity.code} is already a live deal. Restore is only for archived SPEs.`, "code");
  }
  const updated = await prisma.entity.update({
    where: { id: entity.id },
    data: {
      lifecycleStatus: "LIVE",
      restoredAt: new Date(),
      restoredBy: opts.actor ?? ARCHIVE_ACTOR_PRINCIPAL,
    },
    include: { parent: true },
  });
  return toRow(updated);
}

export async function listArchivedSpes(): Promise<SpeArchiveRow[]> {
  const rows = await prisma.entity.findMany({
    where: { type: "SPE", lifecycleStatus: "ARCHIVED" },
    include: { parent: true },
    orderBy: [{ archivedAt: "desc" }, { code: "asc" }],
  });
  return rows.map(toRow);
}

export async function getSpeArchiveState(code: string): Promise<SpeArchiveRow | null> {
  const entity = await prisma.entity.findUnique({
    where: { code: code.trim().toUpperCase() },
    include: { parent: true },
  });
  if (!entity || entity.type !== "SPE") return null;
  return toRow(entity);
}
