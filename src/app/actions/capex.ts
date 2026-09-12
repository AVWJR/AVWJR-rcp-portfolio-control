"use server";

import { placeProjectInService } from "@/lib/capex";
import { dollars } from "@rcp/ledger";
import { revalidatePath } from "next/cache";

export async function placeInServiceAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  const periodId = String(formData.get("periodId") ?? "");
  const amount = Number(formData.get("amount") ?? "0");
  await placeProjectInService({
    projectId,
    entityId,
    periodId,
    date: new Date(),
    amountCents: dollars(Math.round(amount)),
    memo: `Place in service — ${String(formData.get("name") ?? "capex")}`,
  });
  revalidatePath("/capex");
  revalidatePath("/reports/balance-sheet");
}
