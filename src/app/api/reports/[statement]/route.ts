import { buildAllStatements } from "@/lib/reports-server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

function serialize(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v)]));
  }
  return value;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ statement: string }> },
) {
  const { statement } = await context.params;
  const url = new URL(request.url);
  const code = url.searchParams.get("entity") ?? "RCP-OPCO";
  const period = url.searchParams.get("period") ?? "2026-08";
  const [year, month] = period.split("-").map(Number);
  const consolidated = url.searchParams.get("view") === "consolidated";

  const entity = await prisma.entity.findUnique({ where: { code } });
  if (!entity) return NextResponse.json({ error: "Unknown entity" }, { status: 404 });

  const all = await buildAllStatements({
    entityId: entity.id,
    year,
    month,
    consolidated,
  });

  const payload =
    statement === "tb"
      ? all.tb
      : statement === "is"
        ? all.is
        : statement === "bs"
          ? all.bs
          : statement === "cf"
            ? all.cf
            : null;

  if (!payload) {
    return NextResponse.json({ error: "Use tb | is | bs | cf" }, { status: 400 });
  }

  return NextResponse.json(
    serialize({
      entity: { code: all.entity.code, name: all.entity.name, type: all.entity.type },
      period: all.period.label,
      consolidated: all.consolidated,
      statement,
      data: payload,
    }),
  );
}
