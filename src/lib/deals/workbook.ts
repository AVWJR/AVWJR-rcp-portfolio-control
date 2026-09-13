import { utils, read } from "xlsx";

export const SPREADSHEET_EXTENSIONS = [".xlsx", ".xls"] as const;
export const SPREADSHEET_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.ms-excel.sheet.macroEnabled.12",
] as const;

export const INTAKE_ALLOWED_EXTENSIONS = [
  ".csv",
  ".xlsx",
  ".xls",
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".txt",
  ".eml",
  ".doc",
  ".docx",
] as const;

export function extensionOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i).toLowerCase() : "";
}

export function isSpreadsheetFilename(filename: string): boolean {
  return (SPREADSHEET_EXTENSIONS as readonly string[]).includes(extensionOf(filename));
}

export function isAllowedIntakeFilename(filename: string): boolean {
  const ext = extensionOf(filename);
  if (!ext) return true;
  return (INTAKE_ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
}

export function workbookToCsv(bytes: Buffer, filename: string): string {
  let workbook;
  try {
    workbook = read(bytes, { type: "buffer", cellDates: true, raw: false });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Unknown workbook error";
    if (/password|encrypt/i.test(raw)) {
      throw new Error(
        `${filename} is password-protected. Remove the password and upload again — we cannot import an encrypted workbook.`,
      );
    }
    throw new Error(`${filename} is not a readable Excel workbook (${raw}). Export a clean .xlsx or use CSV.`);
  }
  const preferred =
    workbook.SheetNames.find((name) => /rent|roll|unit/i.test(name)) ??
    workbook.SheetNames.find((name) => /budget/i.test(name)) ??
    workbook.SheetNames[0];
  if (!preferred) {
    throw new Error(`${filename} has no worksheets. Save the first sheet as CSV or add a RentRoll / Budget sheet.`);
  }
  const sheet = workbook.Sheets[preferred];
  if (!sheet) {
    throw new Error(`${filename} sheet "${preferred}" is empty.`);
  }
  const csv = utils.sheet_to_csv(sheet, { blankrows: false });
  if (!csv.trim()) {
    throw new Error(
      `${filename} sheet "${preferred}" has no rows we can read. Map columns or save as CSV — the file is stored in the vault either way.`,
    );
  }
  return csv;
}

export function bytesToImportCsv(filename: string, mimeType: string, bytes: Buffer): string {
  if (isSpreadsheetFilename(filename) || (SPREADSHEET_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return workbookToCsv(bytes, filename);
  }
  return bytes.toString("utf8");
}
