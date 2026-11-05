import { currentAccessRole } from "@/lib/access-server";
import { enforce, resolveActor } from "@/lib/auth/actor";
import {
  DistributionLedgerError,
  assertCanMutateDistributions,
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
    const signedIn = await resolveActor();
    if (signedIn.kind !== "user") assertCanMutateDistributions(await currentAccessRole());
    const denied = await enforce("waterfall.write", entity.id);
    if (denied) return denied;
    const role = signedIn.kind === "user" ? "principal" : await currentAccessRole();
    const actorLabel = signedIn.kind === "user" ? signedIn.email ?? signedIn.name ?? "signed-in" : role;
    const body = (await request.json().catch(() => ({}))) as { memo?: string };
    const board = await reverseDistribution({
      entityId: entity.id,
      eventId,
      actor: actorLabel,
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
