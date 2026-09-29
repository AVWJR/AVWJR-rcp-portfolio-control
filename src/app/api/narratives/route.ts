import { enforce } from "@/lib/auth/actor";
import { resolveReportingPeriod } from "@/lib/period-default";
import { loadPeriodSnapshot } from "@/lib/period-snapshot";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { buildAllNarratives, buildNarrative, isAudienceId } from "@rcp/reporting";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("entity") ?? "SPE-WBG";
  const period = await resolveReportingPeriod(code, url.searchParams.get("period"));
  const audience = url.searchParams.get("audience");
  const [year, month] = period.split("-").map(Number);
  const entity = await prisma.entity.findUnique({ where: { code } });
  if (!entity) return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  if (entity.type === "HOLDCO") {
    return NextResponse.json({ error: "HoldCo has no operating narrative" }, { status: 400 });
  }
  const denied = await enforce("read", entity.id);
  if (denied) return denied;
  const snap = await loadPeriodSnapshot({
    entityId: entity.id,
    entityType: entity.type,
    year,
    month,
  });
  const data = audience && isAudienceId(audience) ? buildNarrative(snap, audience) : buildAllNarratives(snap);
  return NextResponse.json(serialize({ entity: { code: entity.code, type: entity.type }, period, data }));
}
