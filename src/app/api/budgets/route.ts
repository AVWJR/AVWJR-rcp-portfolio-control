import { MASTER_COA_BY_CODE } from "@rcp/ledger";
import { parseBudgetCsv } from "@rcp/properties";
import { prisma } from "@/lib/prisma";
import { exportBudgetCsv, loadBudgetMap, replaceBudget } from "@/lib/budgets";
import { assertReplaceConfirmed } from "@/lib/import-guard";
import { serialize } from "@/lib/serialize";
import { NextResponse } from "next/server";

function parsePeriod(raw: string | null): { year: number; month: number } {
  const [year, month] = (raw ?? "2026-08").split("-").map(Number);
  return { year, month };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("entity") ?? "";
  const entity = await prisma.entity.findUnique({ where: { code } });
  if (!entity) return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  const { year, month } = parsePeriod(url.searchParams.get("period"));

  if (url.searchParams.get("format") === "csv") {
    const csv = await exportBudgetCsv({ entityId: entity.id, year, month });
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${entity.code}-${year}-${String(month).padStart(2, "0")}-budget.csv"`,
      },
    });
  }

  const map = await loadBudgetMap({ entityIds: [entity.id], year, month });
  return NextResponse.json(
    serialize({
      entity: { code: entity.code, name: entity.name },
      period: `${year}-${String(month).padStart(2, "0")}`,
      lines: [...map.entries()].map(([accountCode, amount]) => ({
        accountCode,
        name: MASTER_COA_BY_CODE.get(accountCode)?.name ?? accountCode,
        amount,
      })),
    }),
  );
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  let code = "";
  let csv = "";
  let period = "2026-08";
  let confirmReplace = false;
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    code = String(form.get("entity") ?? "");
    period = String(form.get("period") ?? "2026-08");
    const file = form.get("file");
    if (file instanceof File) csv = await file.text();
    else csv = String(form.get("csv") ?? "");
    confirmReplace = String(form.get("confirmReplace") ?? "") === "true";
  } else {
    const body = (await request.json()) as {
      entity?: string;
      csv?: string;
      period?: string;
      confirmReplace?: boolean;
    };
    code = body.entity ?? "";
    csv = body.csv ?? "";
    period = body.period ?? "2026-08";
    confirmReplace = Boolean(body.confirmReplace);
  }

  const entity = await prisma.entity.findUnique({ where: { code } });
  if (!entity) return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  const { year, month } = parsePeriod(period);

  try {
    const rows = parseBudgetCsv(csv);
    const unknown = rows.filter((r) => !MASTER_COA_BY_CODE.has(r.accountCode));
    if (unknown.length) {
      return NextResponse.json(
        { error: `Unknown CoA codes: ${unknown.map((u) => u.accountCode).join(", ")}` },
        { status: 400 },
      );
    }
    const existingCount = await prisma.budgetLine.count({
      where: { entityId: entity.id, year, month },
    });
    assertReplaceConfirmed({ existingCount, confirmReplace, kind: "budget" });
    await replaceBudget({ entityId: entity.id, year, month, rows, source: "import" });
    return NextResponse.json({ imported: rows.length, entity: entity.code, period });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
