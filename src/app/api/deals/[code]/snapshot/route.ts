import { dealErrorResponse, rateLimitDeals } from "@/lib/deals/http";
import { captureDealSnapshot } from "@/lib/library/snapshot";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  try {
    const { code } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { period?: string };
    const entity = await prisma.entity.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!entity || entity.type !== "SPE") {
      return NextResponse.json({ error: `No property SPE found for ${code}.` }, { status: 404 });
    }
    const match = /^(\d{4})-(\d{2})$/.exec(body.period ?? "2026-08");
    const year = match ? Number(match[1]) : 2026;
    const month = match ? Number(match[2]) : 8;
    const snapshot = await captureDealSnapshot({ entityId: entity.id, year, month });
    return NextResponse.json({
      id: snapshot.id,
      periodLabel: snapshot.periodLabel,
      basisLabel: snapshot.basisLabel,
    });
  } catch (error) {
    return dealErrorResponse(error);
  }
}
