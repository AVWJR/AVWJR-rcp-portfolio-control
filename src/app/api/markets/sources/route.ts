import { marketsGuard } from "@/lib/markets/guard";
import { MarketsError } from "@/lib/markets/policy";
import { loadMarketsBundle } from "@/lib/markets/read";
import { registerPaidSource } from "@/lib/markets/register";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await marketsGuard();
  if (denied) return denied;
  const bundle = await loadMarketsBundle();
  if (bundle.state !== "ready") return NextResponse.json({ error: bundle.message }, { status: 503 });
  return NextResponse.json({
    sources: bundle.sources.map((source) => ({
      id: source.id,
      name: source.name,
      publisher: source.publisher,
      licenseBasis: source.licenseBasis,
      status: source.status,
      feedsScore: source.feedsScore,
      paywalled: source.paywalled,
    })),
  });
}

export async function POST(request: Request) {
  const denied = await marketsGuard();
  if (denied) return denied;
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const saved = await registerPaidSource(body);
    return NextResponse.json({ ok: true, id: saved.id, message: saved.message });
  } catch (error) {
    if (error instanceof MarketsError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Could not register the source." }, { status: 500 });
  }
}
