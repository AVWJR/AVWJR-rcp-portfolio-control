import { currentAccessRole } from "@/lib/access-server";
import {
  DistributionLedgerError,
  reverseDistribution,
} from "@/lib/distribution-ledger";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ code: string; eventId: string }> }) {
  try {
    const { code, eventId } = await context.params;
    const entity = await prisma.entity.findUnique({ where: { code: code.toUpperCase() } });
    if (!entity || entity.type !== "SPE") {
      return NextResponse.json({ error: `Unknown SPE ${code}` }, { status: 404 });
    }
    const role = await currentAccessRole();
    const body = (await request.json().catch(() => ({}))) as { memo?: string };
    const board = await reverseDistribution({
      entityId: entity.id,
      eventId,
      actor: role,
      role,
      memo: body.memo,
    });
    return NextResponse.json(serialize({ board }));
  } catch (error) {
    if (error instanceof DistributionLedgerError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
