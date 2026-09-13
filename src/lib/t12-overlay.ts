import { incomeStatementFromBudget, type BudgetByCode } from "@rcp/reporting";
import type { T12WorkbookParse } from "@rcp/properties";
import type { JournalDraftLine } from "@rcp/ledger";
import { prisma } from "./prisma";
import { postJournal } from "./post-journal";
import { openPeriod } from "./deals/periods";

export const BROKER_T12_SOURCE = "broker_t12";
export const BROKER_T12_JOURNAL_SOURCE = "broker_t12_overlay";
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
  postedToGl: boolean;
  note: string;
};

const OPEX_CODES = ["5110", "5210", "5310", "5410", "5510", "5610", "5710", "5810", "5910", "5990"] as const;

export function overlayNoteFromParse(
  parsed: T12WorkbookParse,
  filename: string,
  budgetPeriod: string,
  postedToGl = false,
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
    postedToGl,
    note: postedToGl
      ? "Yardi cash-book T12 mapped onto RCP CoA as imported broker T12 journals plus monthly budget lines. Honest overlay — not audited property books."
      : "Mapped from the broker T12/P&L workbook into monthly budget lines. Not posted to the GL.",
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
      postedToGl: Boolean(raw.postedToGl),
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
  const journals = await prisma.journal.count({
    where: { entityId, source: BROKER_T12_JOURNAL_SOURCE },
  });
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
    postedToGl: journals > 0,
    note:
      journals > 0
        ? "Rebuilt from monthly broker_t12 budget lines (×12). Period tiles include imported broker T12 journals — not audited cash books."
        : "Rebuilt from monthly broker_t12 budget lines (×12). Not posted to the GL.",
  };
}

function pushLine(lines: JournalDraftLine[], accountCode: string, debit: bigint, credit: bigint, memo: string) {
  if (debit === 0n && credit === 0n) return;
  lines.push({ accountCode, debit, credit, memo });
}

/** Map T12 monthly averages onto the demo period as labeled overlay journals (cash-book ≠ RCP CoA). */
export async function postBrokerT12OverlayJournals(opts: {
  entityId: string;
  year: number;
  month: number;
  parsed: T12WorkbookParse;
  filename: string;
}): Promise<number> {
  const period = await openPeriod(opts.entityId, opts.year, opts.month);
  const existing = await prisma.journal.findMany({
    where: { entityId: opts.entityId, periodId: period.id, source: BROKER_T12_JOURNAL_SOURCE },
    select: { id: true },
  });
  if (existing.length) {
    await prisma.journal.deleteMany({ where: { id: { in: existing.map((row) => row.id) } } });
  }

  const monthCount = BigInt(Math.max(opts.parsed.monthCount, 1));
  const avg = (t12: bigint) => t12 / monthCount;
  const gpr = avg(opts.parsed.gpr);
  const vacancy = avg(opts.parsed.vacancy);
  const concessions = avg(opts.parsed.concessions);
  const otherIncome = avg(opts.parsed.otherIncome);
  const opexByCode = new Map<string, bigint>();
  for (const code of OPEX_CODES) {
    const line = opts.parsed.lines.find((row) => row.accountCode === code);
    if (line && line.monthlyAverageCents !== 0n) opexByCode.set(code, line.monthlyAverageCents);
  }
  const opex = [...opexByCode.values()].reduce((acc, n) => acc + n, 0n);
  if (gpr === 0n && otherIncome === 0n && opex === 0n) return 0;

  const memo = `Imported broker T12 monthly average from ${opts.filename} sheet “${opts.parsed.sheet}” — cash-book codes mapped to RCP CoA. Not audited books.`;
  const lines: JournalDraftLine[] = [];
  pushLine(lines, "1110", gpr, 0n, "Broker T12 overlay — accrue mapped unit rent");
  pushLine(lines, "4010", 0n, gpr, "Broker T12 overlay — 40xx unit rent → 4010");
  pushLine(lines, "4020", vacancy, 0n, "Broker T12 overlay — vacancy");
  pushLine(lines, "1110", 0n, vacancy, "Broker T12 overlay — vacancy against AR");
  pushLine(lines, "4030", concessions, 0n, "Broker T12 overlay — concessions");
  pushLine(lines, "1110", 0n, concessions, "Broker T12 overlay — concessions against AR");
  pushLine(lines, "1010", otherIncome, 0n, "Broker T12 overlay — other income cash");
  pushLine(lines, "4100", 0n, otherIncome, "Broker T12 overlay — 41xx → 4100");
  for (const [code, amount] of opexByCode) {
    pushLine(lines, code, amount, 0n, `Broker T12 overlay — ${code}`);
  }
  pushLine(lines, "1010", 0n, opex, "Broker T12 overlay — operating expense cash");

  const date = new Date(Date.UTC(opts.year, opts.month - 1, 15, 16, 0, 0));
  await postJournal({
    entityId: opts.entityId,
    periodId: period.id,
    date,
    memo,
    source: BROKER_T12_JOURNAL_SOURCE,
    lines,
  });
  return lines.length;
}
