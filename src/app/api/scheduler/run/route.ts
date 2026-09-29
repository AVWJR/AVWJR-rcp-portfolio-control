import { resolveReportingPeriod } from "@/lib/period-default";
import { runScheduledPack } from "@/lib/scheduler";
import { serialize } from "@/lib/serialize";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { packId?: string; entity?: string; period?: string; jobCode?: string };
  const packId = body.packId ?? "monthly_investor";
  const entity = body.entity ?? "SPE-WBG";
  const period = await resolveReportingPeriod(entity, body.period);
  try {
    const result = await runScheduledPack({
      packId,
      entityCode: entity,
      periodLabel: period,
      jobCode: body.jobCode,
    });
    const status = result.status === "FAILED" ? 500 : 200;
    return NextResponse.json(serialize(result), { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Run failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
