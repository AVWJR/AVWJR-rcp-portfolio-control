import { AuthzError } from "@/lib/auth/actor";
import type { AppRole } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";

export class SegregationOfDutiesError extends AuthzError {
  constructor(message: string) {
    super(message, 403);
    this.name = "SegregationOfDutiesError";
  }
}

const SELF_APPROVE =
  "A different person must review this close. The owner may self-approve only by entering a reason.";

export async function signPeriodPackage(opts: {
  periodId: string;
  userId: string;
  role: AppRole;
  kind: "prepare" | "review";
  ownerSelfApproveReason?: string | null;
}) {
  const period = await prisma.period.findUnique({
    where: { id: opts.periodId },
    include: { checklist: true },
  });
  if (!period) throw new Error("Period not found");
  const now = new Date();
  if (opts.kind === "prepare") {
    await prisma.period.update({
      where: { id: period.id },
      data: { preparedByUserId: opts.userId, preparedAt: now },
    });
    await prisma.closeChecklistItem.updateMany({
      where: { periodId: period.id },
      data: { preparedByUserId: opts.userId, preparedAt: now },
    });
    return;
  }

  const reason = opts.ownerSelfApproveReason?.trim() ?? "";
  if (!period.preparedByUserId) {
    throw new SegregationOfDutiesError("Someone must sign as preparer before a reviewer can sign off.");
  }
  const self = period.preparedByUserId === opts.userId;
  if (self && (opts.role !== "OWNER" || !reason)) {
    throw new SegregationOfDutiesError(SELF_APPROVE);
  }
  for (const item of period.checklist) {
    if (!item.preparedByUserId) {
      throw new SegregationOfDutiesError(`"${item.label}" has no preparer yet.`);
    }
    if (item.preparedByUserId === opts.userId && (opts.role !== "OWNER" || !reason)) {
      throw new SegregationOfDutiesError(SELF_APPROVE);
    }
  }
  await prisma.period.update({
    where: { id: period.id },
    data: {
      reviewedByUserId: opts.userId,
      reviewedAt: now,
      ownerSelfApproveReason: self ? reason : null,
    },
  });
  await prisma.closeChecklistItem.updateMany({
    where: { periodId: period.id },
    data: {
      reviewedByUserId: opts.userId,
      reviewedAt: now,
      ownerSelfApproveReason: self ? reason : null,
    },
  });
}

export async function assertHardLockSegregation(periodId: string) {
  const period = await prisma.period.findUnique({
    where: { id: periodId },
    include: { checklist: { orderBy: { sortOrder: "asc" } } },
  });
  if (!period) throw new Error("Period not found");
  if (!period.preparedByUserId || !period.reviewedByUserId) {
    throw new SegregationOfDutiesError(
      "Hard lock needs a preparer sign-off and a reviewer sign-off from a different person.",
    );
  }
  if (period.preparedByUserId === period.reviewedByUserId && !period.ownerSelfApproveReason?.trim()) {
    throw new SegregationOfDutiesError(
      "Hard lock needs a reviewer who is not the preparer. The owner may self-approve only with a logged reason.",
    );
  }
  for (const item of period.checklist) {
    if (!item.preparedByUserId || !item.reviewedByUserId) {
      throw new SegregationOfDutiesError(`"${item.label}" needs both a preparer and a reviewer before hard lock.`);
    }
    if (item.preparedByUserId === item.reviewedByUserId && !item.ownerSelfApproveReason?.trim()) {
      throw new SegregationOfDutiesError(
        `"${item.label}" needs a reviewer who is not the preparer. The owner may self-approve only with a logged reason.`,
      );
    }
  }
}
