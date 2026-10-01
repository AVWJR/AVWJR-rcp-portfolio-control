import { dealErrorResponse, rateLimitDeals } from "@/lib/deals/http";
import { deleteModel, loadModelProjection } from "@/lib/models/store";
import { toModelView } from "@/lib/models/view";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  try {
    const { id } = await context.params;
    const url = new URL(request.url);
    const period = url.searchParams.get("period") ?? "";
    const [yearText, monthText] = period.split("-");
    const year = Number(yearText);
    const month = Number(monthText);
    const loaded = await loadModelProjection(
      id,
      Number.isInteger(year) && year > 0 ? year : null,
      Number.isInteger(month) && month >= 1 && month <= 12 ? month : null,
    );
    return NextResponse.json(toModelView(loaded));
  } catch (error) {
    return dealErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  try {
    const { id } = await context.params;
    await deleteModel(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return dealErrorResponse(error);
  }
}
