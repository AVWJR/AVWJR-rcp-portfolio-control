export function parsePeriodLabel(period: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(period.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  return { year, month };
}

export function formatPeriodLabel(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function formatContextChip(entityCode: string, periodLabel: string): string {
  return `${entityCode} · ${periodLabel}`;
}
