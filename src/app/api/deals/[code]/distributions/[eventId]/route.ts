import { DistributionLedgerError, rejectDistributionDelete, rejectDistributionEdit } from "@/lib/distribution-ledger";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(error: unknown) {
  if (error instanceof DistributionLedgerError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Request failed";
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function PATCH() {
  try {
    rejectDistributionEdit();
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE() {
  try {
    rejectDistributionDelete();
  } catch (error) {
    return fail(error);
  }
}
