import { dealErrorResponse, rateLimitDeals } from "@/lib/deals/http";
import { serialize } from "@/lib/serialize";
import { loadSpeWaterfallByCode, saveSpeWaterfall, type WaterfallSaveInput } from "@/lib/waterfall";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  const { code } = await context.params;
  const record = await loadSpeWaterfallByCode(code.toUpperCase());
  if (!record) return NextResponse.json({ error: `Unknown SPE ${code}` }, { status: 404 });
  return NextResponse.json(serialize({ waterfall: record }));
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  try {
    const { code } = await context.params;
    const entity = await prisma.entity.findUnique({ where: { code: code.toUpperCase() } });
    if (!entity || entity.type !== "SPE") {
      return NextResponse.json({ error: `Unknown SPE ${code}` }, { status: 404 });
    }
    const body = (await request.json()) as Partial<WaterfallSaveInput>;
    const waterfall = await saveSpeWaterfall(entity.id, body);
    return NextResponse.json(serialize({ waterfall }));
  } catch (error) {
    return dealErrorResponse(error);
  }
}
