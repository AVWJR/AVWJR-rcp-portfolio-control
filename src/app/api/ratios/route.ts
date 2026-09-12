import { RATIO_DICTIONARY } from "@rcp/analytics";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    count: RATIO_DICTIONARY.length,
    ratios: RATIO_DICTIONARY,
    sourceOfTruth: "docs/RCP_RATIO_DICTIONARY_STUB.md",
  });
}
