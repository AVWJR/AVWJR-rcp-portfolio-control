import { columnMeta, type ColumnLayoutItem } from "./columns";
import type { LibraryRow } from "./facts";
import { FEE_NEEDED } from "./fees";
import { staleFlagLabel } from "./staleness";

function gapCell(row: LibraryRow): string {
  return row.returnGap ?? (row.feeNeeded ? FEE_NEEDED : "");
}

function irrCell(bps: number | null, note: string | null, row: LibraryRow): string {
  if (bps != null) return ratio(bps, "%");
  return note ?? gapCell(row);
}

function cell(row: LibraryRow, id: ColumnLayoutItem["id"]): string {
  if (id === "dscr") return ratio(row.dscrBps, "x");
  if (id === "debtYield") return ratio(row.debtYieldBps, "%");
  if (id === "capRate") return ratio(row.capRateBps, "%");
  if (id === "ltv") return ratio(row.ltvBps, "%");
  if (id === "cashOnCash") return ratio(row.cashOnCashBps, "%");
  if (id === "lpNetIrr") return irrCell(row.lpNetIrrBps, row.lpIrrNote, row);
  if (id === "lpCashYield") {
    if (row.lpCashYieldBps == null && row.lpYear1CashYieldBps == null) return gapCell(row);
    const year1 = row.lpYear1CashYieldBps == null ? "" : `Y1 ${ratio(row.lpYear1CashYieldBps, "%")}`;
    const avg = row.lpCashYieldBps == null ? "" : `avg ${ratio(row.lpCashYieldBps, "%")}`;
    return [year1, avg].filter(Boolean).join("; ");
  }
  if (id === "rcpIrr") return irrCell(row.rcpIrrBps, row.rcpIrrNote, row);
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

/** Excel treats a leading = + - @ tab or CR as a formula. A leading quote keeps free text as text. */
const FORMULA_START = /^[=+\-@\t\r]/;

export function shieldCsvText(value: string): string {
  if (FORMULA_START.test(value)) return `'${value}`;
  return value;
}

function escape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

const TEXT_COLUMNS = new Set<ColumnLayoutItem["id"]>(["metro", "lpCashYield"]);

export function libraryTable(rows: LibraryRow[], layout: ColumnLayoutItem[]): string[][] {
  const visible = layout.filter((column) => column.visible);
  const header = ["Deal", "Code", "Status", "Analysis", ...visible.map((column) => columnMeta(column.id).label)];
  const body = rows.map((row) => {
    const stale = staleFlagLabel(row.stale) ?? "Current";
    return [row.name, row.code, row.statusLabel, stale, ...visible.map((column) => cell(row, column.id))];
  });
  return [header, ...body];
}

/** CSV of the current view. Does not delete anything. */
export function libraryCsv(rows: LibraryRow[], layout: ColumnLayoutItem[]): string {
  const table = libraryTable(rows, layout);
  const visible = layout.filter((column) => column.visible);
  const lines = [table[0]!.join(",")];
  for (const values of table.slice(1)) {
    lines.push(
      values
        .map((value, index) => {
          const column = visible[index - 4];
          const text = index < 4 || (column != null && TEXT_COLUMNS.has(column.id));
          return escape(text ? shieldCsvText(value) : value);
        })
        .join(","),
    );
  }
  return lines.join("\n");
}
