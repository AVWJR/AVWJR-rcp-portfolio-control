import { currentAccessRole } from "@/lib/access-server";
import { NextResponse } from "next/server";
import { marketsAccessDenied } from "./policy";
import { MARKETS_LOCKED } from "./types";

export async function marketsGuard(): Promise<NextResponse | null> {
  const role = await currentAccessRole();
  if (marketsAccessDenied(role)) {
    return NextResponse.json({ error: MARKETS_LOCKED }, { status: 403 });
  }
  return null;
}
