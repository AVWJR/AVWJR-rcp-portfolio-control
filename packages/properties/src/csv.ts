import { dollars } from "@rcp/ledger";
import { canonicalUnitToSnapshot, type NormalizedRentRoll } from "./rent-roll-canonical";
import { normalizeRentRollTable } from "./rent-roll-dialects";
import { type UnitSnapshot } from "./types";
import { CsvParseError, parseCsvLines, parseUsdToCents, splitCsvLine } from "./csv-parse";

export { CsvParseError, parseUsdToCents, splitCsvLine, parseCsvLines } from "./csv-parse";

export const RENT_ROLL_CSV_HEADERS = [
  "unit_id",
  "floorplan",
  "beds",
  "baths",
  "sqft",
  "status",
  "market_rent",
  "in_place_rent",
  "lease_start",
  "lease_end",
  "concession",
] as const;

export const BUDGET_CSV_HEADERS = ["account_code", "amount"] as const;

export type RentRollCsvRow = UnitSnapshot;
export type BudgetCsvRow = { accountCode: string; amount: bigint };

export function parseCsvTable(text: string): { headers: string[]; rows: string[][] } {
  const lines = parseCsvLines(text);
  const headers = (lines[0] ?? []).map((h) => h.toLowerCase());
  const rows = lines.slice(1);
  return { headers, rows };
}

function headerIndex(headers: string[], name: string, line = 1): number {
  const idx = headers.indexOf(name);
  if (idx === -1) {
    throw new CsvParseError(line, `missing required column "${name}"`);
  }
  return idx;
}

export function parseRentRollTable(
  rows: string[][],
  opts: { lenient?: boolean; sourceFilename?: string; sheetName?: string } = {},
): NormalizedRentRoll {
  return normalizeRentRollTable(rows, {
    lenient: opts.lenient,
    sourceFilename: opts.sourceFilename,
    sheetName: opts.sheetName,
  });
}

export function parseRentRollCsv(text: string, opts: { lenient?: boolean } = {}): UnitSnapshot[] {
  const table = parseCsvLines(text);
  const normalized = parseRentRollTable(table, {
    lenient: opts.lenient,
    sourceFilename: "rent-roll.csv",
  });
  return normalized.units.map(canonicalUnitToSnapshot);
}

export function parseBudgetCsv(text: string): BudgetCsvRow[] {
  const { headers, rows } = parseCsvTable(text);
  const codeIdx = headerIndex(headers, "account_code");
  const amtIdx = headerIndex(headers, "amount");
  const seen = new Set<string>();
  return rows.map((cols, i) => {
    const line = i + 2;
    const accountCode = (cols[codeIdx] ?? "").trim();
    if (!/^\d{4}$/.test(accountCode)) {
      throw new CsvParseError(line, `account_code must be a 4-digit CoA code, got "${accountCode}"`);
    }
    if (seen.has(accountCode)) {
      throw new CsvParseError(line, `duplicate account_code ${accountCode}`);
    }
    seen.add(accountCode);
    return { accountCode, amount: parseUsdToCents(cols[amtIdx] ?? "", line, "amount") };
  });
}

function ymd(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

export function serializeRentRollCsv(units: UnitSnapshot[]): string {
  const header = RENT_ROLL_CSV_HEADERS.join(",");
  const rows = units.map((u) =>
    [
      u.unitCode,
      u.floorplan,
      String(u.beds),
      (u.bathsTenths / 10).toFixed(1),
      String(u.sqft),
      u.status,
      centsToCsvDollars(u.marketRent),
      centsToCsvDollars(u.inPlaceRent),
      ymd(u.leaseStart),
      ymd(u.leaseEnd),
      centsToCsvDollars(u.concessionCents),
    ].join(","),
  );
  return [header, ...rows].join("\n") + "\n";
}

export function serializeBudgetCsv(rows: BudgetCsvRow[]): string {
  const header = BUDGET_CSV_HEADERS.join(",");
  const body = rows.map((r) => `${r.accountCode},${centsToCsvDollars(r.amount)}`).join("\n");
  return `${header}\n${body}\n`;
}

export function centsToCsvDollars(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const whole = abs / 100n;
  const frac = abs % 100n;
  const body = `${whole.toString()}.${frac.toString().padStart(2, "0")}`;
  return neg ? `-${body}` : body;
}

/** Whole-dollar helper re-export so seed generators stay on integer cents. */
export { dollars };
