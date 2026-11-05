import { enforce, resolveActor } from "@/lib/auth/actor";
import { loadCapexProjects } from "@/lib/capex";
import { serialize } from "@/lib/serialize";
import { NextResponse } from "next/server";

export async function GET() {
  const denied = await enforce("read");
  if (denied) return denied;
  const actor = await resolveActor();
  const projects = await loadCapexProjects(actor.entityIds ?? undefined);
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
