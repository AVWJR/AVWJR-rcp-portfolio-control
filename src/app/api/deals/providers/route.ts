import { listProviderStatus } from "@/lib/deals/providers";
import { rcpMailboxAddress } from "@/lib/deals/providers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    providers: listProviderStatus(),
    rcpMailbox: rcpMailboxAddress() || null,
    maxBytes: 10 * 1024 * 1024,
    maxBytesLabel: "10 MB",
  });
}
