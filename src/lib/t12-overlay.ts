import { incomeStatementFromBudget, type BudgetByCode } from "@rcp/reporting";
import type { T12WorkbookParse } from "@rcp/properties";
import { prisma } from "./prisma";

export const BROKER_T12_SOURCE = "broker_t12";
export const BROKER_T12_NOTE_PREFIX = "BROKER_T12_JSON:";

export type BrokerT12OverlaySummary = {
  filename: string;
  sheet: string;
  monthCount: number;
  gpr: bigint;
  vacancy: bigint;
  concessions: bigint;
  otherIncome: bigint;
  egi: bigint;
  opex: bigint;
  noi: bigint;
  budgetPeriod: string;
  postedToGl: false;
  note: string;
};

export function overlayNoteFromParse(
  parsed: T12WorkbookParse,
  filename: string,
  budgetPeriod: string,
): string {
  const summary: BrokerT12OverlaySummary = {
    filename,
    sheet: parsed.sheet,
    monthCount: parsed.monthCount,
    gpr: parsed.gpr,
    vacancy: parsed.vacancy,
    concessions: parsed.concessions,
    otherIncome: parsed.otherIncome,
    egi: parsed.egi,
    opex: parsed.opex,
    noi: parsed.noi,
    budgetPeriod,
    postedToGl: false,
    note: "Mapped from the broker T12/P&L workbook into monthly budget lines. Not posted to the GL.",
  };
  return `${BROKER_T12_NOTE_PREFIX}${JSON.stringify(summary, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  )}`;
}

export function parseOverlayNote(notes: string | null | undefined): BrokerT12OverlaySummary | null {
  if (!notes?.startsWith(BROKER_T12_NOTE_PREFIX)) return null;
  try {
    const raw = JSON.parse(notes.slice(BROKER_T12_NOTE_PREFIX.length)) as Record<string, unknown>;
    const asBig = (key: string) => BigInt(String(raw[key] ?? "0"));
    return {
      filename: String(raw.filename ?? ""),
      sheet: String(raw.sheet ?? ""),
      monthCount: Number(raw.monthCount ?? 0),
      gpr: asBig("gpr"),
      vacancy: asBig("vacancy"),
      concessions: asBig("concessions"),
      otherIncome: asBig("otherIncome"),
      egi: asBig("egi"),
      opex: asBig("opex"),
      noi: asBig("noi"),
      budgetPeriod: String(raw.budgetPeriod ?? ""),
      postedToGl: false,
      note: String(raw.note ?? ""),
    };
  } catch {
    return null;
  }
}

export async function loadBrokerT12Overlay(entityId: string): Promise<BrokerT12OverlaySummary | null> {
  const docs = await prisma.vaultDocument.findMany({
    where: { entityId },
    orderBy: { uploadedAt: "desc" },
  });
  for (const doc of docs) {
    const parsed = parseOverlayNote(doc.notes);
    if (parsed) return parsed;
  }
  const budget = await prisma.budgetLine.findMany({
    where: { entityId, source: BROKER_T12_SOURCE },
    take: 24,
  });
  if (!budget.length) return null;
  const map: BudgetByCode = new Map();
  for (const row of budget) {
    map.set(row.accountCode, (map.get(row.accountCode) ?? 0n) + row.amount);
  }
  const stmt = incomeStatementFromBudget(map);
  const period = `${budget[0]!.year}-${String(budget[0]!.month).padStart(2, "0")}`;
  return {
    filename: "broker T12/P&L",
    sheet: "",
    monthCount: 12,
    gpr: stmt.gpr * 12n,
    vacancy: stmt.vacancy * 12n,
    concessions: stmt.concessions * 12n,
    otherIncome: stmt.otherIncome * 12n,
    egi: stmt.egi * 12n,
    opex: stmt.opex * 12n,
    noi: stmt.noi * 12n,
    budgetPeriod: period,
    postedToGl: false,
    note: "Rebuilt from monthly broker_t12 budget lines (×12). Not posted to the GL.",
  };
}
