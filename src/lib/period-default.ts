import { prisma } from "./prisma";

export const FALLBACK_PERIOD = "2026-08";

/**
 * Reporting period when the caller did not pass one.
 * An explicit period always wins. A SPE uses its own latest hard close.
 * OpCo and HoldCo use the latest hard close across their live SPEs.
 */
export async function resolveReportingPeriod(code: string, requested?: string | null): Promise<string> {
  const explicit = requested?.trim();
  if (explicit) return explicit;
  const entity = await prisma.entity.findUnique({
    where: { code },
    include: {
      children: {
        include: { children: { select: { id: true, type: true, lifecycleStatus: true } } },
      },
    },
  });
  if (!entity) return FALLBACK_PERIOD;
  const speIds: string[] = [];
  if (entity.type === "SPE") {
    speIds.push(entity.id);
  } else if (entity.type === "OPCO") {
    for (const child of entity.children) {
      if (child.type === "SPE" && child.lifecycleStatus !== "ARCHIVED") speIds.push(child.id);
    }
  } else if (entity.type === "HOLDCO") {
    for (const opco of entity.children) {
      for (const spe of opco.children) {
        if (spe.type === "SPE" && spe.lifecycleStatus !== "ARCHIVED") speIds.push(spe.id);
      }
    }
  }
  if (!speIds.length) return FALLBACK_PERIOD;
  const closed = await prisma.period.findFirst({
    where: { entityId: { in: speIds }, status: "CLOSED" },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  return closed?.label ?? FALLBACK_PERIOD;
}
