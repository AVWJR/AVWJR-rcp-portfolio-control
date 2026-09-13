import { applyCreateEntity, applyStructuredData } from "@/lib/deals/apply";
import { getIntake, publicIntake } from "@/lib/deals/intake";
import { dealErrorResponse, rateLimitDeals } from "@/lib/deals/http";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  try {
    const body = (await request.json()) as {
      intakeId?: string;
      action?: "create_entity" | "apply";
      confirmReplace?: boolean;
      importRentRoll?: boolean;
      importBudget?: boolean;
      saveLoan?: boolean;
    };
    if (!body.intakeId) return NextResponse.json({ error: "intakeId required" }, { status: 400 });
    if (body.action === "create_entity") {
      const intake = await applyCreateEntity(body.intakeId);
      return NextResponse.json({ intake: intake ? publicIntake(intake) : null });
    }
    const applied = await applyStructuredData({
      intakeId: body.intakeId,
      confirmReplace: body.confirmReplace,
      importRentRoll: body.importRentRoll,
      importBudget: body.importBudget,
      saveLoan: body.saveLoan,
    });
    const latest = applied.intake ?? (await getIntake(body.intakeId));
    return NextResponse.json({
      results: applied.results,
      intake: latest ? publicIntake(latest) : null,
    });
  } catch (error) {
    return dealErrorResponse(error);
  }
}
