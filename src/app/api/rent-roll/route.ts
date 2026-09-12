import { prisma } from "@/lib/prisma";
import { exportRentRollCsv, importRentRollCsv, loadUnits } from "@/lib/rent-roll";
import { serialize } from "@/lib/serialize";
import { summarizeRentRoll } from "@rcp/properties";
import { NextResponse } from "next/server";

async function resolveSpe(code: string) {
  const entity = await prisma.entity.findUnique({ where: { code } });
  if (!entity) return { error: NextResponse.json({ error: "Unknown entity" }, { status: 404 }) };
  if (entity.type !== "SPE") {
    return { error: NextResponse.json({ error: "Rent roll is SPE-only" }, { status: 400 }) };
  }
  return { entity };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("entity") ?? "";
  const resolved = await resolveSpe(code);
  if ("error" in resolved && resolved.error) return resolved.error;
  const entity = resolved.entity!;

  if (url.searchParams.get("format") === "csv") {
    const csv = await exportRentRollCsv(entity.id);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${entity.code}-rent-roll.csv"`,
      },
    });
  }

  const units = await loadUnits([entity.id]);
  return NextResponse.json(
    serialize({
      entity: { code: entity.code, name: entity.name },
      count: units.length,
      kpis: summarizeRentRoll(units),
      units,
    }),
  );
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  let code = "";
  let csv = "";
  let confirmReplace = false;
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    code = String(form.get("entity") ?? "");
    const file = form.get("file");
    if (file instanceof File) csv = await file.text();
    else csv = String(form.get("csv") ?? "");
    confirmReplace = String(form.get("confirmReplace") ?? "") === "true";
  } else {
    const body = (await request.json()) as { entity?: string; csv?: string; confirmReplace?: boolean };
    code = body.entity ?? "";
    csv = body.csv ?? "";
    confirmReplace = Boolean(body.confirmReplace);
  }

  const resolved = await resolveSpe(code);
  if ("error" in resolved && resolved.error) return resolved.error;
  const entity = resolved.entity!;

  try {
    const units = await importRentRollCsv({ entityId: entity.id, csv, confirmReplace });
    return NextResponse.json({ imported: units.length, entity: entity.code });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
