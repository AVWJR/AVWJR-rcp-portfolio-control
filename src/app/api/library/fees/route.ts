import { dealErrorResponse, rateLimitDeals } from "@/lib/deals/http";
import { updateOpcoGaBudget } from "@/lib/library/profile";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    await updateOpcoGaBudget(body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return dealErrorResponse(error);
  }
}
