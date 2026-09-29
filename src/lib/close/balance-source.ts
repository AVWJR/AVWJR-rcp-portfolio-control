import { newerFileNotice, SUPERSEDED_INCOME_LABEL, type ChooseSourceOptions } from "./income-source";

export const DEFAULT_BALANCE_SHEET_LABEL = "Default, most recent balance sheet";
export const SUPERSEDED_BALANCE_LABEL = SUPERSEDED_INCOME_LABEL;

export function isBalanceSource(classification: string): boolean {
  return classification === "balance_sheet";
}

function newest<T extends { id: string; createdAt: Date }>(uploads: T[]): T | null {
  if (!uploads.length) return null;
  const sorted = [...uploads].sort((a, b) => {
    const time = a.createdAt.getTime() - b.createdAt.getTime();
    if (time !== 0) return time;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return sorted[sorted.length - 1] ?? null;
}

/**
 * One balance sheet posts per month. The default is the newest file that can
 * be posted. An explicit choice is reused until the user picks a different file.
 */
export function chooseBalanceUpload<T extends { id: string; classification: string; createdAt: Date }>(
  uploads: T[],
  balanceUploadId?: string | null,
  options?: ChooseSourceOptions<T>,
): T | null {
  const sheets = uploads.filter((upload) => isBalanceSource(upload.classification));
  const blocked = options?.isBlocked ?? (() => false);
  const requested = balanceUploadId?.trim();
  if (requested) {
    const picked = sheets.find((upload) => upload.id === requested);
    if (!picked) throw new Error("Choose a balance sheet from this month.");
    if (blocked(picked)) throw new Error("That balance sheet is blocked and cannot be chosen.");
    return picked;
  }
  const savedId = options?.savedUploadId?.trim();
  if (savedId) {
    const saved = sheets.find((upload) => upload.id === savedId);
    if (saved && blocked(saved) && options?.blockedSaved === "throw") {
      throw new Error("The saved balance sheet is blocked and cannot be posted. Choose another file.");
    }
    if (saved && !blocked(saved)) return saved;
  }
  const selectable = sheets.filter((upload) => !blocked(upload));
  return newest(selectable.length ? selectable : sheets);
}

export function balancePostingLabel(role: "source" | "superseded", isAutomatic: boolean): string {
  if (role === "superseded") return SUPERSEDED_BALANCE_LABEL;
  if (isAutomatic) return `${DEFAULT_BALANCE_SHEET_LABEL}. This file posts the month’s balance sheet.`;
  return "This file posts the month’s balance sheet.";
}

export function balanceSourceSummary(file: { filename: string } | null, saved: boolean): string | null {
  if (!file) return null;
  if (saved) return `Balance sheet source: ${file.filename} — saved for this SPE and period.`;
  return `Balance sheet source: ${file.filename} — ${DEFAULT_BALANCE_SHEET_LABEL}.`;
}

export function newerBalanceNotice(filename: string): string {
  return newerFileNotice("balance sheet", filename);
}
