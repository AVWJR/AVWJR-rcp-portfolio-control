import { marketsGuard } from "@/lib/markets/guard";
import { loadMarketsBundle } from "@/lib/markets/read";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await marketsGuard();
  if (denied) return denied;
  const bundle = await loadMarketsBundle();
  if (bundle.state !== "ready") return NextResponse.json({ error: bundle.message }, { status: 503 });
  return NextResponse.json({
    asOfLabel: bundle.asOfLabel,
    runLabel: bundle.runLabel,
    scoringSourceIds: bundle.scoringSourceIds,
    rows: bundle.rows,
  });
}
