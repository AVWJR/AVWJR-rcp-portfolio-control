import { createHash } from "node:crypto";
import { inferFileRole } from "@/lib/deals/infer";
import { MASTER_COA_BY_CODE } from "@rcp/ledger";
import {
  isStatementTotalLabel,
  mapNormalizedLabel,
  normalizeVendorLabel,
  parseCsvLines,
  parseUsdToCents,
  t12CloseMonthLines,
  type MapConfidence,
} from "@rcp/properties";
import { read, utils } from "xlsx";

export type CloseFileClass =
  | "rent_roll"
  | "t12"
  | "income_statement"
  | "balance_sheet"
  | "gl_detail"
  | "budget"
  | "pdf"
  | "other";

export type ParsedCloseLine = {
  sourceLabel: string;
  sourceAccountNo: string;
  accountCode: string | null;
  signedCents: string;
  confidence: MapConfidence;
  balanceSheet: boolean;
  /** Set when the row has a label but the amount column could not be read. */
  flag?: string;
  budgetCents?: string | null;
  varianceCents?: string | null;
  ytdCents?: string | null;
};

export type ImportControl = {
  sourceNoiCents: string | null;
  mappedNoiCents: string;
  noiTies: boolean;
  sourceNetIncomeCents: string | null;
  mappedNetIncomeCents: string;
  netIncomeTies: boolean;
  blocksPosting: boolean;
  detail: string;
};

export type ClassifiedCloseFile = {
  classification: CloseFileClass;
  lines: ParsedCloseLine[];
  unmapped: string[];
  flagged: string[];
  note: string;
  control: ImportControl;
};

export type CloseParseOptions = {
  classification?: CloseFileClass;
  year?: number;
  month?: number;
};

const CONTRA_DEBIT = new Set(["4020", "4030", "4040", "4050"]);
const NOI_GROUPS = new Set(["ltl", "vacancy", "concessions", "nru", "bad_debt"]);

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export { sha256 };

/** Underscores are separators, so WBG_PnL_Aug and WBG_P&L_Aug match after lowercasing. */
function looksLikeIncomeStatementName(filename: string): boolean {
  const lower = filename.toLowerCase();
  if (/t-?12|trailing/.test(lower)) return false;
  const hay = lower.replace(/_+/g, " ");
  return /income statement|profit|p&l|p-l|\bpnl\b|\bp l\b|operating statement/.test(hay);
}

export function classifyCloseFile(filename: string, bytes?: Buffer): CloseFileClass {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (/balance[\s_-]*sheet|\btrial balance\b/.test(lower)) return "balance_sheet";
  if (/general ledger|gl detail|gl_detail|transaction detail/.test(lower)) return "gl_detail";
  if (looksLikeIncomeStatementName(filename)) {
    return "income_statement";
  }
  const role = inferFileRole(filename, bytes);
  if (role === "rent_roll_csv") return "rent_roll";
  if (role === "t12_pl") return "t12";
  if (role === "budget_csv") return "budget";
  return "other";
}

function splitAccount(label: string): { sourceAccountNo: string; rest: string } {
  const match = label.match(/^(\d{3,6})(?:-\d{3})?\s+(.*)$/);
  if (!match) return { sourceAccountNo: "", rest: label.trim() };
  return { sourceAccountNo: match[1] ?? "", rest: (match[2] ?? label).trim() };
}

const MIRROR_CODES = new Set(["1310", "2310", "6310", "7010"]);

/**
 * Words that show up on many unrelated lines. Sharing only these with an RCP
 * account name is not agreement. `1010 Operating Account` stays unmapped:
 * both words are generic, and the caption does not include every word of
 * Cash — Operating.
 */
const GENERIC_CAPTION_WORDS = new Set([
  "operating",
  "account",
  "accounts",
  "expense",
  "expenses",
  "income",
  "total",
  "other",
  "net",
  "payable",
  "receivable",
  "related",
  "parties",
  "cash",
  "flow",
  "adjustment",
  "due",
]);

type MappedLabel = { accountCode: string | null; confidence: MapConfidence; balanceSheet: boolean };

function contentWords(value: string): string[] {
  return normalizeVendorLabel(value)
    .split(" ")
    .filter((word) => word.length > 2 && word !== "and");
}

function chartNameAgrees(accountName: string, text: string): boolean {
  const name = normalizeVendorLabel(accountName);
  const label = normalizeVendorLabel(text);
  return Boolean(label) && label === name;
}

function isIncomeStatementCode(code: string | null | undefined): boolean {
  return Boolean(code && /^[4-7]/.test(code));
}

function balanceSheetAccount(account: { type: string } | undefined): boolean {
  return account != null && account.type !== "REVENUE" && account.type !== "EXPENSE";
}

/** A distinctive account word, or every word of the account name, including generic ones. */
function captionHasDistinctiveOrEveryWord(accountName: string, text: string): boolean {
  const nameWords = contentWords(accountName);
  const labelWords = new Set(contentWords(text));
  if (!nameWords.length) return false;
  const distinctive = nameWords.filter((word) => !GENERIC_CAPTION_WORDS.has(word));
  if (distinctive.some((word) => labelWords.has(word))) return true;
  return nameWords.every((word) => labelWords.has(word));
}

function chartAccount(sourceAccountNo: string) {
  if (!sourceAccountNo || !MASTER_COA_BY_CODE.has(sourceAccountNo)) return undefined;
  return MASTER_COA_BY_CODE.get(sourceAccountNo);
}

/** Chart-name equality, or a label rule that names this same account. */
function leadingAgreement(sourceAccountNo: string, text: string, balanceSheetFile: boolean): MappedLabel | null {
  const account = chartAccount(sourceAccountNo);
  if (!account) return null;
  if (balanceSheetFile && isIncomeStatementCode(sourceAccountNo)) return null;
  const rule = mapNormalizedLabel(text);
  const ruleAgrees = rule.accountCode === sourceAccountNo && !(balanceSheetFile && isIncomeStatementCode(rule.accountCode));
  if (!chartNameAgrees(account.name, text) && !ruleAgrees) return null;
  return {
    accountCode: sourceAccountNo,
    confidence: "EXACT",
    balanceSheet: balanceSheetAccount(account),
  };
}

/**
 * No label rule matched. Use the leading number only when the caption shares a
 * distinctive word with that balance-sheet account, or contains every word of
 * its name. These lines need review — the match is not exact.
 */
function leadingFallback(sourceAccountNo: string, text: string, balanceSheetFile: boolean): MappedLabel | null {
  const account = chartAccount(sourceAccountNo);
  if (!account || !balanceSheetAccount(account)) return null;
  if (MIRROR_CODES.has(sourceAccountNo) || sourceAccountNo === "1999") return null;
  const rule = mapNormalizedLabel(text);
  const ruleBlocks = Boolean(rule.accountCode) && !(balanceSheetFile && isIncomeStatementCode(rule.accountCode));
  if (ruleBlocks || !captionHasDistinctiveOrEveryWord(account.name, text)) return null;
  return { accountCode: sourceAccountNo, confidence: "CONTEXT", balanceSheet: true };
}

/** Balance-sheet captions that the income-statement rules would send to 4xxx–7xxx. */
function preferBalanceSheetAccount(text: string): MappedLabel | null {
  const label = normalizeVendorLabel(text);
  if (/security deposit/.test(label)) return { accountCode: "2050", confidence: "RULE", balanceSheet: true };
  if (/prepaid rent/.test(label)) return { accountCode: "2040", confidence: "RULE", balanceSheet: true };
  if (/\bprepaid\b/.test(label)) return { accountCode: "1210", confidence: "RULE", balanceSheet: true };
  if (/accrued interest|\binterest payable\b/.test(label)) return { accountCode: "2030", confidence: "RULE", balanceSheet: true };
  if (/\baccru/.test(label)) return { accountCode: "2020", confidence: "RULE", balanceSheet: true };
  return null;
}

function mapBalanceSheetLabel(sourceAccountNo: string, text: string): MappedLabel {
  const agreed = leadingAgreement(sourceAccountNo, text, true);
  if (agreed) return agreed;
  const ruled = mapNormalizedLabel(text, undefined, (code) => !isIncomeStatementCode(code));
  if (ruled.accountCode) {
    return { accountCode: ruled.accountCode, confidence: "RULE", balanceSheet: true };
  }
  const preferred = preferBalanceSheetAccount(text);
  if (preferred) return preferred;
  const fallback = leadingFallback(sourceAccountNo, text, true);
  if (fallback) return fallback;
  return { accountCode: null, confidence: "NONE", balanceSheet: true };
}

export function mapStatementLabel(
  label: string,
  client?: { accountCode: string } | null,
  options?: { balanceSheet?: boolean },
): MappedLabel {
  if (client?.accountCode && MASTER_COA_BY_CODE.has(client.accountCode)) {
    return { accountCode: client.accountCode, confidence: "CLIENT_MAP", balanceSheet: false };
  }
  const { sourceAccountNo, rest } = splitAccount(label);
  const text = rest || label;
  if (MASTER_COA_BY_CODE.has(rest) && !(options?.balanceSheet && isIncomeStatementCode(rest))) {
    return { accountCode: rest, confidence: "EXACT", balanceSheet: false };
  }
  if (options?.balanceSheet) return mapBalanceSheetLabel(sourceAccountNo, text);
  const agreed = leadingAgreement(sourceAccountNo, text, false);
  if (agreed) return agreed;
  const fallback = leadingFallback(sourceAccountNo, text, false);
  if (fallback) return fallback;
  const hit = mapNormalizedLabel(text);
  return { accountCode: hit.accountCode, confidence: hit.confidence, balanceSheet: hit.balanceSheet };
}

export const EMPTY_BALANCE_SHEET_MESSAGE =
  "This balance sheet has no usable amount, so posting is blocked.";

/** A balance sheet with no lines, or only zeros and unreadable amounts, cannot post. */
export function balanceSheetLacksUsableAmount(lines: ParsedCloseLine[]): boolean {
  return !lines.some((line) => {
    if (line.flag) return false;
    try {
      return BigInt(line.signedCents) !== 0n;
    } catch {
      return false;
    }
  });
}

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function normHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

type ColumnRole = "label" | "actual" | "budget" | "var" | "ytd" | "debit" | "credit" | "balance" | "amount" | "other" | "blank";

function monthNumberInHeader(text: string): number | null {
  for (let i = 0; i < MONTH_NAMES.length; i += 1) {
    const full = MONTH_NAMES[i]!;
    const short = full.slice(0, 3);
    const extra = full === "september" ? "|sept" : "";
    if (new RegExp(`\\b(${full}|${short}${extra})\\b`).test(text)) return i + 1;
  }
  return null;
}

function yearInHeader(text: string): number | null {
  const match = text.match(/\b(?:19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

/** A month-named actual column counts only for that close month. "Aug Actual" is August, not every month. */
function activityHeaderMatchesPeriod(text: string, period?: { year: number; month: number }): boolean {
  if (!period) return true;
  const namedMonth = monthNumberInHeader(text);
  const namedYear = yearInHeader(text);
  if (namedMonth != null && namedMonth !== period.month) return false;
  if (namedYear != null && namedYear !== period.year) return false;
  return true;
}

function columnRole(header: string, period?: { year: number; month: number }): ColumnRole {
  const text = normHeader(header);
  if (!text) return "blank";
  if (text.includes("budget") || text === "plan" || text === "bdgt") return "budget";
  if (text === "var" || text.startsWith("var ") || text.includes("variance")) return "var";
  if (text.includes("ytd") || text.includes("year to date")) return "ytd";
  if (text === "debit" || text === "debits") return "debit";
  if (text === "credit" || text === "credits") return "credit";
  if (text.includes("balance") || text.includes("running")) return "balance";
  if (text === "actual" || text === "actuals" || text === "mtd" || text === "current period") {
    return "actual";
  }
  if (
    (text.endsWith(" actual") || text.endsWith(" actuals")) &&
    activityHeaderMatchesPeriod(text, period)
  ) {
    return "actual";
  }
  if (/account|description|line item|label|name/.test(text) && !/account no/.test(text)) return "label";
  if (text === "amount" || text === "amt" || text === "period amount") return "amount";
  if (period) {
    const name = MONTH_NAMES[period.month - 1] ?? "";
    const short = name.slice(0, 3);
    const ym = `${period.year} ${String(period.month).padStart(2, "0")}`;
    const compact = text.replace(/\s+/g, "");
    if (
      text === name ||
      text === short ||
      text.startsWith(`${name} `) ||
      text.startsWith(`${short} `) ||
      compact.includes(`${period.year}${String(period.month).padStart(2, "0")}`) ||
      text.includes(ym)
    ) {
      return "actual";
    }
  }
  return "other";
}

function looksLikeHeader(row: string[], period?: { year: number; month: number }): boolean {
  const roles = row.map((cell) => columnRole(cell, period));
  const interesting = roles.filter((role) =>
    ["actual", "budget", "var", "ytd", "debit", "credit", "balance", "amount"].includes(role),
  );
  return interesting.length >= 2 || roles.includes("actual") || (roles.includes("debit") && roles.includes("credit"));
}

function readAmount(raw: string, line: number): bigint | null {
  const text = raw.trim();
  if (!text || /^[a-z\s%]+$/i.test(text)) return null;
  try {
    return parseUsdToCents(text, line, "amount");
  } catch {
    return null;
  }
}

function contraDebit(code: string | null, amount: bigint): bigint {
  if (!code || !CONTRA_DEBIT.has(code)) return amount;
  return amount < 0n ? -amount : amount;
}

type MatrixMode = "statement" | "gl" | "balance";

export function rowsFromMatrix(
  rows: string[][],
  opts: { period?: { year: number; month: number }; mode?: MatrixMode } = {},
): { lines: ParsedCloseLine[]; controlRows: { kind: "noi" | "net_income"; cents: bigint }[] } {
  const mode = opts.mode ?? "statement";
  const headerIndex = rows.findIndex((row) => looksLikeHeader(row, opts.period));
  const header = headerIndex >= 0 ? rows[headerIndex]! : [];
  const roles = header.map((cell) => columnRole(cell, opts.period));
  const indexOf = (role: ColumnRole) => roles.indexOf(role);
  const actualIdx = indexOf("actual") >= 0 ? indexOf("actual") : indexOf("amount");
  const debitIdx = indexOf("debit");
  const creditIdx = indexOf("credit");
  const labelIdx = indexOf("label");
  const body = headerIndex >= 0 ? rows.slice(headerIndex + 1) : rows;
  const lines: ParsedCloseLine[] = [];
  const controlRows: { kind: "noi" | "net_income"; cents: bigint }[] = [];

  body.forEach((row, offset) => {
    const cells = row.map((cell) => String(cell ?? "").trim());
    if (cells.every((cell) => !cell)) return;
    const labelCell =
      (labelIdx >= 0 ? cells[labelIdx] : "") ||
      cells.find((cell) => /[a-z]/i.test(cell) && !/^[\d$(),.\-]+$/.test(cell)) ||
      "";
    if (!labelCell) return;
    const labelKey = normalizeVendorLabel(labelCell);
    const isNoi = /^net operating income$|^noi$/.test(labelKey);
    const isNet = /^net income$|^grand total$/.test(labelKey);
    const amountAt = (idx: number): bigint | null => (idx >= 0 ? readAmount(cells[idx] ?? "", offset + 2) : null);
    let amount: bigint | null = null;
    let flag: string | undefined;
    if (mode === "gl" && debitIdx >= 0 && creditIdx >= 0) {
      const debit = amountAt(debitIdx);
      const credit = amountAt(creditIdx);
      if (debit == null && credit == null) flag = "No debit or credit in the activity columns.";
      else amount = (debit ?? 0n) - (credit ?? 0n);
    } else if (actualIdx >= 0) {
      const raw = cells[actualIdx] ?? "";
      if (!raw.trim()) flag = "No amount in the Actual column.";
      else {
        amount = readAmount(raw, offset + 2);
        if (amount == null) flag = `Could not read the Actual amount "${raw}".`;
      }
    } else if (mode === "gl") {
      flag = "GL detail has no debit/credit or amount column. The running balance was not used.";
    } else {
      const monthLabel = opts.period
        ? `${MONTH_NAMES[opts.period.month - 1]!.slice(0, 1).toUpperCase()}${MONTH_NAMES[opts.period.month - 1]!.slice(1)} ${opts.period.year}`
        : null;
      flag = monthLabel
        ? `No column for ${monthLabel} was found. Budget, variance, and YTD were not used.`
        : "No Actual, month, or period column was found. Budget, variance, and YTD were not used.";
    }
    if (isNoi || isNet) {
      if (amount != null) controlRows.push({ kind: isNoi ? "noi" : "net_income", cents: amount });
      return;
    }
    if (isStatementTotalLabel(labelCell)) return;
    const { sourceAccountNo, rest } = splitAccount(labelCell);
    const mapped = mapStatementLabel(labelCell, null, { balanceSheet: mode === "balance" });
    let signed = amount ?? 0n;
    if (mode === "gl" && amount != null) {
      const account = mapped.accountCode ? MASTER_COA_BY_CODE.get(mapped.accountCode) : undefined;
      const keepDebitSign =
        mapped.accountCode === "4015" || (mapped.accountCode != null && CONTRA_DEBIT.has(mapped.accountCode));
      if (account?.type === "REVENUE" && !keepDebitSign) signed = -signed;
    } else {
      signed = contraDebit(mapped.accountCode, signed);
    }
    lines.push({
      sourceLabel: rest || labelCell,
      sourceAccountNo,
      accountCode: mapped.accountCode,
      signedCents: signed.toString(),
      confidence: mapped.confidence,
      balanceSheet: mapped.balanceSheet || mode === "balance",
      flag,
      budgetCents: amountAt(indexOf("budget"))?.toString() ?? null,
      varianceCents: amountAt(indexOf("var"))?.toString() ?? null,
      ytdCents: amountAt(indexOf("ytd"))?.toString() ?? null,
    });
  });
  return { lines: dedupe(lines), controlRows };
}

function dedupe(lines: ParsedCloseLine[]): ParsedCloseLine[] {
  const byKey = new Map<string, ParsedCloseLine>();
  for (const line of lines) {
    const key = `${line.flag ? "FLAG|" : ""}${line.accountCode ?? "UNMAPPED"}|${normalizeVendorLabel(line.sourceLabel)}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...line });
      continue;
    }
    if (line.flag || existing.flag) {
      existing.flag = existing.flag ?? line.flag;
      continue;
    }
    existing.signedCents = (BigInt(existing.signedCents) + BigInt(line.signedCents)).toString();
  }
  return [...byKey.values()];
}

function workbookRows(bytes: Buffer): string[][] {
  const workbook = read(bytes, { type: "buffer", raw: false });
  const sheetName =
    workbook.SheetNames.find((name) => /income|p&l|profit|balance|gl|general|operating|t12|trailing/i.test(name)) ??
    workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) return [];
  return utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as string[][];
}

function pdfText(bytes: Buffer): string {
  const raw = bytes.toString("latin1");
  const parts: string[] = [];
  const re = /\((?:\\\)|\\.|[^)]){2,160}\)/g;
  for (const match of raw.match(re) ?? []) {
    const text = match.slice(1, -1).replace(/\\n/g, " ").replace(/\\(.)/g, "$1");
    if (/[A-Za-z]/.test(text)) parts.push(text);
  }
  return parts.join("\n");
}

function lineEffect(line: ParsedCloseLine, which: "noi" | "net"): bigint {
  if (!line.accountCode || line.flag) return 0n;
  const account = MASTER_COA_BY_CODE.get(line.accountCode);
  if (!account) return 0n;
  const amount = BigInt(line.signedCents);
  const mag = amount < 0n ? -amount : amount;
  const group = account.reportGroup;
  if (group === "gpr" || group === "other_income" || group === "am_income") return amount;
  if (line.accountCode === "4015") return -amount;
  if (NOI_GROUPS.has(group) || group.startsWith("opex_")) return -mag;
  if (which === "net" && (account.isBelowNoi || group === "interest" || group === "depreciation")) return -mag;
  return 0n;
}

export function importControl(lines: ParsedCloseLine[], controlRows: { kind: "noi" | "net_income"; cents: bigint }[]): ImportControl {
  const mappedNoi = lines.reduce((acc, line) => acc + lineEffect(line, "noi"), 0n);
  const mappedNi = lines.reduce((acc, line) => acc + lineEffect(line, "net"), 0n);
  const noiRow = controlRows.find((row) => row.kind === "noi") ?? null;
  const niRow = controlRows.find((row) => row.kind === "net_income") ?? null;
  const noiTies = noiRow == null || noiRow.cents === mappedNoi;
  const netIncomeTies = niRow == null || niRow.cents === mappedNi;
  const flagged = lines.filter((line) => line.flag);
  const blocksPosting = !noiTies || !netIncomeTies || flagged.length > 0;
  const parts: string[] = [];
  if (noiRow && !noiTies) parts.push(`Source NOI ${noiRow.cents} does not equal mapped NOI ${mappedNoi}.`);
  if (niRow && !netIncomeTies) parts.push(`Source net income ${niRow.cents} does not equal mapped net income ${mappedNi}.`);
  if (flagged.length) parts.push(`${flagged.length} labeled row(s) had no readable amount and were not dropped.`);
  if (!noiRow && !niRow) parts.push("No NOI or net-income control total was found in the file.");
  if (!blocksPosting) parts.push("Import control totals tie to the mapped lines.");
  return {
    sourceNoiCents: noiRow ? noiRow.cents.toString() : null,
    mappedNoiCents: mappedNoi.toString(),
    noiTies,
    sourceNetIncomeCents: niRow ? niRow.cents.toString() : null,
    mappedNetIncomeCents: mappedNi.toString(),
    netIncomeTies,
    blocksPosting,
    detail: parts.join(" "),
  };
}

/** Empty file, or every row is flagged because the close month has no column. Unmapped labels are not this case. */
function fileHasNoCloseMonthColumn(lines: ParsedCloseLine[]): boolean {
  if (lines.length === 0) return true;
  return lines.every(
    (line) => line.flag != null && /no column for |no actual, month, or period column/i.test(line.flag),
  );
}

function finish(kind: CloseFileClass, lines: ParsedCloseLine[], note: string, controlRows: { kind: "noi" | "net_income"; cents: bigint }[] = []): ClassifiedCloseFile {
  const control = importControl(lines, controlRows);
  if (kind === "balance_sheet" && balanceSheetLacksUsableAmount(lines)) {
    control.blocksPosting = true;
    const plain = EMPTY_BALANCE_SHEET_MESSAGE;
    control.detail = /posting is blocked/i.test(control.detail) ? control.detail : `${control.detail} ${plain}`.trim();
  }
  if ((kind === "t12" || kind === "income_statement") && fileHasNoCloseMonthColumn(lines)) {
    control.blocksPosting = true;
    const plain = "No income lines were mapped from this file, so posting is blocked.";
    const columnFlag = lines.find((line) => line.flag && /column for /i.test(line.flag))?.flag;
    if (lines.length === 0) {
      control.detail = /posting is blocked/i.test(note) ? note : `${note} ${plain}`.trim();
    } else if (!/posting is blocked/i.test(control.detail)) {
      control.detail = [columnFlag, control.detail, plain].filter(Boolean).join(" ");
    }
  }
  const noteText =
    lines.length === 0 && (kind === "t12" || kind === "income_statement")
      ? control.detail
      : control.blocksPosting
        ? `${note} ${control.detail}`.trim()
        : note;
  return {
    classification: kind,
    lines,
    unmapped: lines.filter((line) => !line.accountCode).map((line) => line.sourceLabel),
    flagged: lines.filter((line) => line.flag).map((line) => `${line.sourceLabel}: ${line.flag}`),
    note: noteText,
    control,
  };
}

function linesFromT12(bytes: Buffer, filename: string, period?: { year: number; month: number }): { lines: ParsedCloseLine[]; note: string } {
  const rows = workbookRows(bytes);
  if (!period) {
    return { lines: [], note: `${filename}: a close period is required so the T12 posts that month's column, not the trailing total.` };
  }
  const parsed = t12CloseMonthLines(rows, period.year, period.month);
  if (!parsed.header) {
    const name = MONTH_NAMES[period.month - 1] ?? "that month";
    const pretty = `${name.slice(0, 1).toUpperCase()}${name.slice(1)} ${period.year}`;
    const short = name.slice(0, 1).toUpperCase() + name.slice(1, 3);
    return {
      lines: [],
      note: `No column for ${pretty} was found, so no income lines were mapped. Posting is blocked. Use a header such as “${short} Actual” for that month. The trailing total was not used.`,
    };
  }
  const lines: ParsedCloseLine[] = parsed.lines.map((line) => {
    const mapped = mapStatementLabel(line.label);
    const code = line.accountCode ?? mapped.accountCode;
    const amount = line.cents == null ? 0n : contraDebit(code, line.cents);
    return {
      sourceLabel: line.label,
      sourceAccountNo: "",
      accountCode: code,
      signedCents: amount.toString(),
      confidence: mapped.confidence,
      balanceSheet: false,
      flag: line.cents == null ? "No amount in the close-month column." : undefined,
    };
  });
  return { lines, note: `T12 column ${parsed.header} is the period actual.` };
}

export function parseCloseFile(filename: string, bytes: Buffer, opts: CloseParseOptions = {}): ClassifiedCloseFile {
  const kind = opts.classification ?? classifyCloseFile(filename, bytes);
  const period = opts.year && opts.month ? { year: opts.year, month: opts.month } : undefined;
  if (kind === "rent_roll") {
    return finish(kind, [], "Rent roll — parsed by the existing multi-dialect ingest, not the GL crosswalk.");
  }
  try {
    if (kind === "t12") {
      const parsed = linesFromT12(bytes, filename, period);
      return finish(kind, parsed.lines, parsed.note);
    }
    if (kind === "pdf") {
      const text = pdfText(bytes);
      const rows = text.split(/\n/).map((line) => line.split(/\s{2,}|\t/));
      const matrix = rowsFromMatrix(rows, { period, mode: "statement" });
      return finish(
        kind,
        matrix.lines,
        matrix.lines.length
          ? "PDF text was extracted and mapped. Confirm the lines before posting."
          : "PDF stored with the package. No statement lines could be read — keep the Excel or CSV beside it.",
        matrix.controlRows,
      );
    }
    const tabular = filename.toLowerCase().endsWith(".csv") ? parseCsvLines(bytes.toString("utf8")) : workbookRows(bytes);
    const mode: MatrixMode = kind === "gl_detail" ? "gl" : kind === "balance_sheet" ? "balance" : "statement";
    const matrix = rowsFromMatrix(tabular, { period, mode });
    return finish(
      kind,
      matrix.lines,
      kind === "balance_sheet"
        ? "Balance sheet lines. Posting applies the change from the current books."
        : kind === "gl_detail"
          ? "GL detail uses debit, credit, or amount. The running balance is not posted."
          : "Statement lines use the Actual, month, or period column. Budget, variance, and YTD stay off the books.",
      matrix.controlRows,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read this file.";
    return finish(kind, [], message);
  }
}

export function applyRememberedMaps(
  lines: ParsedCloseLine[],
  maps: { normalizedLabel: string; sourceAccountNo: string; accountCode: string }[],
): ParsedCloseLine[] {
  return lines.map((line) => {
    const key = normalizeVendorLabel(line.sourceLabel);
    const hit = maps.find(
      (row) =>
        row.normalizedLabel === key &&
        (row.sourceAccountNo === "" || row.sourceAccountNo === line.sourceAccountNo),
    );
    if (!hit || !MASTER_COA_BY_CODE.has(hit.accountCode)) return line;
    return { ...line, accountCode: hit.accountCode, confidence: "CLIENT_MAP" };
  });
}
