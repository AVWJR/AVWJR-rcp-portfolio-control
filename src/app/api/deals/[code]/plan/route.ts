import { currentAccessRole } from "@/lib/access-server";
import {
  AssetPlanError,
  PLAN_ACTION,
  PLAN_NOT_OWNED,
  PLAN_PERIOD,
  assertCanMutatePlan,
  assertNoResidentKeys,
  validateDecision,
  validateIncomeIdea,
  validateWeeklyUpdate,
} from "@/lib/asset-mgmt/policy";
import { decideIncomeIdea, saveIncomeIdea, saveWeeklyUpdate } from "@/lib/asset-mgmt/store";
import { dealErrorResponse, rateLimitDeals } from "@/lib/deals/http";
import { isOwnedSpe } from "@/lib/owned-spe";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePeriod(value: unknown): { year: number; month: number } | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) return null;
  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!year || month < 1 || month > 12) return null;
  return { year, month };
}

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  try {
    const role = await currentAccessRole();
    assertCanMutatePlan(role);
    const { code } = await context.params;
    const entity = await prisma.entity.findUnique({ where: { code: code.toUpperCase() } });
    if (!entity || entity.type !== "SPE") return NextResponse.json({ error: `Unknown SPE ${code}` }, { status: 404 });
    if (!isOwnedSpe(entity)) return NextResponse.json({ error: PLAN_NOT_OWNED }, { status: 409 });
    const body = (await request.json()) as Record<string, unknown>;
    assertNoResidentKeys(body);
    const period = parsePeriod(body.period);
    if (!period) return NextResponse.json({ error: PLAN_PERIOD }, { status: 400 });
    const actor = "principal";
    if (body.action === "weekly") {
      const input = validateWeeklyUpdate(body);
      const saved = await saveWeeklyUpdate({ entityId: entity.id, year: period.year, month: period.month, actor, input });
      return NextResponse.json({ ok: true, external: saved.external });
    }
    if (body.action === "income") {
      const input = validateIncomeIdea(body);
      const saved = await saveIncomeIdea({ entityId: entity.id, year: period.year, month: period.month, actor, input });
      return NextResponse.json({ ok: true, id: saved.id, external: saved.external });
    }
    if (body.action === "decide") {
      const input = validateDecision(body);
      const saved = await decideIncomeIdea({ entityId: entity.id, year: period.year, month: period.month, actor, input });
      return NextResponse.json({ ok: true, status: saved.status, external: saved.external });
    }
    return NextResponse.json({ error: PLAN_ACTION }, { status: 400 });
  } catch (error) {
    if (error instanceof AssetPlanError) return NextResponse.json({ error: error.message }, { status: error.status });
    return dealErrorResponse(error);
  }
}
