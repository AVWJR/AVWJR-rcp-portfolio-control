import { changeDealStatus } from "@/lib/deal-status";
import { dealErrorResponse, rateLimitDeals } from "@/lib/deals/http";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  try {
    const { code } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      toStatus?: string;
      reason?: string;
      confirmRollup?: boolean;
      confirmOwned?: boolean;
    };
    const deal = await changeDealStatus({
      code,
      toStatus: body.toStatus ?? "",
      reason: body.reason,
      confirmRollup: body.confirmRollup === true,
      confirmOwned: body.confirmOwned === true,
    });
    return NextResponse.json({ deal });
  } catch (error) {
    return dealErrorResponse(error);
  }
}
