import { enforce } from "@/lib/auth/actor";
import { dealErrorResponse, rateLimitDeals } from "@/lib/deals/http";
import { parseCriteria } from "@/lib/library/criteria";
import { deleteCriteriaPreset, listCriteriaPresets, loadCriteriaPreset, saveCriteriaPreset } from "@/lib/library/presets";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await enforce("read");
  if (denied) return denied;
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
    const denied = await enforce(body.id && !body.name ? "read" : "deals.write");
    if (denied) return denied;
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

export async function DELETE(request: Request) {
  const denied = await enforce("deals.write");
  if (denied) return denied;
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  try {
    const body = (await request.json().catch(() => ({}))) as { id?: string };
    const removed = await deleteCriteriaPreset(body.id ?? "");
    return NextResponse.json({ deleted: true, id: removed.id, name: removed.name });
  } catch (error) {
    return dealErrorResponse(error);
  }
}
