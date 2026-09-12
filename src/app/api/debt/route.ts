import { loadPortfolioDebt } from "@/lib/debt-view";
import { serialize } from "@/lib/serialize";
import { NextResponse } from "next/server";

export async function GET() {
  const loans = await loadPortfolioDebt();
  return NextResponse.json(serialize({ count: loans.length, loans }));
}
