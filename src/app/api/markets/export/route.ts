import { marketsGuard } from "@/lib/markets/guard";
import { loadMarketsBundle, scoreboardCsv } from "@/lib/markets/read";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await marketsGuard();
  if (denied) return denied;
  const bundle = await loadMarketsBundle();
  if (bundle.state !== "ready") return NextResponse.json({ error: bundle.message }, { status: 503 });
  return new NextResponse(scoreboardCsv(bundle.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="market-ranks-v1-2025-11-01.csv"',
    },
  });
}
