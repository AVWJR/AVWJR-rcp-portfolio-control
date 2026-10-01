import { dealErrorResponse, rateLimitDeals } from "@/lib/deals/http";
import { createModel, listModels } from "@/lib/models/store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  const models = await listModels();
  return NextResponse.json({
    models: models.map((model) => ({ id: model.id, name: model.name, kind: model.kind, deals: model.deals.length })),
  });
}

export async function POST(request: Request) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  try {
    const body = (await request.json().catch(() => ({}))) as { name?: string; kind?: string };
    const model = await createModel({ name: body.name ?? "", kind: body.kind });
    return NextResponse.json({ id: model.id, name: model.name, kind: model.kind });
  } catch (error) {
    return dealErrorResponse(error);
  }
}
