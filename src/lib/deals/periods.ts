import { ensureChecklist } from "@/lib/period-close";
import { prisma } from "@/lib/prisma";
import { formatPeriodLabel, parsePeriodLabel } from "@/lib/expert/period";

function ny(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, 16, 0, 0));
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export async function openPeriod(entityId: string, year: number, month: number) {
  const label = formatPeriodLabel(year, month);
  const startDate = ny(year, month, 1);
  const endDate = ny(year, month, lastDayOfMonth(year, month));
  const period = await prisma.period.upsert({
    where: { entityId_year_month: { entityId, year, month } },
    update: {},
    create: { entityId, year, month, label, startDate, endDate, status: "OPEN" },
  });
  await ensureChecklist(period.id);
  return period;
}

export async function openDealPeriods(entityId: string, targetPeriod = "2026-08") {
  const labels = new Set(["2026-07", "2026-08", targetPeriod]);
  const opened = [];
  for (const label of labels) {
    const parsed = parsePeriodLabel(label);
    if (!parsed) continue;
    opened.push(await openPeriod(entityId, parsed.year, parsed.month));
  }
  return opened;
}

export async function listPeriodLabels() {
  const rows = await prisma.period.findMany({
    select: { label: true, year: true, month: true },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });
  const labels = [...new Set(rows.map((row) => row.label))];
  for (const fallback of ["2026-07", "2026-08"]) {
    if (!labels.includes(fallback)) labels.push(fallback);
  }
  return labels;
}
