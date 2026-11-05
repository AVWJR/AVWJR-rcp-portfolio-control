"use server";

import { assertCan } from "@/lib/auth/actor";
import {
  hardLockPeriod,
  reopenPeriod,
  setChecklistItem,
  softClosePeriod,
} from "@/lib/period-close";
import { signPeriodPackage } from "@/lib/close/sign-off";
import type { ChecklistItemStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

function refresh() {
  revalidatePath("/close");
  revalidatePath("/");
}

export async function softCloseAction(formData: FormData) {
  await assertCan("close.soft");
  await softClosePeriod(String(formData.get("periodId") ?? ""));
  refresh();
}

export async function hardLockAction(formData: FormData) {
  await assertCan("close.hard");
  await hardLockPeriod(String(formData.get("periodId") ?? ""));
  refresh();
}

export async function reopenAction(formData: FormData) {
  await assertCan("close.reopen");
  const periodId = String(formData.get("periodId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const ticket = String(formData.get("ticket") ?? "");
  await reopenPeriod({ periodId, reason, ticket });
  refresh();
}

export async function checklistAction(formData: FormData) {
  await assertCan("close.sign_prepare");
  const periodId = String(formData.get("periodId") ?? "");
  const code = String(formData.get("code") ?? "");
  const status = String(formData.get("status") ?? "PENDING") as ChecklistItemStatus;
  await setChecklistItem({ periodId, code, status });
  refresh();
}

export async function signCloseAction(formData: FormData) {
  const actor = await assertCan(
    String(formData.get("kind") ?? "") === "review" ? "close.sign_review" : "close.sign_prepare",
  );
  if (!actor.userId || !actor.role) return;
  await signPeriodPackage({
    periodId: String(formData.get("periodId") ?? ""),
    userId: actor.userId,
    role: actor.role,
    kind: String(formData.get("kind") ?? "") === "review" ? "review" : "prepare",
    ownerSelfApproveReason: String(formData.get("reason") ?? ""),
  });
  refresh();
}
