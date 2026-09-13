import { archiveImpactCopy, archiveSpe } from "@/lib/archive";
import { dealErrorResponse, rateLimitDeals } from "@/lib/deals/http";
import { serialize } from "@/lib/serialize";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  try {
    const { code } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { confirmCode?: string };
    const deal = await archiveSpe({ code, confirmCode: body.confirmCode });
    return NextResponse.json(
      serialize({
        deal,
        impact: archiveImpactCopy(deal),
      }),
    );
  } catch (error) {
    return dealErrorResponse(error);
  }
}
