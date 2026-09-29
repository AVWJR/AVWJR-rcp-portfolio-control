import { enforce, resolveActor, visibleEntityCodes } from "@/lib/auth/actor";
import { loadPortfolioDebt } from "@/lib/debt-view";
import { serialize } from "@/lib/serialize";
import { NextResponse } from "next/server";

export async function GET() {
  const denied = await enforce("read");
  if (denied) return denied;
  const actor = await resolveActor();
  const codes = await visibleEntityCodes(actor);
  const loans = (await loadPortfolioDebt()).filter((loan) => !codes || codes.has(loan.entityCode));
  return NextResponse.json(serialize({ count: loans.length, loans }));
}
