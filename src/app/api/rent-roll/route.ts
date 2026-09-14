import { prisma } from "@/lib/prisma";
import {
  exportRentRollCsv,
  importRentRollSource,
  loadCanonicalRentRollDocument,
  loadOriginalRentRollDocument,
  loadUnits,
  parseCanonicalNotes,
} from "@/lib/rent-roll";
import { readVaultDocument } from "@/lib/vault";
import { serialize } from "@/lib/serialize";
import { dialectCoachLine, summarizeRentRoll } from "@rcp/properties";
import { NextResponse } from "next/server";
import { CANONICAL_WORKBOOK_FILENAME } from "@/lib/rent-roll-workbook";

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
  const format = url.searchParams.get("format") ?? "json";

  if (format === "csv") {
    const csv = await exportRentRollCsv(entity.id);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${entity.code}-rent-roll.csv"`,
      },
    });
  }

  if (format === "xlsx" || format === "canonical") {
    const canonical = await loadCanonicalRentRollDocument(entity.id);
    if (!canonical) {
      return NextResponse.json({ error: "No canonical rent-roll workbook yet. Upload or re-apply a rent roll." }, { status: 404 });
    }
    const loaded = await readVaultDocument(canonical.id);
    if (!loaded) return NextResponse.json({ error: "Canonical workbook bytes are missing." }, { status: 404 });
    return new NextResponse(new Uint8Array(loaded.bytes), {
      headers: {
        "Content-Type": loaded.doc.mimeType,
        "Content-Disposition": `attachment; filename="${entity.code}-${CANONICAL_WORKBOOK_FILENAME}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (format === "original") {
    const original = await loadOriginalRentRollDocument(entity.id);
    if (!original) {
      return NextResponse.json({ error: "No original rent-roll workbook in Vault." }, { status: 404 });
    }
    const loaded = await readVaultDocument(original.id);
    if (!loaded) return NextResponse.json({ error: "Original workbook bytes are missing." }, { status: 404 });
    return new NextResponse(new Uint8Array(loaded.bytes), {
      headers: {
        "Content-Type": loaded.doc.mimeType,
        "Content-Disposition": `attachment; filename="${loaded.doc.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const units = await loadUnits([entity.id]);
  const canonical = await loadCanonicalRentRollDocument(entity.id);
  const notes = parseCanonicalNotes(canonical?.notes);
  return NextResponse.json(
    serialize({
      entity: { code: entity.code, name: entity.name },
      count: units.length,
      kpis: summarizeRentRoll(units),
      units,
      dialect: notes?.dialect ?? null,
      dialectLabel: notes?.dialectLabel ?? null,
      coach: notes?.dialectLabel
        ? `We detected ${notes.dialectLabel} (${notes.dialect}) and normalized it. Original bytes stay in Vault.`
        : null,
    }),
  );
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  let code = "";
  let confirmReplace = false;
  let filename = "rent-roll.csv";
  let mimeType = "text/csv";
  let bytes: Buffer | null = null;
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    code = String(form.get("entity") ?? "");
    const file = form.get("file");
    if (file instanceof File) {
      bytes = Buffer.from(await file.arrayBuffer());
      filename = file.name;
      mimeType = file.type;
    } else {
      bytes = Buffer.from(String(form.get("csv") ?? ""), "utf8");
    }
    confirmReplace = String(form.get("confirmReplace") ?? "") === "true";
  } else {
    const body = (await request.json()) as { entity?: string; csv?: string; confirmReplace?: boolean };
    code = body.entity ?? "";
    bytes = Buffer.from(body.csv ?? "", "utf8");
    confirmReplace = Boolean(body.confirmReplace);
  }

  const resolved = await resolveSpe(code);
  if ("error" in resolved && resolved.error) return resolved.error;
  const entity = resolved.entity!;
  if (!bytes?.length) {
    return NextResponse.json({ error: "Upload a rent-roll CSV or XLSX." }, { status: 400 });
  }

  try {
    const imported = await importRentRollSource({
      entityId: entity.id,
      filename,
      mimeType,
      bytes,
      confirmReplace,
    });
    await prisma.entity.update({ where: { id: entity.id }, data: { unitCount: imported.units.length } });
    return NextResponse.json({
      imported: imported.units.length,
      entity: entity.code,
      dialect: imported.dialect,
      dialectLabel: imported.dialectLabel,
      coach: dialectCoachLine(imported.normalized.meta),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
