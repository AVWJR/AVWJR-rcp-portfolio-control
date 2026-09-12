import type { ChecklistItemStatus, PeriodCloseAction, PeriodStatus } from "@prisma/client";
import {
  CLOSE_CHECKLIST,
  assertCanReopen,
  assertChecklistComplete,
  assertHardLock,
  assertReopenReason,
  assertSoftClose,
} from "@rcp/ledger";
import { prisma } from "./prisma";

export async function ensureChecklist(periodId: string) {
  const existing = await prisma.closeChecklistItem.findMany({ where: { periodId } });
  if (existing.length > 0) return existing;
  await prisma.closeChecklistItem.createMany({
    data: CLOSE_CHECKLIST.map((item) => ({
      periodId,
      code: item.code,
      label: item.label,
      sortOrder: item.sortOrder,
      status: "PENDING",
    })),
  });
  return prisma.closeChecklistItem.findMany({
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
    },
  });
}

export async function softClosePeriod(periodId: string) {
  const period = await prisma.period.findUnique({ where: { id: periodId } });
  if (!period) throw new Error("Period not found");
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
  const period = await prisma.period.findUnique({
    where: { id: periodId },
    include: { checklist: true },
  });
  if (!period) throw new Error("Period not found");
  assertHardLock(period.status);
  await ensureChecklist(periodId);
  const items = await prisma.closeChecklistItem.findMany({ where: { periodId } });
  assertChecklistComplete(items);
  const updated = await prisma.period.update({
    where: { id: periodId },
    data: { status: "CLOSED", lockedAt: new Date() },
  });
  await recordEvent({ periodId, action: "HARD_LOCK" });
  return updated;
}

export async function reopenPeriod(opts: { periodId: string; reason: string; ticket: string }) {
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
