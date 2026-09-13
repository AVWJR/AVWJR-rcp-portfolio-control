import { loadPeriodSnapshot } from "@/lib/period-snapshot";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { buildAllNarratives, buildNarrative, isAudienceId } from "@rcp/reporting";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("entity") ?? "SPE-WBG";
  const period = url.searchParams.get("period") ?? "2026-08";
  const audience = url.searchParams.get("audience");
  const [year, month] = period.split("-").map(Number);
  const entity = await prisma.entity.findUnique({ where: { code } });
  if (!entity) return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  if (entity.type === "HOLDCO") {
    return NextResponse.json({ error: "HoldCo has no operating narrative" }, { status: 400 });
  }
  const snap = await loadPeriodSnapshot({
    entityId: entity.id,
    entityType: entity.type,
    year,
    month,
  });
  const data = audience && isAudienceId(audience) ? buildNarrative(snap, audience) : buildAllNarratives(snap);
  return NextResponse.json(serialize({ entity: { code: entity.code, type: entity.type }, period, data }));
}
