export const SUPERSEDED_INCOME_LABEL = "Superseded — not posted";
export const DEFAULT_INCOME_STATEMENT_LABEL = "Default, most recent income statement";

const INCOME_SOURCE_CLASSES = new Set(["income_statement", "t12", "other"]);

export function isIncomeSource(classification: string): boolean {
  return INCOME_SOURCE_CLASSES.has(classification);
}

export function newerFileNotice(kind: "income" | "balance sheet", filename: string): string {
  return `A newer ${kind} file is in this package (${filename}). The saved source stays in place until you select the newer file.`;
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

function isAfter<T extends { id: string; createdAt: Date }>(candidate: T, current: T): boolean {
  const time = candidate.createdAt.getTime() - current.createdAt.getTime();
  if (time !== 0) return time > 0;
  return candidate.id > current.id;
}

export type ChooseSourceOptions<T> = {
  /** Posted choice for this SPE and period. Blank means no explicit choice yet. */
  savedUploadId?: string | null;
  isBlocked?: (upload: T) => boolean;
  /** Posting throws when the saved file is blocked. The close page falls back so a blocked file is not selected. */
  blockedSaved?: "throw" | "ignore";
};

/**
 * One income file posts per month. The default is the most recent income
 * statement that can be posted. An explicit choice is reused until the user
 * picks a different file.
 */
export function chooseIncomeUpload<T extends { id: string; classification: string; createdAt: Date }>(
  uploads: T[],
  incomeUploadId?: string | null,
  options?: ChooseSourceOptions<T>,
): T | null {
  return chooseFromPool(
    uploads.filter((upload) => isIncomeSource(upload.classification)),
    incomeUploadId,
    {
      ...options,
      missingMessage: "Choose an income statement, T12, or other income file from this month.",
      blockedMessage: "That income file is blocked and cannot be chosen.",
      savedBlockedMessage: "The saved income source is blocked and cannot be posted. Choose another file.",
      prefer: (upload) => upload.classification === "income_statement",
    },
  );
}

export function newerSelectableUpload<T extends { id: string; createdAt: Date }>(
  uploads: T[],
  current: T | null,
  isBlocked?: (upload: T) => boolean,
): T | null {
  if (!current) return null;
  const blocked = isBlocked ?? (() => false);
  return newest(uploads.filter((upload) => upload.id !== current.id && !blocked(upload) && isAfter(upload, current)));
}

export function incomePostingLabel(
  file: { id: string; classification: string },
  role: "source" | "superseded",
  automaticId: string | null,
): string {
  if (role === "superseded") return SUPERSEDED_INCOME_LABEL;
  if (file.id === automaticId && file.classification === "income_statement") {
    return `${DEFAULT_INCOME_STATEMENT_LABEL}. This file posts the month’s income.`;
  }
  if (file.classification === "t12") {
    return "This file posts the month’s income. Only its close-month column is posted.";
  }
  return "This file posts the month’s income.";
}

export function incomeSourceSummary(
  file: { filename: string; classification: string } | null,
  saved: boolean,
): string | null {
  if (!file) return null;
  if (saved) return `Income source: ${file.filename} — saved for this SPE and period.`;
  if (file.classification === "income_statement") {
    return `Income source: ${file.filename} — ${DEFAULT_INCOME_STATEMENT_LABEL}.`;
  }
  if (file.classification === "t12") {
    return `Income source: ${file.filename}. Only its close-month column is posted.`;
  }
  return `Income source: ${file.filename}.`;
}

type PoolOptions<T> = ChooseSourceOptions<T> & {
  missingMessage: string;
  blockedMessage: string;
  savedBlockedMessage: string;
  prefer?: (upload: T) => boolean;
};

function chooseFromPool<T extends { id: string; createdAt: Date }>(
  pool: T[],
  requestedId: string | null | undefined,
  options: PoolOptions<T>,
): T | null {
  const blocked = options.isBlocked ?? (() => false);
  const requested = requestedId?.trim();
  if (requested) {
    const picked = pool.find((upload) => upload.id === requested);
    if (!picked) throw new Error(options.missingMessage);
    if (blocked(picked)) throw new Error(options.blockedMessage);
    return picked;
  }
  const savedId = options.savedUploadId?.trim();
  if (savedId) {
    const saved = pool.find((upload) => upload.id === savedId);
    if (saved && blocked(saved) && options.blockedSaved === "throw") {
      throw new Error(options.savedBlockedMessage);
    }
    if (saved && !blocked(saved)) return saved;
  }
  const selectable = pool.filter((upload) => !blocked(upload));
  const candidates = selectable.length ? selectable : pool;
  const preferred = options.prefer ? candidates.filter(options.prefer) : [];
  return newest(preferred.length ? preferred : candidates);
}
