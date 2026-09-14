import { listArchivedSpes } from "@/lib/archive";
import { dealErrorResponse, rateLimitDeals } from "@/lib/deals/http";
import { serialize } from "@/lib/serialize";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  try {
    const deals = await listArchivedSpes();
    return NextResponse.json(
      serialize({
        deals: deals.map((spe) => ({
          id: spe.id,
          code: spe.code,
          name: spe.name,
          parentCode: spe.parentCode,
          unitCount: spe.unitCount,
          strategy: spe.strategy,
          lifecycleStatus: spe.lifecycleStatus,
          archivedAt: spe.archivedAt,
          archivedBy: spe.archivedBy,
          restoredAt: spe.restoredAt,
          restoredBy: spe.restoredBy,
        })),
      }),
    );
  } catch (error) {
    return dealErrorResponse(error);
  }
}
