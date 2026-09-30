import { columnMeta, type ColumnLayoutItem } from "./columns";
import type { LibraryRow } from "./facts";
import { FEE_NEEDED } from "./fees";
import { staleFlagLabel } from "./staleness";

function cell(row: LibraryRow, id: ColumnLayoutItem["id"]): string {
  const phase = "Phase 2";
  if (id === "dscr") return ratio(row.dscrBps, "x");
  if (id === "debtYield") return ratio(row.debtYieldBps, "%");
  if (id === "capRate") return ratio(row.capRateBps, "%");
  if (id === "ltv") return ratio(row.ltvBps, "%");
  if (id === "cashOnCash") return ratio(row.cashOnCashBps, "%");
  if (id === "lpNetIrr" || id === "lpCashYield") return row.feeNeeded ? `${phase}; ${FEE_NEEDED}` : phase;
  if (id === "rcpIrr") return phase;
  if (id === "pricePerUnit") return money(row.pricePerUnitCents);
  if (id === "occupancy") return ratio(row.occupancyBps, "%");
  if (id === "metro") return row.metro ?? "";
  if (id === "units") return row.unitCount == null ? "" : String(row.unitCount);
  if (id === "equityRequired") return money(row.equityRequiredCents);
  return "";
}

function ratio(bps: number | null, unit: "x" | "%"): string {
  if (bps == null) return "";
  if (unit === "x") return (bps / 10_000).toFixed(2);
  return (bps / 100).toFixed(2);
}

function money(cents: number | null): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

function escape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** CSV of the current view. Does not delete anything. */
export function libraryCsv(rows: LibraryRow[], layout: ColumnLayoutItem[]): string {
  const visible = layout.filter((column) => column.visible);
  const header = ["Deal", "Code", "Status", "Analysis", ...visible.map((column) => columnMeta(column.id).label)];
  const lines = [header.join(",")];
  for (const row of rows) {
    const stale = staleFlagLabel(row.stale) ?? "Current";
    lines.push(
      [row.name, row.code, row.statusLabel, stale, ...visible.map((column) => cell(row, column.id))].map(escape).join(","),
    );
  }
  return lines.join("\n");
}
