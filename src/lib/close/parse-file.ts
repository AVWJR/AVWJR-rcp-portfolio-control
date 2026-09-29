import { createHash } from "node:crypto";
import { inferFileRole } from "@/lib/deals/infer";
import { parseT12WorkbookBytes } from "@/lib/deals/workbook";
import { MASTER_COA_BY_CODE } from "@rcp/ledger";
import {
  isStatementTotalLabel,
  mapNormalizedLabel,
  normalizeVendorLabel,
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
};

export type ClassifiedCloseFile = {
  classification: CloseFileClass;
  lines: ParsedCloseLine[];
  unmapped: string[];
  note: string;
};

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export { sha256 };

export function classifyCloseFile(filename: string, bytes?: Buffer): CloseFileClass {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (/balance[\s_-]*sheet|\btrial balance\b/.test(lower)) return "balance_sheet";
  if (/general ledger|gl detail|gl_detail|transaction detail/.test(lower)) return "gl_detail";
  if (/income statement|profit|p&l|p_l|operating statement/.test(lower) && !/t-?12|trailing/.test(lower)) {
    return "income_statement";
  }
  const role = inferFileRole(filename, bytes);
  if (role === "rent_roll_csv") return "rent_roll";
  if (role === "t12_pl") return "t12";
  if (role === "budget_csv") return "budget";
  return "other";
}

function parseAmount(raw: string): bigint | null {
  const text = raw.trim();
  if (!text || /^[a-z\s]+$/i.test(text)) return null;
  const negative = /^\(.*\)$/.test(text) || text.startsWith("-");
  const digits = text.replace(/[(),$\s]/g, "").replace(/^-/, "");
  if (!/^\d+(\.\d+)?$/.test(digits)) return null;
  const [whole, frac = ""] = digits.split(".");
  const cents = BigInt(whole ?? "0") * 100n + BigInt((frac + "00").slice(0, 2));
  return negative ? -cents : cents;
}

function splitAccount(label: string): { sourceAccountNo: string; rest: string } {
  const match = label.match(/^(\d{3,6})(?:-\d{3})?\s+(.*)$/);
  if (!match) return { sourceAccountNo: "", rest: label.trim() };
  return { sourceAccountNo: match[1] ?? "", rest: (match[2] ?? label).trim() };
}

export function mapStatementLabel(
  label: string,
  client?: { accountCode: string } | null,
): { accountCode: string | null; confidence: MapConfidence; balanceSheet: boolean } {
  if (client?.accountCode && MASTER_COA_BY_CODE.has(client.accountCode)) {
    return { accountCode: client.accountCode, confidence: "CLIENT_MAP", balanceSheet: false };
  }
  const { rest } = splitAccount(label);
  if (MASTER_COA_BY_CODE.has(rest)) {
    return { accountCode: rest, confidence: "EXACT", balanceSheet: false };
  }
  const hit = mapNormalizedLabel(rest || label);
  return { accountCode: hit.accountCode, confidence: hit.confidence, balanceSheet: hit.balanceSheet };
}

function rowsFromMatrix(rows: string[][]): ParsedCloseLine[] {
  const lines: ParsedCloseLine[] = [];
  for (const row of rows) {
    const cells = row.map((cell) => String(cell ?? "").trim()).filter((cell, index, all) => cell || index < all.length);
    if (cells.every((cell) => !cell)) continue;
    const labelCell = cells.find((cell) => /[a-z]/i.test(cell) && !/^[\d$(),.\-]+$/.test(cell)) ?? "";
    if (!labelCell || isStatementTotalLabel(labelCell)) continue;
    const amountCell = [...cells].reverse().find((cell) => parseAmount(cell) != null);
    if (!amountCell) continue;
    const amount = parseAmount(amountCell);
    if (amount == null || amount === 0n) continue;
    const { sourceAccountNo, rest } = splitAccount(labelCell);
    const mapped = mapStatementLabel(rest || labelCell);
    lines.push({
      sourceLabel: rest || labelCell,
      sourceAccountNo,
      accountCode: mapped.accountCode,
      signedCents: amount.toString(),
      confidence: mapped.confidence,
      balanceSheet: mapped.balanceSheet,
    });
  }
  return dedupe(lines);
}

function dedupe(lines: ParsedCloseLine[]): ParsedCloseLine[] {
  const byKey = new Map<string, ParsedCloseLine>();
  for (const line of lines) {
    const key = `${line.accountCode ?? "UNMAPPED"}|${normalizeVendorLabel(line.sourceLabel)}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...line });
      continue;
    }
    existing.signedCents = (BigInt(existing.signedCents) + BigInt(line.signedCents)).toString();
  }
  return [...byKey.values()];
}

function workbookRows(bytes: Buffer): string[][] {
  const workbook = read(bytes, { type: "buffer", raw: false });
  const sheetName =
    workbook.SheetNames.find((name) => /income|p&l|profit|balance|gl|general|operating/i.test(name)) ??
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

function linesFromT12(bytes: Buffer, filename: string): ParsedCloseLine[] {
  const parsed = parseT12WorkbookBytes(bytes, filename);
  return parsed.lines.map((line) => ({
    sourceLabel: line.label,
    sourceAccountNo: "",
    accountCode: line.accountCode,
    signedCents: (line.t12Cents / BigInt(Math.max(parsed.monthCount, 1))).toString(),
    confidence: "RULE" as const,
    balanceSheet: false,
  }));
}

export function parseCloseFile(filename: string, bytes: Buffer, classification?: CloseFileClass): ClassifiedCloseFile {
  const kind = classification ?? classifyCloseFile(filename, bytes);
  if (kind === "rent_roll") {
    return {
      classification: kind,
      lines: [],
      unmapped: [],
      note: "Rent roll — parsed by the existing multi-dialect ingest, not the GL crosswalk.",
    };
  }
  try {
    if (kind === "t12") {
      const lines = linesFromT12(bytes, filename);
      const unmapped = lines.filter((line) => !line.accountCode).map((line) => line.sourceLabel);
      return { classification: kind, lines, unmapped, note: "T12 roll-forward. Monthly average is the period actual." };
    }
    if (kind === "pdf") {
      const text = pdfText(bytes);
      const rows = text
        .split(/\n/)
        .map((line) => line.split(/\s{2,}|\t/))
        .filter((row) => row.length > 0);
      const lines = rowsFromMatrix(rows);
      return {
        classification: kind,
        lines,
        unmapped: lines.filter((line) => !line.accountCode).map((line) => line.sourceLabel),
        note: lines.length
          ? "PDF text was extracted and mapped. Confirm the lines before posting."
          : "PDF stored with the package. No statement lines could be read — keep the Excel or CSV beside it.",
      };
    }
    const tabular = filename.toLowerCase().endsWith(".csv")
      ? bytes
          .toString("utf8")
          .split(/\r?\n/)
          .map((line) => line.split(",").map((cell) => cell.trim()))
      : workbookRows(bytes);
    const lines = rowsFromMatrix(tabular);
    const unmapped = lines.filter((line) => !line.accountCode).map((line) => line.sourceLabel);
    return {
      classification: kind,
      lines,
      unmapped,
      note:
        kind === "balance_sheet"
          ? "Balance sheet lines. Posting applies the change from the current books."
          : kind === "gl_detail"
            ? "GL detail mapped onto the RCP chart. Unmapped lines go to suspense 1999."
            : "Statement lines mapped onto the RCP chart.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read this file.";
    return { classification: kind, lines: [], unmapped: [], note: message };
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
