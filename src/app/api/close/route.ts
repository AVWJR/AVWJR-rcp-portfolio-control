import { canSeeEntity, enforce, resolveActor } from "@/lib/auth/actor";
import { periodStatusLabel } from "@/lib/period-close";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { NextResponse } from "next/server";

export async function GET() {
  const denied = await enforce("read");
  if (denied) return denied;
  const actor = await resolveActor();
  const periods = (await prisma.period.findMany({
    include: { entity: true, checklist: true },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  })).filter((period) => canSeeEntity(actor, period.entityId));
  return NextResponse.json(
    serialize({
      periods: periods.map((p) => ({
        entity: p.entity.code,
        label: p.label,
        status: p.status,
        statusLabel: periodStatusLabel(p.status),
        checklistDone: p.checklist.filter((i) => i.status === "DONE" || i.status === "NA").length,
        checklistTotal: p.checklist.length,
      })),
    }),
  );
}
