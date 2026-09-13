import { createSpeDeal, listSpeDeals, suggestCodeForName } from "@/lib/deals/create-spe";
import { dealErrorResponse, rateLimitDeals } from "@/lib/deals/http";
import { serialize } from "@/lib/serialize";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  const url = new URL(request.url);
  const suggest = url.searchParams.get("suggest");
  if (suggest != null) {
    const code = await suggestCodeForName(suggest);
    return NextResponse.json({ code });
  }
  const spes = await listSpeDeals();
  return NextResponse.json(
    serialize({
      deals: spes.map((spe) => ({
        id: spe.id,
        code: spe.code,
        name: spe.name,
        parentCode: spe.parent?.code ?? null,
        unitCount: spe.unitCount,
        strategy: spe.strategy,
        units: spe._count.units,
        loans: spe._count.loans,
        vaultDocuments: spe._count.vaultDocuments,
      })),
    }),
  );
}

export async function POST(request: Request) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  try {
    const body = (await request.json()) as {
      name?: string;
      code?: string;
      parentOpCoCode?: string;
      unitCount?: number | null;
      strategy?: "VALUE_ADD_GARDEN" | "STABILIZED" | "LIGHT_REHAB" | null;
      goal?: "stabilize" | "value_add" | "light_rehab" | null;
      targetPeriod?: string | null;
    };
    const { entity, parent } = await createSpeDeal({
      name: body.name ?? "",
      code: body.code ?? "",
      parentOpCoCode: body.parentOpCoCode,
      unitCount: body.unitCount,
      strategy: body.strategy,
      goal: body.goal,
      targetPeriod: body.targetPeriod,
    });
    return NextResponse.json(
      serialize({
        id: entity.id,
        code: entity.code,
        name: entity.name,
        parentCode: parent.code,
        unitCount: entity.unitCount,
        strategy: entity.strategy,
      }),
      { status: 201 },
    );
  } catch (error) {
    return dealErrorResponse(error);
  }
}
