import { isOwnedSpe } from "./deal-status";
import { prisma } from "./prisma";

export const FALLBACK_PERIOD = "2026-08";

type LiveSpe = { id: string; code: string; name: string };

async function liveSpes(code: string): Promise<{ kind: "SPE" | "OPCO" | "HOLDCO" | "OTHER"; spes: LiveSpe[] }> {
  const entity = await prisma.entity.findUnique({
    where: { code },
    include: {
      children: {
        include: {
          children: {
            select: { id: true, code: true, name: true, type: true, lifecycleStatus: true, dealStatus: true },
          },
        },
      },
    },
  });
  if (!entity) return { kind: "OTHER", spes: [] };
  const spes: LiveSpe[] = [];
  if (entity.type === "SPE") {
    if (isOwnedSpe(entity)) spes.push({ id: entity.id, code: entity.code, name: entity.name });
  } else if (entity.type === "OPCO") {
    for (const child of entity.children) {
      if (isOwnedSpe(child)) spes.push({ id: child.id, code: child.code, name: child.name });
    }
  } else if (entity.type === "HOLDCO") {
    for (const opco of entity.children) {
      for (const spe of opco.children) {
        if (isOwnedSpe(spe)) spes.push({ id: spe.id, code: spe.code, name: spe.name });
      }
    }
  }
  return { kind: entity.type === "SPE" || entity.type === "OPCO" || entity.type === "HOLDCO" ? entity.type : "OTHER", spes };
}

/**
 * Reporting period when the caller did not pass one.
 * An explicit period always wins. A SPE uses its own latest hard close.
 * OpCo and HoldCo use the latest month that every live SPE has hard-closed.
 * If no such month exists, the fallback is 2026-08.
 */
export async function resolveReportingPeriod(code: string, requested?: string | null): Promise<string> {
  const explicit = requested?.trim();
  if (explicit) return explicit;
  const { kind, spes } = await liveSpes(code);
  if (!spes.length) return FALLBACK_PERIOD;
  if (kind === "SPE") {
    const closed = await prisma.period.findFirst({
      where: { entityId: spes[0]!.id, status: "CLOSED" },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });
    return closed?.label ?? FALLBACK_PERIOD;
  }
  const closed = await prisma.period.findMany({
    where: { entityId: { in: spes.map((spe) => spe.id) }, status: "CLOSED" },
    select: { entityId: true, label: true, year: true, month: true },
  });
  const byLabel = new Map<string, { year: number; month: number; ids: Set<string> }>();
  for (const row of closed) {
    const bucket = byLabel.get(row.label) ?? { year: row.year, month: row.month, ids: new Set<string>() };
    bucket.ids.add(row.entityId);
    byLabel.set(row.label, bucket);
  }
  const shared = [...byLabel.values()]
    .filter((bucket) => spes.every((spe) => bucket.ids.has(spe.id)))
    .sort((a, b) => b.year - a.year || b.month - a.month);
  return shared[0] ? `${shared[0].year}-${String(shared[0].month).padStart(2, "0")}` : FALLBACK_PERIOD;
}

/** Live SPEs under an OpCo or HoldCo that are not hard-closed for the period. */
export async function spesStillOpen(
  parentCode: string,
  periodLabel: string,
): Promise<{ code: string; name: string; status: string }[]> {
  const { kind, spes } = await liveSpes(parentCode);
  if (kind === "SPE" || !spes.length) return [];
  const [yearStr, monthStr] = periodLabel.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month) return spes.map((spe) => ({ code: spe.code, name: spe.name, status: "OPEN" }));
  const periods = await prisma.period.findMany({
    where: { entityId: { in: spes.map((spe) => spe.id) }, year, month },
    select: { entityId: true, status: true },
  });
  const statusById = new Map(periods.map((row) => [row.entityId, row.status]));
  return spes
    .filter((spe) => statusById.get(spe.id) !== "CLOSED")
    .map((spe) => ({ code: spe.code, name: spe.name, status: statusById.get(spe.id) ?? "OPEN" }))
    .sort((a, b) => a.code.localeCompare(b.code));
}
