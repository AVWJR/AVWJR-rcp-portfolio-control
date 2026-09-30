import { dealErrorResponse, rateLimitDeals } from "@/lib/deals/http";
import { backfillDealSnapshots } from "@/lib/library/snapshot";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  try {
    const body = (await request.json().catch(() => ({}))) as { period?: string };
    const match = /^(\d{4})-(\d{2})$/.exec(body.period ?? "2026-08");
    const year = match ? Number(match[1]) : 2026;
    const month = match ? Number(match[2]) : 8;
    const saved = await backfillDealSnapshots({ year, month });
    return NextResponse.json({ count: saved.length, deals: saved.map((row) => row.code) });
  } catch (error) {
    return dealErrorResponse(error);
  }
}
