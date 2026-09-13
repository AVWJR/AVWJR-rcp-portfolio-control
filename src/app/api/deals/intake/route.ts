import { createIntake, getIntake, publicIntake, updateIntake } from "@/lib/deals/intake";
import { dealErrorResponse, rateLimitDeals } from "@/lib/deals/http";
import { dollarsToCents, multipleToDscrBps, percentToRateBps, percentToYieldBps } from "@/lib/deals/money";
import {
  isDealFileSource,
  isDealGoal,
  type DealFileSource,
  type DealGoal,
  type DealIntakePatch,
} from "@/lib/deals/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function patchFromBody(body: Record<string, unknown>): DealIntakePatch {
  const sources = Array.isArray(body.sources)
    ? body.sources.filter((row): row is DealFileSource => typeof row === "string" && isDealFileSource(row))
    : undefined;
  return {
    currentStep: typeof body.currentStep === "number" ? body.currentStep : undefined,
    status: typeof body.status === "string" ? (body.status as DealIntakePatch["status"]) : undefined,
    goal: typeof body.goal === "string" && isDealGoal(body.goal) ? (body.goal as DealGoal) : body.goal === null ? null : undefined,
    targetPeriod: typeof body.targetPeriod === "string" || body.targetPeriod === null ? (body.targetPeriod as string | null) : undefined,
    speName: typeof body.speName === "string" || body.speName === null ? (body.speName as string | null) : undefined,
    speCode: typeof body.speCode === "string" || body.speCode === null ? (body.speCode as string | null) : undefined,
    unitCount: typeof body.unitCount === "number" || body.unitCount === null ? (body.unitCount as number | null) : undefined,
    strategy:
      body.strategy === "VALUE_ADD_GARDEN" ||
      body.strategy === "STABILIZED" ||
      body.strategy === "LIGHT_REHAB" ||
      body.strategy === null
        ? body.strategy
        : undefined,
    parentOpCoCode: typeof body.parentOpCoCode === "string" ? body.parentOpCoCode : undefined,
    sources,
    loanName: typeof body.loanName === "string" || body.loanName === null ? (body.loanName as string | null) : undefined,
    loanLender: typeof body.loanLender === "string" || body.loanLender === null ? (body.loanLender as string | null) : undefined,
    loanUpbCents:
      body.loanUpbUsd !== undefined
        ? dollarsToCents(body.loanUpbUsd as string | number | null)
        : body.loanUpbCents !== undefined
          ? dollarsToCents(Number(body.loanUpbCents) / 100)
          : undefined,
    loanRateBps:
      body.loanRatePercent !== undefined
        ? percentToRateBps(body.loanRatePercent as string | number | null)
        : typeof body.loanRateBps === "number" || body.loanRateBps === null
          ? (body.loanRateBps as number | null)
          : undefined,
    loanPaymentCents:
      body.loanPaymentUsd !== undefined
        ? dollarsToCents(body.loanPaymentUsd as string | number | null)
        : undefined,
    loanOrigination: parseDate(body.loanOrigination),
    loanMaturity: parseDate(body.loanMaturity),
    dscrThresholdBps:
      body.dscrThreshold !== undefined
        ? multipleToDscrBps(body.dscrThreshold as string | number | null)
        : typeof body.dscrThresholdBps === "number" || body.dscrThresholdBps === null
          ? (body.dscrThresholdBps as number | null)
          : undefined,
    debtYieldThresholdBps:
      body.debtYieldThresholdPercent !== undefined
        ? percentToYieldBps(body.debtYieldThresholdPercent as string | number | null)
        : typeof body.debtYieldThresholdBps === "number" || body.debtYieldThresholdBps === null
          ? (body.debtYieldThresholdBps as number | null)
          : undefined,
  };
}

export async function GET(request: Request) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const intake = await getIntake(id);
  if (!intake) return NextResponse.json({ error: "Intake draft not found" }, { status: 404 });
  return NextResponse.json(publicIntake(intake));
}

export async function POST(request: Request) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const patch = patchFromBody(body);
    if (typeof body.id === "string" && body.id) {
      const updated = await updateIntake(body.id, patch);
      return NextResponse.json(publicIntake(updated));
    }
    const created = await createIntake(patch);
    return NextResponse.json(publicIntake(created), { status: 201 });
  } catch (error) {
    return dealErrorResponse(error);
  }
}
