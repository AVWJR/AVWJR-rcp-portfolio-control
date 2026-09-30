import { prisma } from "@/lib/prisma";
import { parseCriteria, type Criterion } from "./criteria";

export async function listCriteriaPresets() {
  return prisma.criteriaPreset.findMany({ orderBy: { name: "asc" } });
}

export async function saveCriteriaPreset(name: string, criteria: Criterion[]) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name the preset.");
  const criteriaJson = JSON.stringify(criteria);
  return prisma.criteriaPreset.upsert({
    where: { name: trimmed },
    update: { criteriaJson },
    create: { name: trimmed, criteriaJson },
  });
}

/** Removes one saved search. Does not delete deals, snapshots, or documents. */
export async function deleteCriteriaPreset(id: string) {
  const row = await prisma.criteriaPreset.findUnique({ where: { id } });
  if (!row) throw new Error("That preset is not on file.");
  await prisma.criteriaPreset.delete({ where: { id } });
  return { id: row.id, name: row.name };
}

export async function loadCriteriaPreset(id: string): Promise<Criterion[]> {
  const row = await prisma.criteriaPreset.findUnique({ where: { id } });
  if (!row) throw new Error("That preset is not on file.");
  return parseCriteria(JSON.parse(row.criteriaJson));
}
