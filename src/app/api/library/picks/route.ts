import { dealErrorResponse, rateLimitDeals } from "@/lib/deals/http";
import { addPickItem, isPickKind, listPickItems, removePickItem } from "@/lib/library/pick-lists";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  const items = await listPickItems();
  return NextResponse.json({
    items: items.map((row) => ({ id: row.id, kind: row.kind, label: row.label })),
  });
}

export async function POST(request: Request) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  try {
    const body = (await request.json().catch(() => ({}))) as { kind?: string; label?: string; id?: string; confirmLabel?: string };
    if (body.id) {
      const removed = await removePickItem(body.id, body.confirmLabel ?? "");
      return NextResponse.json({ removed: removed.label });
    }
    if (!body.kind || !isPickKind(body.kind)) {
      return NextResponse.json({ error: "Choose a state, metro, or property type list." }, { status: 400 });
    }
    const item = await addPickItem(body.kind, body.label ?? "");
    return NextResponse.json({ id: item.id, kind: item.kind, label: item.label });
  } catch (error) {
    return dealErrorResponse(error);
  }
}
