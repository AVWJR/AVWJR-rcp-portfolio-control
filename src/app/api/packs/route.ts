import { listReportPacks } from "@rcp/documents";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ packs: listReportPacks() });
}
