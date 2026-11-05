import { enforce } from "@/lib/auth/actor";
import { listReportPacks } from "@rcp/documents";
import { NextResponse } from "next/server";

export async function GET() {
  const denied = await enforce("read");
  if (denied) return denied;
  return NextResponse.json({ packs: listReportPacks() });
}
