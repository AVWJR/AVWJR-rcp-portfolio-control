"use server";

import {
  hardLockPeriod,
  reopenPeriod,
  setChecklistItem,
  softClosePeriod,
} from "@/lib/period-close";
import type { ChecklistItemStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

function refresh() {
  revalidatePath("/close");
  revalidatePath("/");
}

export async function softCloseAction(formData: FormData) {
  await softClosePeriod(String(formData.get("periodId") ?? ""));
  refresh();
}

export async function hardLockAction(formData: FormData) {
  await hardLockPeriod(String(formData.get("periodId") ?? ""));
  refresh();
}

export async function reopenAction(formData: FormData) {
  const periodId = String(formData.get("periodId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const ticket = String(formData.get("ticket") ?? "");
  await reopenPeriod({ periodId, reason, ticket });
  refresh();
}

export async function checklistAction(formData: FormData) {
  const periodId = String(formData.get("periodId") ?? "");
  const code = String(formData.get("code") ?? "");
  const status = String(formData.get("status") ?? "PENDING") as ChecklistItemStatus;
  await setChecklistItem({ periodId, code, status });
  refresh();
}
