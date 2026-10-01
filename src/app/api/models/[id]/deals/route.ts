import { dealErrorResponse, rateLimitDeals } from "@/lib/deals/http";
import { addModelDeal, removeModelDeal } from "@/lib/models/store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { code?: string };
    const row = await addModelDeal(id, body.code ?? "");
    return NextResponse.json(row);
  } catch (error) {
    return dealErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { code?: string };
    await removeModelDeal(id, body.code ?? "");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return dealErrorResponse(error);
  }
}
