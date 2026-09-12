import { loadCapexProjects } from "@/lib/capex";
import { serialize } from "@/lib/serialize";
import { NextResponse } from "next/server";

export async function GET() {
  const projects = await loadCapexProjects();
  return NextResponse.json(
    serialize({
      count: projects.length,
      projects: projects.map((p) => ({
        id: p.id,
        entity: p.entity.code,
        name: p.name,
        classification: p.classification,
        status: p.status,
        budgetCents: p.budgetCents,
        spentCents: p.spentCents,
        cipCents: p.cipCents,
        placedInServiceCents: p.placedInServiceCents,
      })),
    }),
  );
}
