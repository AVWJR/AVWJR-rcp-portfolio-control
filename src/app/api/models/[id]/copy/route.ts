import { dealErrorResponse, rateLimitDeals } from "@/lib/deals/http";
import { copyModel } from "@/lib/models/store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  try {
    const { id } = await context.params;
    const copy = await copyModel(id);
    return NextResponse.json({ id: copy.id, name: copy.name });
  } catch (error) {
    return dealErrorResponse(error);
  }
}
