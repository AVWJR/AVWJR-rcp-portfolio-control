import { buildEntityPack, exportPackBuffer, parsePackId } from "@/lib/pack-export";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request, ctx: { params: Promise<{ packId: string }> }) {
  const { packId: raw } = await ctx.params;
  const packId = parsePackId(raw);
  if (!packId) return NextResponse.json({ error: "Unknown pack" }, { status: 404 });
  const url = new URL(request.url);
  const code = url.searchParams.get("entity") ?? "SPE-WBG";
  const period = url.searchParams.get("period") ?? "2026-08";
  const format = url.searchParams.get("format") ?? "json";
  const [year, month] = period.split("-").map(Number);
  const entity = await prisma.entity.findUnique({ where: { code } });
  if (!entity) return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  if (entity.type === "HOLDCO") {
    return NextResponse.json({ error: "HoldCo has no operating pack" }, { status: 400 });
  }
  const pack = await buildEntityPack({
    entityId: entity.id,
    entityType: entity.type,
    year,
    month,
    packId,
  });
  if (format === "json") {
    return NextResponse.json(serialize({ entity: { code: entity.code, type: entity.type }, period, pack }));
  }
  if (format !== "pdf" && format !== "pptx") {
    return NextResponse.json({ error: "format must be json, pdf, or pptx" }, { status: 400 });
  }
  const buffer = await exportPackBuffer(pack, format);
  const filename = `${pack.filenameBase}.${format}`;
  const type =
    format === "pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
