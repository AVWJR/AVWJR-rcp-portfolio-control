import { periodStatusLabel } from "@/lib/period-close";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { NextResponse } from "next/server";

export async function GET() {
  const periods = await prisma.period.findMany({
    include: { entity: true, checklist: true },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });
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
