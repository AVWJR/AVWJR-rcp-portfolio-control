import { dealErrorResponse, rateLimitDeals } from "@/lib/deals/http";
import { rcpMailboxAddress, rcpMailboxProvider } from "@/lib/deals/providers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  try {
    const configured = rcpMailboxProvider.isConfigured();
    return NextResponse.json({
      configured,
      mailbox: rcpMailboxAddress() || null,
      scanned: 0,
      imported: 0,
      message: configured
        ? "RCP mailbox scan is wired but the production inbox workflow is not live yet. No messages were imported."
        : rcpMailboxProvider.unconfiguredMessage(),
    });
  } catch (error) {
    return dealErrorResponse(error);
  }
}

export async function GET() {
  return NextResponse.json({
    configured: rcpMailboxProvider.isConfigured(),
    mailbox: rcpMailboxAddress() || null,
    message: rcpMailboxProvider.unconfiguredMessage(),
  });
}
