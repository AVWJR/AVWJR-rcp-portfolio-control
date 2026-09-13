import { dollars } from "@rcp/ledger";
import { type UnitSnapshot } from "./types";
import { couldNotMapColumnsMessage, findRentRollHeader, parseMappedRentRollRows } from "./rent-roll-map";

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

export class CsvParseError extends Error {
  readonly line: number;
  constructor(line: number, message: string) {
    super(`CSV line ${line}: ${message}`);
    this.name = "CsvParseError";
    this.line = line;
  }
}

/** Split a single CSV line; supports quoted fields with commas. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCsvTable(text: string): { headers: string[]; rows: string[][] } {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  if (lines.length === 0) {
    throw new CsvParseError(0, "file is empty");
  }
  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const rows = lines.slice(1).map(splitCsvLine);
  return { headers, rows };
}

function headerIndex(headers: string[], name: string, line = 1): number {
  const idx = headers.indexOf(name);
  if (idx === -1) {
    throw new CsvParseError(line, `missing required column "${name}"`);
  }
  return idx;
}

/** Dollars in CSV (1285, $1,285.00, (1,250.00), 1250.000) → integer cents. */
export function parseUsdToCents(raw: string, line: number, field: string): bigint {
  let text = raw.replace(/[$,\s]/g, "").replace(/[—–−]/g, "-");
  if (text === "" || text === "-" || /^n\/?a$/i.test(text)) return 0n;
  let sign = 1n;
  if (/^\(.*\)$/.test(text)) {
    sign = -1n;
    text = text.slice(1, -1).replace(/[$,\s]/g, "");
  }
  const match = text.match(/^(-)?(\d+)(?:\.(\d+))?$/);
  if (!match) {
    throw new CsvParseError(line, `${field} is not a USD amount: "${raw}"`);
  }
  if (match[1] === "-") sign = -sign;
  const whole = BigInt(match[2]);
  const frac = (match[3] ?? "00").padEnd(2, "0").slice(0, 2);
  return sign * (whole * 100n + BigInt(frac));
}

export function parseRentRollCsv(text: string, opts: { lenient?: boolean } = {}): UnitSnapshot[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  if (lines.length === 0) {
    throw new CsvParseError(0, "file is empty");
  }
  const table = lines.map(splitCsvLine);
  const found = findRentRollHeader(table);
  if (!found) {
    throw new CsvParseError(1, couldNotMapColumnsMessage((table[0] ?? []).filter(Boolean), ["unit"]));
  }
  const headers = found.headers;
  const canonical = headers.map((h) => h.toLowerCase());
  const isCanonical = canonical.includes("unit_id") && canonical.includes("market_rent");
  return parseMappedRentRollRows(headers, table.slice(found.index + 1), {
    lenient: opts.lenient ?? !isCanonical,
  });
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
