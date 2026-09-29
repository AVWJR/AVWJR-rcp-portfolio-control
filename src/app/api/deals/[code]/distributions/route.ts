import { currentAccessRole } from "@/lib/access-server";
import { dealErrorResponse, rateLimitDeals } from "@/lib/deals/http";
import {
  DistributionLedgerError,
  distributionCsv,
  loadDistributionBoard,
  postDistribution,
  previewDistribution,
} from "@/lib/distribution-ledger";
import { isDistributionSource } from "@rcp/ledger";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(error: unknown) {
  if (error instanceof DistributionLedgerError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return dealErrorResponse(error);
}

async function speOr404(code: string) {
  const entity = await prisma.entity.findUnique({ where: { code: code.toUpperCase() } });
  if (!entity || entity.type !== "SPE") return null;
  return entity;
}

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  const { code } = await context.params;
  const entity = await speOr404(code);
  if (!entity) return NextResponse.json({ error: `Unknown SPE ${code}` }, { status: 404 });
  const board = await loadDistributionBoard(entity.id);
  if (!board) return NextResponse.json({ error: `Unknown SPE ${code}` }, { status: 404 });
  const url = new URL(request.url);
  if (url.searchParams.get("format") === "csv") {
    return new NextResponse(distributionCsv(board), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${board.entityCode}-distributions.csv"`,
      },
    });
  }
  return NextResponse.json(serialize({ board }));
}

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  const limited = rateLimitDeals(request);
  if (limited) return limited;
  try {
    const { code } = await context.params;
    const entity = await speOr404(code);
    if (!entity) return NextResponse.json({ error: `Unknown SPE ${code}` }, { status: 404 });
    const role = await currentAccessRole();
    const body = (await request.json()) as {
      confirm?: boolean;
      grossCents?: string | number;
      source?: string;
      memo?: string;
      period?: string;
      eventDate?: string;
    };
    if (!body.source || !isDistributionSource(body.source)) {
      return NextResponse.json({ error: "Source must be operating cash or a capital event." }, { status: 400 });
    }
    const gross = BigInt(String(body.grossCents ?? "0"));
    const period = /^\d{4}-\d{2}$/.test(body.period ?? "") ? body.period! : null;
    if (!period) return NextResponse.json({ error: "Pick a period such as 2026-08." }, { status: 400 });
    const [yearText, monthText] = period.split("-");
    const year = Number(yearText);
    const month = Number(monthText);
    if (!body.confirm) {
      const preview = await previewDistribution({ entityId: entity.id, year, month, grossCents: gross, source: body.source });
      return NextResponse.json(
        serialize({
          preview: {
            lines: preview.applied.lines,
            state: preview.applied.state,
            position: preview.position,
            dpiBps: preview.dpiBps,
            monthsAccrued: preview.applied.monthsAccrued,
          },
        }),
      );
    }
    const eventDate = body.eventDate ? new Date(body.eventDate) : new Date();
    if (Number.isNaN(eventDate.getTime())) {
      return NextResponse.json({ error: "Distribution date is not valid." }, { status: 400 });
    }
    const board = await postDistribution({
      entityId: entity.id,
      eventDate,
      year,
      month,
      grossCents: gross,
      source: body.source,
      memo: body.memo?.trim() ? body.memo.trim().slice(0, 500) : null,
      actor: role,
      role,
    });
    return NextResponse.json(serialize({ board }));
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH() {
  const { rejectDistributionEdit } = await import("@/lib/distribution-ledger");
  try {
    rejectDistributionEdit();
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE() {
  const { rejectDistributionDelete } = await import("@/lib/distribution-ledger");
  try {
    rejectDistributionDelete();
  } catch (error) {
    return fail(error);
  }
}
