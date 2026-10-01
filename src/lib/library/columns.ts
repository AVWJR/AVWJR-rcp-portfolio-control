/**
 * Owner-approved Library columns (2026-09-30).
 * Deal name, status, and the stale flag stay pinned. These columns can be hidden or reordered.
 * Layout is a view preference. It never deletes a deal, a snapshot, or a file.
 */

export const LIBRARY_COLUMNS = [
  { id: "dscr", label: "DSCR" },
  { id: "debtYield", label: "Debt yield" },
  { id: "capRate", label: "Cap rate" },
  { id: "ltv", label: "LTV" },
  { id: "cashOnCash", label: "Cash-on-cash" },
  { id: "lpNetIrr", label: "LP net IRR" },
  { id: "lpCashYield", label: "LP cash yield" },
  { id: "rcpIrr", label: "RCP IRR" },
  { id: "pricePerUnit", label: "Price / unit" },
  { id: "occupancy", label: "Occupancy" },
  { id: "metro", label: "Metro" },
  { id: "units", label: "Units" },
  { id: "equityRequired", label: "Equity required" },
] as const;

export type LibraryColumnId = (typeof LIBRARY_COLUMNS)[number]["id"];

export type ColumnLayoutItem = { id: LibraryColumnId; visible: boolean };

const IDS = new Set<string>(LIBRARY_COLUMNS.map((column) => column.id));

export function isLibraryColumnId(value: string): value is LibraryColumnId {
  return IDS.has(value);
}

export function defaultColumnLayout(): ColumnLayoutItem[] {
  return LIBRARY_COLUMNS.map((column) => ({ id: column.id, visible: true }));
}

/** Keep unknown ids out, keep new columns at the end, never drop a known column. */
export function normalizeColumnLayout(saved: { id: string; visible?: boolean }[] | null | undefined): ColumnLayoutItem[] {
  const next: ColumnLayoutItem[] = [];
  const seen = new Set<LibraryColumnId>();
  for (const row of saved ?? []) {
    if (!isLibraryColumnId(row.id) || seen.has(row.id)) continue;
    seen.add(row.id);
    next.push({ id: row.id, visible: row.visible !== false });
  }
  for (const column of LIBRARY_COLUMNS) {
    if (!seen.has(column.id)) next.push({ id: column.id, visible: true });
  }
  return next;
}

export function moveColumn(layout: ColumnLayoutItem[], id: LibraryColumnId, direction: -1 | 1): ColumnLayoutItem[] {
  const index = layout.findIndex((row) => row.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= layout.length) return layout;
  const next = layout.slice();
  const [row] = next.splice(index, 1);
  next.splice(target, 0, row!);
  return next;
}

export function columnMeta(id: LibraryColumnId) {
  return LIBRARY_COLUMNS.find((column) => column.id === id)!;
}
