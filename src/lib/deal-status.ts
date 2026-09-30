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
import { BROKER_T12_SOURCE, postStoredBrokerT12Journals } from "@/lib/t12-overlay";
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

export const DEAL_STATUS_CHOICES = "Choose Pipeline, Screened, Owned, or Test.";
export const DEAL_STATUS_NOT_ARCHIVED =
  "Archived is the existing Deal Archive. Use Delete on the Deals list and type the SPE code. This screen does not archive or delete.";
export const DEAL_STATUS_REASON = "Say why you are changing the status.";
export const BROKER_T12_WILL_POST = "The saved broker T12 will be posted into the books.";

export function dealStatusArchivedMessage(code: string): string {
  return `${code} is Archived. Restore it from Deal Archive if it should come back. Restoring does not delete anything.`;
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
    `${BROKER_T12_WILL_POST} ` +
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

function periodStateLabel(status: string): string {
  if (status === "SOFT_CLOSED") return "soft-closed";
  if (status === "CLOSED") return "closed";
  return status.toLowerCase();
}

/**
 * Moving to Owned posts the saved broker T12 into its target month.
 * That month has to be open, or the status change is refused and nothing is written.
 */
async function assertBrokerT12PeriodOpen(entityId: string, code: string): Promise<void> {
  const stored = await prisma.budgetLine.findFirst({
    where: { entityId, source: BROKER_T12_SOURCE },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { year: true, month: true },
  });
  if (!stored) return;
  const period = await prisma.period.findUnique({
    where: { entityId_year_month: { entityId, year: stored.year, month: stored.month } },
    select: { status: true },
  });
  if (!period || period.status === "OPEN") return;
  const label = `${stored.year}-${String(stored.month).padStart(2, "0")}`;
  throw new DealStatusError(
    `${code} has a saved broker T12 for ${label}, and that month is ${periodStateLabel(period.status)}. ` +
      `Marking the deal Owned would post that T12 into the books, and only an open month can take it. ` +
      `The status was not changed.`,
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
    throw new DealStatusError(DEAL_STATUS_CHOICES);
  }
  const toStatus = opts.toStatus;
  if (toStatus === "ARCHIVED") {
    throw new DealStatusError(
      DEAL_STATUS_NOT_ARCHIVED,
    );
  }
  const reason = opts.reason?.trim() ?? "";
  if (!reason) {
    throw new DealStatusError(DEAL_STATUS_REASON);
  }

  const entity = await prisma.entity.findUnique({ where: { code } });
  if (!entity || entity.type !== "SPE") {
    throw new DealStatusError(`No property SPE found for ${code}.`, 404);
  }
  if (entity.lifecycleStatus === "ARCHIVED") {
    throw new DealStatusError(
      dealStatusArchivedMessage(code),
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
    await assertBrokerT12PeriodOpen(entity.id, entity.code);
  }

  const movingToOwned = toStatus === "OWNED" && fromStatus !== "OWNED";
  let postedT12Lines = 0;
  try {
    postedT12Lines = await prisma.$transaction(async (tx) => {
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
      if (!movingToOwned) return 0;
      return postStoredBrokerT12Journals(entity.id, tx);
    });
  } catch (error) {
    if (error instanceof DealStatusError) throw error;
    if (movingToOwned) {
      const label = await brokerT12PeriodLabel(entity.id);
      throw new DealStatusError(
        `${entity.code} could not be marked Owned because its broker T12 for ${label} failed to post. The status was not changed.`,
      );
    }
    throw error;
  }
  return { code: entity.code, name: entity.name, fromStatus, toStatus, postedT12Lines };
}

async function brokerT12PeriodLabel(entityId: string): Promise<string> {
  const stored = await prisma.budgetLine.findFirst({
    where: { entityId, source: BROKER_T12_SOURCE },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { year: true, month: true },
  });
  if (!stored) return "the saved month";
  return `${stored.year}-${String(stored.month).padStart(2, "0")}`;
}
