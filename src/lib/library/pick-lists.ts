/**
 * Editable Library lists.
 * States and property types are inserted when missing. Metros start empty and
 * are added when a deal saves one, or when the owner types one.
 * ensureLibraryPickLists never deletes a row. Age never removes a list item,
 * a deal, or a document.
 */

import { prisma } from "@/lib/prisma";

export const PICK_STATE = "state";
export const PICK_METRO = "metro";
export const PICK_PROPERTY_TYPE = "property_type";

export const SEEDED_STATES = ["GA", "FL", "NC", "SC", "TN", "TX", "AL"] as const;
export const SEEDED_PROPERTY_TYPES = ["Garden", "Mid-rise", "Build-to-rent/Townhome"] as const;

export type PickKind = typeof PICK_STATE | typeof PICK_METRO | typeof PICK_PROPERTY_TYPE;

export function isPickKind(value: string): value is PickKind {
  return value === PICK_STATE || value === PICK_METRO || value === PICK_PROPERTY_TYPE;
}

async function ensureLabel(kind: string, label: string, sortOrder: number) {
  await prisma.libraryPickItem.upsert({
    where: { kind_label: { kind, label } },
    update: {},
    create: { kind, label, sortOrder },
  });
}

/** Insert the owner-approved seed values if they are missing. Never deletes. */
export async function ensureLibraryPickLists(): Promise<void> {
  for (let i = 0; i < SEEDED_STATES.length; i += 1) {
    await ensureLabel(PICK_STATE, SEEDED_STATES[i]!, i);
  }
  for (let i = 0; i < SEEDED_PROPERTY_TYPES.length; i += 1) {
    await ensureLabel(PICK_PROPERTY_TYPE, SEEDED_PROPERTY_TYPES[i]!, i);
  }
}

export async function listPickItems(kind?: PickKind) {
  await ensureLibraryPickLists();
  return prisma.libraryPickItem.findMany({
    where: kind ? { kind } : undefined,
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
  });
}

export async function addPickItem(kind: PickKind, label: string) {
  const clean = label.trim();
  if (!clean) throw new Error("Type a list value.");
  const stored = kind === PICK_STATE ? clean.toUpperCase() : clean;
  const count = await prisma.libraryPickItem.count({ where: { kind } });
  return prisma.libraryPickItem.upsert({
    where: { kind_label: { kind, label: stored } },
    update: {},
    create: { kind, label: stored, sortOrder: count },
  });
}

/**
 * Removes one list label the owner named. Does not touch deals or documents.
 * confirmLabel must match so this cannot run from a timer or a blank click.
 */
export async function removePickItem(id: string, confirmLabel: string) {
  const row = await prisma.libraryPickItem.findUnique({ where: { id } });
  if (!row) throw new Error("That list item is already gone.");
  if (confirmLabel.trim().toLowerCase() !== row.label.toLowerCase()) {
    throw new Error(`Type ${row.label} to remove it from the list. Deals that already use it keep the value.`);
  }
  await prisma.libraryPickItem.delete({ where: { id } });
  return row;
}

/** Remember a metro typed on a deal. Adds a list row. Never removes one. */
export async function rememberMetro(label: string | null | undefined) {
  const metro = label?.trim();
  if (!metro) return;
  await addPickItem(PICK_METRO, metro);
}
