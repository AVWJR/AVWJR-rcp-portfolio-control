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

const ACCOUNT_ALIASES: { code: string; re: RegExp }[] = [
  { code: "4010", re: /\b(gpr|gross potential|potential rent|apartment rent|residential rent|rental income|base rent|gross rent)\b/i },
  { code: "4020", re: /\b(vacancy|vacancy loss|loss to vacancy)\b/i },
  { code: "4030", re: /\b(concessions?|free rent|loss to lease|ltl)\b/i },
  { code: "4100", re: /\b(other income|laundry|parking|pet(s)? fee|misc(?:ellaneous)? income|utility reimb|ancillary)\b/i },
  { code: "5110", re: /\b(payroll|salar|wage|bonus|benefits?)\b/i },
  { code: "5210", re: /\b(repair|maintenance|make.?ready|turnover|unit turn|r&m)\b/i },
  { code: "5310", re: /\b(utilit|electric|water|sewer|gas|trash|cable)/i },
  { code: "5410", re: /\b(contract|landscap|pest|security|elevator|hvac contract)\b/i },
  { code: "5510", re: /\b(marketing|advertis|promotion)\b/i },
  { code: "5610", re: /\b(admin|office|legal|professional|telephone|software)/i },
  { code: "5710", re: /\b(insurance)\b/i },
  { code: "5810", re: /\b(real estate tax|property tax|taxes)\b/i },
  { code: "5910", re: /\b(management fee|pm fee|property manag)/i },
  { code: "5990", re: /\b(other (opex|operating|expense)|miscellaneous expense)\b/i },
  { code: "6110", re: /\b(interest|mortgage interest)\b/i },
];

const MONTH_HEADER =
  /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(\s|-|\/)?(\d{2,4})?$/i;

function normalizeLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function mapT12LabelToAccount(label: string): string | null {
  const text = normalizeLabel(label);
  if (!text || SKIP_LABEL.test(text)) return null;
  for (const row of ACCOUNT_ALIASES) {
    if (row.re.test(text)) return row.code;
  }
  return null;
}

function headerLooksLikeMonths(cells: string[]): number[] {
  const idxs: number[] = [];
  cells.forEach((cell, i) => {
    const v = cell.trim();
    if (!v) return;
    if (MONTH_HEADER.test(v)) idxs.push(i);
    else if (/^\d{1,2}[./-]\d{4}$/.test(v) || /^\d{4}-\d{2}/.test(v)) idxs.push(i);
  });
  return idxs;
}

function findT12Header(rows: string[][]): { index: number; months: number[]; totalCol: number | null; labelCol: number } | null {
  for (let i = 0; i < Math.min(rows.length, 20); i += 1) {
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
    const label = normalizeLabel(cols[header.labelCol] ?? cols[0] ?? "");
    if (!label || SKIP_LABEL.test(label)) return;
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
  const gpr = amount("4010");
  const vacancy = amount("4020");
  const concessions = amount("4030");
  const otherIncome = amount("4100");
  const egi = gpr - vacancy - concessions + otherIncome;
  const opex = (["5110", "5210", "5310", "5410", "5510", "5610", "5710", "5810", "5910", "5990"] as const).reduce(
    (acc, code) => acc + amount(code),
    0n,
  );
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
