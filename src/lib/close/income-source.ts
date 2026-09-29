export const SUPERSEDED_INCOME_LABEL = "Superseded — not posted";
export const DEFAULT_INCOME_STATEMENT_LABEL = "Default, most recent income statement";

const INCOME_SOURCE_CLASSES = new Set(["income_statement", "t12", "other"]);

export function isIncomeSource(classification: string): boolean {
  return INCOME_SOURCE_CLASSES.has(classification);
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
 * One income file posts per month. The default is the most recent income
 * statement. A T12 or other file posts only when it is the chosen source.
 */
export function chooseIncomeUpload<T extends { id: string; classification: string; createdAt: Date }>(
  uploads: T[],
  incomeUploadId?: string | null,
): T | null {
  const income = uploads.filter((upload) => isIncomeSource(upload.classification));
  const requested = incomeUploadId?.trim();
  if (requested) {
    const picked = income.find((upload) => upload.id === requested);
    if (!picked) {
      throw new Error("Choose an income statement, T12, or other income file from this month.");
    }
    return picked;
  }
  const statements = income.filter((upload) => upload.classification === "income_statement");
  return newest(statements.length ? statements : income);
}
