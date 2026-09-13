import { listEntities } from "@/lib/queries";
import { NextResponse } from "next/server";

export async function GET() {
  const entities = await listEntities();
  return NextResponse.json(
    entities.map((e) => ({
      id: e.id,
      code: e.code,
      name: e.name,
      type: e.type,
      parentCode: e.parent?.code ?? null,
      ownershipBps: e.ownershipBps,
      unitCount: e.unitCount,
      strategy: e.strategy,
      lifecycleStatus: e.lifecycleStatus,
    })),
  );
}
