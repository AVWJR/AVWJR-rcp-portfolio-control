import { buildDashboardForEntity } from "@/lib/dashboards";
import { resolveReportingPeriod } from "@/lib/period-default";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("entity") ?? "RCP-OPCO";
  const period = await resolveReportingPeriod(code, url.searchParams.get("period"));
  const [year, month] = period.split("-").map(Number);
  const entity = await prisma.entity.findUnique({ where: { code } });
  if (!entity) return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  if (entity.type === "HOLDCO") {
    return NextResponse.json({ error: "HoldCo has no operating dashboard" }, { status: 400 });
  }
  const dash = await buildDashboardForEntity({
    entityId: entity.id,
    entityType: entity.type,
    year,
    month,
  });
  return NextResponse.json(serialize({ entity: { code: entity.code, type: entity.type }, period, data: dash }));
}
