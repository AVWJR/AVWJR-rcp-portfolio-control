import { isStatementTotalLabel, mapNormalizedLabel, normalizeVendorLabel } from "./coa-crosswalk";
import { parseUsdToCents } from "./csv";

export type T12MappedLine = {
  label: string;
  accountCode: string;
  t12Cents: bigint;
  monthlyAverageCents: bigint;
};

export type T12WorkbookParse = {
  sheet: string;
  monthCount: number;
  detectedHeaders: string[];
  lines: T12MappedLine[];
  gpr: bigint;
  vacancy: bigint;
  concessions: bigint;
  otherIncome: bigint;
  egi: bigint;
  opex: bigint;
  noi: bigint;
  unmapped: string[];
};

const SKIP_LABEL =
  /^(income|expense|expenses|operating expenses|revenue|revenues|other|totals?|subtotals?|net operating|noi|egi|egr|effective gross|net income|ebitda|below noi|debt service|cap(?:ital)? ex|depreciation|amortization)$/i;

const OTHER_INCOME_CODES = ["4100", "4110", "4120", "4130", "4140", "4150", "4160", "4170", "4180", "4190"] as const;
const OPEX_CODES = ["5110", "5120", "5210", "5220", "5310", "5320", "5330", "5340", "5350", "5410", "5510", "5610", "5710", "5810", "5910", "5990"] as const;

/** Yardi cash-book prefixes (4022-000 Unit Rent) → RCP CoA. */
export function mapYardiCodeToAccount(code: string, label = ""): string | null {
  const n = Number(code);
  if (!Number.isInteger(n)) return null;
  const hay = `${code} ${label}`;
  if (/loss to lease|gain to lease|\bltl\b/i.test(hay)) return "4015";
  if (n >= 4022 && n <= 4029) return "4010";
  if (n >= 4000 && n <= 4019) return "4010";
  if (n >= 4030 && n <= 4034) return /concession|free rent/i.test(hay) ? "4030" : "4020";
  if (n >= 4035 && n <= 4039) return "4030";
  if (n >= 4100 && n <= 4199) return "4100";
  if (n >= 5100 && n <= 5199) return "5110";
  if (n >= 5200 && n <= 5299) return "5210";
  if (n >= 5300 && n <= 5399) return "5310";
  if (n >= 5400 && n <= 5499) return "5410";
  if (n >= 5500 && n <= 5599) return "5510";
  if (n >= 5600 && n <= 5699) return "5610";
  if (n >= 5700 && n <= 5799) return "5710";
  if (n >= 5800 && n <= 5899) return "5810";
  if (n >= 5900 && n <= 5919) return "5910";
  if (n >= 5920 && n <= 5999) return "5990";
  if (n >= 6100 && n <= 6199) return "6110";
  return null;
}

function stripYardiPrefix(label: string): { code: string | null; rest: string } {
  const match = label.match(/^(\d{4})(?:-\d{3})?\s*(.*)$/);
  if (!match) return { code: null, rest: label };
  return { code: match[1]!, rest: match[2] ?? "" };
}

const MONTH_HEADER =
  /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(\s|-|\/)?(\d{2,4})?$/i;

function normalizeLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function mapT12LabelToAccount(label: string): string | null {
  const text = normalizeLabel(label);
  if (!text) return null;
  const { code: yardi, rest } = stripYardiPrefix(text);
  const desc = normalizeLabel(rest || text);
  if (SKIP_LABEL.test(desc) || SKIP_LABEL.test(text) || isStatementTotalLabel(desc)) return null;
  const mapped = mapNormalizedLabel(normalizeVendorLabel(desc));
  if (mapped.accountCode && !mapped.balanceSheet) return mapped.accountCode;
  if (yardi) return mapYardiCodeToAccount(yardi, desc);
  return mapped.accountCode;
}

function cellLooksLikeMonth(raw: string): boolean {
  const v = raw.trim().split(/\n/)[0]?.trim() ?? "";
  if (!v) return false;
  if (MONTH_HEADER.test(v)) return true;
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(v)) return true;
  if (/^\d{1,2}[./-]\d{4}$/.test(v) || /^\d{4}-\d{2}/.test(v)) return true;
  return false;
}

function headerLooksLikeMonths(cells: string[]): number[] {
  const idxs: number[] = [];
  cells.forEach((cell, i) => {
    if (cellLooksLikeMonth(cell)) idxs.push(i);
  });
  return idxs;
}

function findT12Header(rows: string[][]): { index: number; months: number[]; totalCol: number | null; labelCol: number } | null {
  for (let i = 0; i < Math.min(rows.length, 30); i += 1) {
    const row = rows[i] ?? [];
    const months = headerLooksLikeMonths(row);
    if (months.length >= 2) {
      const totalCol = row.findIndex((cell) => /^(t12|total|ttm|trailing)/i.test(cell.trim()));
      const labelCol = row.findIndex((cell) => /account|description|line|name/i.test(cell.trim()));
      return { index: i, months, totalCol: totalCol >= 0 ? totalCol : null, labelCol: labelCol >= 0 ? labelCol : 0 };
    }
  }
  return null;
}

function lineAmount(cols: string[], months: number[], totalCol: number | null, line: number): { t12: bigint; monthCount: number } {
  if (totalCol != null && (cols[totalCol] ?? "").trim()) {
    try {
      return { t12: absCents(parseUsdToCents(cols[totalCol] ?? "0", line, "t12")), monthCount: months.length || 12 };
    } catch {
      // fall through to monthly sum
    }
  }
  let sum = 0n;
  let count = 0;
  for (const idx of months) {
    const raw = (cols[idx] ?? "").trim();
    if (!raw) continue;
    try {
      sum += absCents(parseUsdToCents(raw, line, "month"));
      count += 1;
    } catch {
      // skip a single unreadable month
    }
  }
  return { t12: sum, monthCount: count || months.length || 12 };
}

function absCents(value: bigint): bigint {
  return value < 0n ? -value : value;
}

const MONTH_NUMBER: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/** Month (and optional year) from a T12 column header. */
export function monthFromHeader(raw: string): { month: number; year: number | null } | null {
  const value = raw.trim().split(/\n/)[0]?.trim() ?? "";
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{2})/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]) };
  const named = value.match(
    /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)/i,
  );
  if (named) {
    const month = MONTH_NUMBER[named[1]!.slice(0, 3).toLowerCase()];
    const year4 = value.match(/(20\d{2}|19\d{2})/);
    return { month: month ?? 0, year: year4 ? Number(year4[1]) : null };
  }
  const slash = value.match(/^(\d{1,2})[./-](\d{4})$/);
  if (slash) return { month: Number(slash[1]), year: Number(slash[2]) };
  return null;
}

export type T12MonthLine = {
  label: string;
  accountCode: string | null;
  /** Null when the close-month cell is blank or not a number. */
  cents: bigint | null;
};

function isNonActivityHeader(raw: string): boolean {
  return /budget|\bplan\b|variance|\bvar\b|\bytd\b|year to date|\bt12\b|\bttm\b|trailing/i.test(raw);
}

/** Close-month activity column, including an "Aug Actual" header. Budget, variance, YTD, and T12 totals are not activity. */
function matchesCloseMonth(raw: string, year: number, month: number): boolean {
  if (isNonActivityHeader(raw)) return false;
  const parsed = monthFromHeader(raw);
  if (!parsed || parsed.month !== month) return false;
  if (parsed.year != null && parsed.year !== year) return false;
  if (cellLooksLikeMonth(raw)) return true;
  return /\bactuals?\b|\bmtd\b|\bcurrent\b/i.test(raw);
}

function findCloseMonthColumn(
  rows: string[][],
  year: number,
  month: number,
): { index: number; col: number; headerText: string; labelCol: number } | null {
  const classic = findT12Header(rows);
  if (classic) {
    const headers = rows[classic.index] ?? [];
    const order = [...classic.months];
    headers.forEach((_, idx) => {
      if (!order.includes(idx)) order.push(idx);
    });
    for (const idx of order) {
      const raw = headers[idx] ?? "";
      if (!matchesCloseMonth(raw, year, month)) continue;
      return { index: classic.index, col: idx, headerText: raw.trim(), labelCol: classic.labelCol };
    }
    return null;
  }
  for (let i = 0; i < Math.min(rows.length, 30); i += 1) {
    const row = rows[i] ?? [];
    const idx = row.findIndex((cell) => matchesCloseMonth(cell, year, month));
    if (idx < 0) continue;
    const labelCol = row.findIndex((cell) => /account|description|line|name/i.test(String(cell)));
    if (labelCol < 0 && !/\bactuals?\b/i.test(row[idx] ?? "")) continue;
    return { index: i, col: idx, headerText: String(row[idx] ?? "").trim(), labelCol: labelCol >= 0 ? labelCol : 0 };
  }
  return null;
}

/** Amounts from the close-month column. Does not divide the T12 total. */
export function t12CloseMonthLines(
  rows: string[][],
  year: number,
  month: number,
): { header: string | null; lines: T12MonthLine[] } {
  const header = findCloseMonthColumn(rows, year, month);
  if (!header) return { header: null, lines: [] };
  const lines: T12MonthLine[] = [];
  for (let i = header.index + 1; i < rows.length; i += 1) {
    const cols = rows[i] ?? [];
    const label = normalizeLabel(cols[header.labelCol] ?? cols[0] ?? "");
    if (!label || SKIP_LABEL.test(label) || isStatementTotalLabel(label)) continue;
    const raw = (cols[header.col] ?? "").trim();
    const accountCode = mapT12LabelToAccount(label);
    if (!raw) {
      lines.push({ label, accountCode, cents: null });
      continue;
    }
    try {
      lines.push({ label, accountCode, cents: parseUsdToCents(raw, i + 1, "month") });
    } catch {
      lines.push({ label, accountCode, cents: null });
    }
  }
  return { header: header.headerText, lines };
}

export function parseT12WorkbookRows(rows: string[][], sheet: string): T12WorkbookParse {
  const header = findT12Header(rows);
  const detected = (header ? rows[header.index] : rows[0] ?? []).filter((c) => c.trim());
  if (!header) {
    throw new Error(`could not map columns: T12 months. Detected headers: ${detected.join(", ") || "(none)"}`);
  }

  const byCode = new Map<string, T12MappedLine>();
  const unmapped: string[] = [];
  let monthCount = header.months.length;

  rows.slice(header.index + 1).forEach((cols, i) => {
    const primary = cols[header.labelCol] ?? cols[0] ?? "";
    const next = header.labelCol === 0 && cols[1] && !cellLooksLikeMonth(cols[1]) && !/^(t12|total)/i.test(cols[1]) ? cols[1] : "";
    const label = normalizeLabel(next && !primary.includes(next) ? `${primary} ${next}` : primary);
    if (!label || SKIP_LABEL.test(stripYardiPrefix(label).rest || label)) return;
    const code = mapT12LabelToAccount(label);
    if (!code) {
      if (!/^(total|noi|egi|income|expense)/i.test(label)) unmapped.push(label);
      return;
    }
    const { t12, monthCount: used } = lineAmount(cols, header.months, header.totalCol, i + header.index + 2);
    monthCount = Math.max(monthCount, used);
    const existing = byCode.get(code);
    if (existing) {
      existing.t12Cents += t12;
      existing.monthlyAverageCents = monthCount ? existing.t12Cents / BigInt(monthCount) : existing.t12Cents;
      existing.label = `${existing.label}; ${label}`;
      return;
    }
    byCode.set(code, {
      label,
      accountCode: code,
      t12Cents: t12,
      monthlyAverageCents: monthCount ? t12 / BigInt(monthCount) : t12,
    });
  });

  const lines = [...byCode.values()];
  if (!lines.length) {
    throw new Error(`could not map columns: T12 operating lines. Detected headers: ${detected.join(", ") || "(none)"}`);
  }

  const amount = (code: string) => byCode.get(code)?.t12Cents ?? 0n;
  const sumCodes = (codes: readonly string[]) => codes.reduce((acc, code) => acc + amount(code), 0n);
  const gpr = amount("4010");
  const lossToLease = amount("4015");
  const vacancy = amount("4020");
  const concessions = amount("4030");
  const nonRevenue = amount("4040");
  const badDebt = amount("4050");
  const otherIncome = sumCodes(OTHER_INCOME_CODES);
  const egi = gpr - lossToLease - vacancy - concessions - nonRevenue - badDebt + otherIncome;
  const opex = sumCodes(OPEX_CODES);
  return {
    sheet,
    monthCount,
    detectedHeaders: detected,
    lines,
    gpr,
    vacancy,
    concessions,
    otherIncome,
    egi,
    opex,
    noi: egi - opex,
    unmapped,
  };
}

export function t12ParseToBudgetRows(parsed: T12WorkbookParse): { accountCode: string; amount: bigint }[] {
  return parsed.lines
    .filter((line) => line.monthlyAverageCents !== 0n)
    .map((line) => ({ accountCode: line.accountCode, amount: line.monthlyAverageCents }));
}
