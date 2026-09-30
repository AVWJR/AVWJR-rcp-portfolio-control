/**
 * Status changes for the Deal Library.
 * Inclusion rules live in owned-spe.ts so the archive module can use them
 * without a circular import.
 *
 * Existing production rows: dealStatus defaults to OWNED on db push.
 * effectiveDealStatus() maps lifecycle ARCHIVED → Archived, and a missing
 * value on a LIVE SPE → Owned. No data migration.
 */

import { isPermanentDemoSpe, permanentDemoDeleteMessage } from "@/lib/archive";
import { prisma } from "@/lib/prisma";
import { postStoredBrokerT12Journals } from "@/lib/t12-overlay";
import { effectiveDealStatus, isDealStatus, type DealStatusValue } from "@/lib/owned-spe";

export {
  DEAL_STATUSES,
  DEAL_STATUS_LABEL,
  effectiveDealStatus,
  isDealStatus,
  isOwnedSpe,
  ownedSpeWhere,
} from "@/lib/owned-spe";
export type { DealStatusValue } from "@/lib/owned-spe";

export class DealStatusError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "DealStatusError";
    this.status = status;
  }
}

export function ownedExitCopy(code: string, name: string): string {
  return (
    `Moving ${name} (${code}) out of Owned takes it out of the OpCo roll-up, month-end close, and the distribution ledger. ` +
    `The books and files stay. Only Owned deals are in today's numbers. ` +
    `Nothing is deleted.`
  );
}

export function ownedEntryCopy(code: string, name: string): string {
  return (
    `Marking ${name} (${code}) Owned puts it into the real OpCo books, month-end close, and the distribution ledger. ` +
    `The saved broker T12 will be posted into the books. ` +
    `Confirm that RCP has closed on this deal.`
  );
}

export function permanentDemoStatusMessage(code: string): string {
  return (
    `${permanentDemoDeleteMessage(code)} ` +
    `Tagging it Test is left for the Phase 4 purge tool, because Test would take it out of the roll-up.`
  );
}

export function booksLockStatusMessage(code: string): string {
  return (
    `${code} has a posted distribution or a closed month. It can leave Owned only through the existing Archive ` +
    `(Delete on the Deals list, then type the SPE code). That keeps the ledger. This screen will not remove it.`
  );
}

async function hasBooksLock(entityId: string): Promise<boolean> {
  const [distributions, closedPeriods] = await Promise.all([
    prisma.distributionEvent.count({ where: { entityId } }),
    prisma.period.count({ where: { entityId, status: { in: ["CLOSED", "SOFT_CLOSED"] } } }),
  ]);
  return distributions > 0 || closedPeriods > 0;
}

export async function changeDealStatus(opts: {
  code: string;
  toStatus: string;
  reason?: string;
  confirmRollup?: boolean;
  confirmOwned?: boolean;
  actor?: string;
}): Promise<{
  code: string;
  name: string;
  fromStatus: DealStatusValue;
  toStatus: DealStatusValue;
  postedT12Lines: number;
}> {
  const code = opts.code.trim().toUpperCase();
  if (!isDealStatus(opts.toStatus)) {
    throw new DealStatusError("Choose Pipeline, Screened, Owned, or Test.");
  }
  const toStatus = opts.toStatus;
  if (toStatus === "ARCHIVED") {
    throw new DealStatusError(
      "Archived is the existing Deal Archive. Use Delete on the Deals list and type the SPE code. This screen does not archive or delete.",
    );
  }
  const reason = opts.reason?.trim() ?? "";
  if (!reason) {
    throw new DealStatusError("Say why you are changing the status.");
  }

  const entity = await prisma.entity.findUnique({ where: { code } });
  if (!entity || entity.type !== "SPE") {
    throw new DealStatusError(`No property SPE found for ${code}.`, 404);
  }
  if (entity.lifecycleStatus === "ARCHIVED") {
    throw new DealStatusError(
      `${code} is Archived. Restore it from Deal Archive if it should come back. Restoring does not delete anything.`,
    );
  }

  const fromStatus = effectiveDealStatus(entity);
  if (fromStatus === toStatus) {
    return { code: entity.code, name: entity.name, fromStatus, toStatus, postedT12Lines: 0 };
  }

  if (fromStatus === "OWNED" && isPermanentDemoSpe(entity.code)) {
    throw new DealStatusError(permanentDemoStatusMessage(entity.code));
  }

  if (fromStatus === "OWNED" && toStatus !== "OWNED") {
    if (!opts.confirmRollup) {
      throw new DealStatusError(ownedExitCopy(entity.code, entity.name));
    }
    if (await hasBooksLock(entity.id)) {
      throw new DealStatusError(booksLockStatusMessage(entity.code), 409);
    }
  }

  if (toStatus === "OWNED" && fromStatus !== "OWNED") {
    if (!opts.confirmOwned) {
      throw new DealStatusError(ownedEntryCopy(entity.code, entity.name));
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.entity.update({
      where: { id: entity.id },
      data: { dealStatus: toStatus },
    });
    await tx.dealStatusEvent.create({
      data: {
        entityId: entity.id,
        fromStatus,
        toStatus,
        reason,
        actor: opts.actor ?? "principal",
      },
    });
  });

  let postedT12Lines = 0;
  if (toStatus === "OWNED" && fromStatus !== "OWNED") {
    postedT12Lines = await postStoredBrokerT12Journals(entity.id);
  }
  return { code: entity.code, name: entity.name, fromStatus, toStatus, postedT12Lines };
}
