import { dealErrorResponse, rateLimitDeals } from "@/lib/deals/http";
import { updateDealLibrary } from "@/lib/library/profile";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  try {
    const { code } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    await updateDealLibrary(code, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return dealErrorResponse(error);
  }
}
