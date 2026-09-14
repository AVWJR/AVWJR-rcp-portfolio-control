import { utils, write } from "xlsx";
import {
  canonicalChargeSheetRows,
  canonicalUnitSheetRows,
  metaSheetRows,
  type NormalizedRentRoll,
} from "@rcp/properties";

export const CANONICAL_WORKBOOK_FILENAME = "rent-roll-canonical.xlsx";

function safeSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Sheet";
  let candidate = base;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = `_${i}`;
    candidate = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    i += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export function buildCanonicalRentRollWorkbook(opts: {
  normalized: NormalizedRentRoll;
  originalSheets: { name: string; rows: string[][] }[];
  selectedSheet?: string;
}): Buffer {
  const wb = utils.book_new();
  const used = new Set<string>();
  const append = (rows: string[][], name: string) => {
    const sheetName = safeSheetName(name, used);
    utils.book_append_sheet(wb, utils.aoa_to_sheet(rows.length ? rows : [[""]]), sheetName);
  };

  append(canonicalUnitSheetRows(opts.normalized), "Canonical");
  append(canonicalChargeSheetRows(opts.normalized), "Charge Detail");
  append(metaSheetRows(opts.normalized), "Meta");

  const selected = opts.selectedSheet;
  const original =
    opts.originalSheets.find((sheet) => sheet.name === selected) ?? opts.originalSheets[0];
  if (original) append(original.rows, "Original");
  for (const sheet of opts.originalSheets) {
    if (sheet === original) continue;
    append(sheet.rows, `Src ${sheet.name}`.slice(0, 31));
  }

  return Buffer.from(write(wb, { type: "buffer", bookType: "xlsx" }));
}
