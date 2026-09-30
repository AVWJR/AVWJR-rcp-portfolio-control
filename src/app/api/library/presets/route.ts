import { dealErrorResponse, rateLimitDeals } from "@/lib/deals/http";
import { parseCriteria } from "@/lib/library/criteria";
import { listCriteriaPresets, loadCriteriaPreset, saveCriteriaPreset } from "@/lib/library/presets";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  const presets = await listCriteriaPresets();
  return NextResponse.json({
    presets: presets.map((row) => ({ id: row.id, name: row.name })),
  });
}

export async function POST(request: Request) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  try {
    const body = (await request.json().catch(() => ({}))) as { id?: string; name?: string; criteria?: unknown };
    if (body.id && !body.name) {
      const criteria = await loadCriteriaPreset(body.id);
      return NextResponse.json({ criteria });
    }
    const saved = await saveCriteriaPreset(body.name ?? "", parseCriteria(body.criteria));
    return NextResponse.json({ id: saved.id, name: saved.name });
  } catch (error) {
    return dealErrorResponse(error);
  }
}
