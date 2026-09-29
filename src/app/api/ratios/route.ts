import { enforce } from "@/lib/auth/actor";
import { RATIO_DICTIONARY } from "@rcp/analytics";
import { NextResponse } from "next/server";

export async function GET() {
  const denied = await enforce("read");
  if (denied) return denied;
  return NextResponse.json({
    count: RATIO_DICTIONARY.length,
    ratios: RATIO_DICTIONARY,
    sourceOfTruth: "docs/RCP_RATIO_DICTIONARY_STUB.md",
  });
}
