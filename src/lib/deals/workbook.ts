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

export function workbookLooksEncrypted(bytes: Buffer): boolean {
  const sniff = bytes.subarray(0, Math.min(bytes.length, 16_384)).toString("latin1");
  return /EncryptedPackage|StrongEncryptionDataSpace/i.test(sniff);
}

function passwordError(filename: string): Error {
  return new Error(
    `${filename} is password-protected. Remove the password and upload again — we cannot import an encrypted workbook.`,
  );
}

function corruptError(filename: string, raw: string): Error {
  return new Error(`${filename} is not a readable Excel workbook (${raw}). Export a clean .xlsx or use CSV.`);
}

function hasExcelSignature(bytes: Buffer): boolean {
  if (bytes.length < 4) return false;
  const ole = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (ole) return true;
  if (!zip) return false;
  const sniff = bytes.subarray(0, Math.min(bytes.length, 16_384)).toString("latin1");
  return /xl\/_rels\/workbook|xl\/workbook|xl\/worksheets|\[Content_Types\]\.xml/i.test(sniff);
}

/** Upload-time probe: reject encrypted / corrupt workbooks. Empty-but-openable sheets still store. */
export function assertReadableWorkbook(bytes: Buffer, filename: string): void {
  if (!bytes.length) {
    throw new Error(`${filename} is empty. Choose a rent-roll or budget workbook that has content.`);
  }
  if (workbookLooksEncrypted(bytes)) throw passwordError(filename);
  if (!hasExcelSignature(bytes)) {
    throw corruptError(filename, "missing Excel file signature");
  }
  try {
    const workbook = read(bytes, { type: "buffer", cellDates: true, raw: false });
    if (!workbook.SheetNames.length) {
      throw new Error(`${filename} has no worksheets. Save the first sheet as CSV or add a RentRoll / Budget sheet.`);
    }
  } catch (error) {
    if (error instanceof Error && /password-protected|has no worksheets/.test(error.message)) throw error;
    const raw = error instanceof Error ? error.message : "Unknown workbook error";
    if (/password|encrypt/i.test(raw)) throw passwordError(filename);
    throw corruptError(filename, raw);
  }
}

export function workbookToCsv(bytes: Buffer, filename: string): string {
  assertReadableWorkbook(bytes, filename);
  const workbook = read(bytes, { type: "buffer", cellDates: true, raw: false });
  const preferred =
    workbook.SheetNames.find((name) => /rent|roll|unit/i.test(name)) ??
    workbook.SheetNames.find((name) => /budget/i.test(name)) ??
    workbook.SheetNames[0];
  if (!preferred) {
    throw new Error(`${filename} has no worksheets. Save the first sheet as CSV or add a RentRoll / Budget sheet.`);
  }
  const sheet = workbook.Sheets[preferred];
  if (!sheet) {
    throw new Error(`${filename} sheet "${preferred}" is empty. The file is stored — ask Expert to map columns or save the first sheet as CSV.`);
  }
  const csv = utils.sheet_to_csv(sheet, { blankrows: false });
  if (!csv.trim()) {
    throw new Error(
      `${filename} sheet "${preferred}" has no rows we can read. The file is stored in the vault — ask Expert to map columns (unit_id / account_code) or save as CSV.`,
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
