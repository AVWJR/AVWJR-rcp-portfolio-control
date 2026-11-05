import type { ChecklistItemStatus, PeriodCloseAction, PeriodStatus } from "@prisma/client";
import {
  CLOSE_CHECKLIST,
  assertCanReopen,
  assertChecklistComplete,
  assertHardLock,
  assertReopenReason,
  assertSoftClose,
} from "@rcp/ledger";
import { actingUserId, assertCan, resolveActor } from "@/lib/auth/actor";
import type { Capability } from "@/lib/auth/roles";
import { assertHardLockSegregation } from "./close/sign-off";
import { assertNoOpenSuspense } from "./close/guards";
import { effectiveDealStatus, isOwnedSpe } from "./owned-spe";
import { prisma, type Db } from "./prisma";

async function guardClose(capability: Capability) {
  const actor = await resolveActor();
  if (actor.kind === "legacy-principal") return actor;
  return assertCan(capability);
}

const DEAL_STATUS_WORD: Record<string, string> = {
  PIPELINE: "Pipeline",
  SCREENED: "Screened",
  OWNED: "Owned",
  ARCHIVED: "Archived",
  TEST: "Test",
};

export function nonOwnedCloseMessage(code: string, status: string): string {
  const word = DEAL_STATUS_WORD[status] ?? status;
  return `${code} is ${word}, not Owned. Soft close and hard close are only for Owned deals. This month was not closed.`;
}

/** Reason shown on the Period Close entity picker. Null when the entity may close. */
export function closePickerNote(entity: {
  type: string;
  code: string;
  lifecycleStatus?: string | null;
  dealStatus?: string | null;
}): string | null {
  if (entity.type !== "SPE" || isOwnedSpe(entity)) return null;
  return nonOwnedCloseMessage(entity.code, effectiveDealStatus(entity));
}

export async function assertOwnedDealMayClose(entityId: string): Promise<void> {
  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    select: { type: true, code: true, lifecycleStatus: true, dealStatus: true },
  });
  if (!entity || entity.type !== "SPE" || isOwnedSpe(entity)) return;
  throw new Error(nonOwnedCloseMessage(entity.code, effectiveDealStatus(entity)));
}

function isUniqueClash(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && (error as { code: unknown }).code === "P2002") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /unique constraint failed/i.test(message);
}

export async function ensureChecklist(periodId: string, db: Db = prisma) {
  const existing = await db.closeChecklistItem.findMany({ where: { periodId } });
  if (existing.length > 0) return existing;
  try {
    await db.closeChecklistItem.createMany({
      data: CLOSE_CHECKLIST.map((item) => ({
        periodId,
        code: item.code,
        label: item.label,
        sortOrder: item.sortOrder,
        status: "PENDING" as const,
      })),
    });
  } catch (error) {
    // Two closes can create the same month's checklist at once. The unique
    // (period, code) row wins; the loser keeps the rows that landed.
    if (!isUniqueClash(error)) throw error;
  }
  return db.closeChecklistItem.findMany({
    where: { periodId },
    orderBy: { sortOrder: "asc" },
  });
}

export async function setChecklistItem(opts: {
  periodId: string;
  code: string;
  status: ChecklistItemStatus;
  notes?: string;
}) {
  await guardClose("close.sign_prepare");
  await ensureChecklist(opts.periodId);
  return prisma.closeChecklistItem.update({
    where: { periodId_code: { periodId: opts.periodId, code: opts.code } },
    data: {
      status: opts.status,
      notes: opts.notes,
      reviewedAt: opts.status === "PENDING" ? null : new Date(),
    },
  });
}

export async function completeChecklist(periodId: string, status: ChecklistItemStatus = "DONE") {
  await ensureChecklist(periodId);
  await prisma.closeChecklistItem.updateMany({
    where: { periodId },
    data: { status, reviewedAt: new Date() },
  });
}

async function recordEvent(opts: {
  periodId: string;
  action: PeriodCloseAction;
  reason?: string;
  ticket?: string;
}) {
  return prisma.periodCloseEvent.create({
    data: {
      periodId: opts.periodId,
      action: opts.action,
      reason: opts.reason,
      ticket: opts.ticket,
      actorUserId: await actingUserId(),
    },
  });
}

export async function softClosePeriod(periodId: string) {
  await guardClose("close.soft");
  const period = await prisma.period.findUnique({ where: { id: periodId } });
  if (!period) throw new Error("Period not found");
  await assertOwnedDealMayClose(period.entityId);
  assertSoftClose(period.status);
  await ensureChecklist(periodId);
  const updated = await prisma.period.update({
    where: { id: periodId },
    data: { status: "SOFT_CLOSED", softClosedAt: new Date() },
  });
  await recordEvent({ periodId, action: "SOFT_CLOSE" });
  return updated;
}

export async function hardLockPeriod(periodId: string) {
  const actor = await guardClose("close.hard");
  const period = await prisma.period.findUnique({
    where: { id: periodId },
    include: { checklist: true },
  });
  if (!period) throw new Error("Period not found");
  await assertOwnedDealMayClose(period.entityId);
  assertHardLock(period.status);
  await ensureChecklist(periodId);
  const items = await prisma.closeChecklistItem.findMany({ where: { periodId } });
  assertChecklistComplete(items);
  if (actor.userId) await assertHardLockSegregation(periodId);
  await assertNoOpenSuspense(period.entityId, period.endDate);
  const updated = await prisma.period.update({
    where: { id: periodId },
    data: { status: "CLOSED", lockedAt: new Date() },
  });
  await recordEvent({ periodId, action: "HARD_LOCK" });
  return updated;
}

export async function reopenPeriod(opts: { periodId: string; reason: string; ticket: string }) {
  await guardClose("close.reopen");
  assertReopenReason(opts.reason, opts.ticket);
  const period = await prisma.period.findUnique({ where: { id: opts.periodId } });
  if (!period) throw new Error("Period not found");
  assertCanReopen(period.status);
  const updated = await prisma.period.update({
    where: { id: opts.periodId },
    data: {
      status: "OPEN",
      reopenedAt: new Date(),
      reopenReason: opts.reason.trim(),
      reopenTicket: opts.ticket.trim(),
      lockedAt: null,
      softClosedAt: null,
    },
  });
  await recordEvent({
    periodId: opts.periodId,
    action: "REOPEN",
    reason: opts.reason.trim(),
    ticket: opts.ticket.trim(),
  });
  return updated;
}

export function periodStatusLabel(status: PeriodStatus): string {
  if (status === "SOFT_CLOSED") return "Soft closed";
  if (status === "CLOSED") return "Hard locked";
  return "Open";
}
