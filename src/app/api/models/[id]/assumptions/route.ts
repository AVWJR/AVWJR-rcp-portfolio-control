import { dealErrorResponse, rateLimitDeals } from "@/lib/deals/http";
import { updateModelAssumptions } from "@/lib/models/store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    await updateModelAssumptions(id, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return dealErrorResponse(error);
  }
}
