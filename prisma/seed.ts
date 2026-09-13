import path from "node:path";
import { pathToFileURL } from "node:url";
import { dollars, type JournalDraftLine } from "@rcp/ledger";
import {
  SPE_BUDGETS_2026_08,
  SPE_RENT_ROLL_SPECS,
  assertBudgetCodes,
  assertDemoRentRoll,
  buildDemoRentRoll,
  demoAsOfDate,
} from "@rcp/properties";
import { cloneCoaToEntity, createEntityWithCoa, seedMasterCoaTemplate } from "../src/lib/entities";
import { postJournal } from "../src/lib/journals";
import { prisma } from "../src/lib/prisma";
import { replaceBudget } from "../src/lib/budgets";
import { replaceRentRoll } from "../src/lib/rent-roll";
import { seedCapexProjects, seedCloseDemo, seedLoansAndRolls } from "./seed-phase-c";
import { seedPhaseF } from "./seed-phase-f";

function ny(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, 16, 0, 0));
}

function line(accountCode: string, debit: bigint, credit: bigint, memo?: string): JournalDraftLine {
  return { accountCode, debit, credit, memo };
}

async function period(entityId: string, year: number, month: number) {
  const startDate = ny(year, month, 1);
  const endDate = ny(year, month, month === 7 ? 31 : 31);
  const label = `${year}-${String(month).padStart(2, "0")}`;
  return prisma.period.upsert({
    where: { entityId_year_month: { entityId, year, month } },
    update: {},
    create: { entityId, year, month, label, startDate, endDate, status: "OPEN" },
  });
}

async function post(
  entityId: string,
  periodId: string,
  date: Date,
  memo: string,
  lines: JournalDraftLine[],
) {
  return postJournal({ entityId, periodId, date, memo, source: "seed", lines });
}

async function seedWillowBend(entityId: string) {
  const jul = await period(entityId, 2026, 7);
  const aug = await period(entityId, 2026, 8);

  await post(entityId, jul.id, ny(2026, 7, 31), "Opening / acquisition balances", [
    line("1010", dollars(420_000), 0n),
    line("1020", dollars(264_000), 0n),
    line("1030", dollars(180_000), 0n),
    line("1040", dollars(158_400), 0n),
    line("1210", dollars(48_000), 0n),
    line("1410", dollars(4_200_000), 0n),
    line("1420", dollars(18_800_000), 0n),
    line("1430", dollars(1_250_000), 0n),
    line("1440", dollars(480_000), 0n),
    line("1450", dollars(360_000), 0n),
    line("2050", 0n, dollars(158_400)),
    line("2110", 0n, dollars(245_000)),
    line("2210", 0n, dollars(16_755_000)),
    line("3010", 0n, dollars(9_002_000)),
  ]);

  await post(entityId, aug.id, ny(2026, 8, 31), "Accrue GPR", [
    line("1110", dollars(339_240), 0n),
    line("4010", 0n, dollars(339_240)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "Vacancy loss", [
    line("4020", dollars(27_140), 0n),
    line("1110", 0n, dollars(27_140)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "Concessions", [
    line("4030", dollars(8_480), 0n),
    line("1110", 0n, dollars(8_480)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "Other income collected", [
    line("1010", dollars(12_400), 0n),
    line("4100", 0n, dollars(12_400)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "Rent collections", [
    line("1010", dollars(285_000), 0n),
    line("1110", 0n, dollars(285_000)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "Operating expenses", [
    line("5110", dollars(42_000), 0n),
    line("5210", dollars(28_500), 0n),
    line("5310", dollars(31_200), 0n),
    line("5410", dollars(14_800), 0n),
    line("5510", dollars(6_200), 0n),
    line("5610", dollars(8_400), 0n),
    line("5710", dollars(18_500), 0n),
    line("5810", dollars(36_000), 0n),
    line("5910", dollars(9_480), 0n),
    line("5990", dollars(4_200), 0n),
    line("1010", 0n, dollars(169_280)),
    line("2010", 0n, dollars(22_000)),
    line("2020", 0n, dollars(8_000)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "Mortgage interest", [
    line("6110", dollars(80_500), 0n),
    line("1010", 0n, dollars(80_500)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "Depreciation", [
    line("6210", dollars(62_000), 0n),
    line("1490", 0n, dollars(62_000)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "OpCo asset management fee (below NOI)", [
    line("6310", dollars(4_740), 0n),
    line("2310", 0n, dollars(4_740)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "Mortgage principal — current", [
    line("2110", dollars(20_000), 0n),
    line("1010", 0n, dollars(20_000)),
  ]);
}

async function seedCrestview(entityId: string) {
  const jul = await period(entityId, 2026, 7);
  const aug = await period(entityId, 2026, 8);

  await post(entityId, jul.id, ny(2026, 7, 31), "Opening / acquisition balances", [
    line("1010", dollars(380_000), 0n),
    line("1020", dollars(288_000), 0n),
    line("1030", dollars(210_000), 0n),
    line("1040", dollars(134_400), 0n),
    line("1210", dollars(62_000), 0n),
    line("1410", dollars(3_600_000), 0n),
    line("1420", dollars(16_200_000), 0n),
    line("1430", dollars(420_000), 0n),
    line("1440", dollars(310_000), 0n),
    line("1450", dollars(240_000), 0n),
    line("2050", 0n, dollars(134_400)),
    line("2110", 0n, dollars(198_000)),
    line("2210", 0n, dollars(13_602_000)),
    line("3010", 0n, dollars(7_910_000)),
  ]);

  await post(entityId, aug.id, ny(2026, 8, 31), "Accrue GPR", [
    line("1110", dollars(272_640), 0n),
    line("4010", 0n, dollars(272_640)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "Vacancy loss", [
    line("4020", dollars(8_180), 0n),
    line("1110", 0n, dollars(8_180)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "Concessions", [
    line("4030", dollars(2_720), 0n),
    line("1110", 0n, dollars(2_720)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "Other income collected", [
    line("1010", dollars(9_600), 0n),
    line("4100", 0n, dollars(9_600)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "Rent collections", [
    line("1010", dollars(250_000), 0n),
    line("1110", 0n, dollars(250_000)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "Operating expenses", [
    line("5110", dollars(31_200), 0n),
    line("5210", dollars(16_400), 0n),
    line("5310", dollars(18_600), 0n),
    line("5410", dollars(11_200), 0n),
    line("5510", dollars(3_100), 0n),
    line("5610", dollars(6_800), 0n),
    line("5710", dollars(14_200), 0n),
    line("5810", dollars(29_500), 0n),
    line("5910", dollars(8_140), 0n),
    line("5990", dollars(2_400), 0n),
    line("1010", 0n, dollars(121_540)),
    line("2010", 0n, dollars(14_000)),
    line("2020", 0n, dollars(6_000)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "Mortgage interest", [
    line("6110", dollars(65_200), 0n),
    line("1010", 0n, dollars(65_200)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "Depreciation", [
    line("6210", dollars(48_000), 0n),
    line("1490", 0n, dollars(48_000)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "OpCo asset management fee (below NOI)", [
    line("6310", dollars(4_070), 0n),
    line("2310", 0n, dollars(4_070)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "Mortgage principal — current", [
    line("2110", dollars(16_500), 0n),
    line("1010", 0n, dollars(16_500)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "Member distribution", [
    line("3020", dollars(8_000), 0n),
    line("1010", 0n, dollars(8_000)),
  ]);
}

async function seedHarborCourt(entityId: string) {
  const jul = await period(entityId, 2026, 7);
  const aug = await period(entityId, 2026, 8);

  await post(entityId, jul.id, ny(2026, 7, 31), "Opening / acquisition + in-progress rehab", [
    line("1010", dollars(145_000), 0n),
    line("1020", dollars(84_000), 0n),
    line("1030", dollars(72_000), 0n),
    line("1040", dollars(50_400), 0n),
    line("1210", dollars(22_000), 0n),
    line("1410", dollars(1_150_000), 0n),
    line("1420", dollars(5_850_000), 0n),
    line("1430", dollars(780_000), 0n),
    line("1440", dollars(95_000), 0n),
    line("1450", dollars(110_000), 0n),
    line("2010", 0n, dollars(85_000)),
    line("2050", 0n, dollars(50_400)),
    line("2110", 0n, dollars(72_000)),
    line("2210", 0n, dollars(4_728_000)),
    line("3010", 0n, dollars(3_423_000)),
  ]);

  await post(entityId, aug.id, ny(2026, 8, 31), "Accrue GPR", [
    line("1110", dollars(99_120), 0n),
    line("4010", 0n, dollars(99_120)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "Vacancy loss", [
    line("4020", dollars(11_894), 0n),
    line("1110", 0n, dollars(11_894)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "Concessions", [
    line("4030", dollars(4_956), 0n),
    line("1110", 0n, dollars(4_956)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "Other income collected", [
    line("1010", dollars(3_200), 0n),
    line("4100", 0n, dollars(3_200)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "Rent collections", [
    line("1010", dollars(75_000), 0n),
    line("1110", 0n, dollars(75_000)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "Operating expenses", [
    line("5110", dollars(16_800), 0n),
    line("5210", dollars(14_200), 0n),
    line("5310", dollars(12_400), 0n),
    line("5410", dollars(5_600), 0n),
    line("5510", dollars(4_800), 0n),
    line("5610", dollars(3_200), 0n),
    line("5710", dollars(6_400), 0n),
    line("5810", dollars(9_800), 0n),
    line("5910", dollars(2_564), 0n),
    line("5990", dollars(1_800), 0n),
    line("1010", 0n, dollars(62_564)),
    line("2010", 0n, dollars(10_000)),
    line("2020", 0n, dollars(5_000)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "Mortgage interest", [
    line("6110", dollars(22_650), 0n),
    line("1010", 0n, dollars(22_650)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "Depreciation", [
    line("6210", dollars(19_500), 0n),
    line("1490", 0n, dollars(19_500)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "OpCo asset management fee (below NOI)", [
    line("6310", dollars(1_280), 0n),
    line("2310", 0n, dollars(1_280)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "Mortgage principal — current", [
    line("2110", dollars(6_000), 0n),
    line("1010", 0n, dollars(6_000)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "Light-rehab capital improvements", [
    line("1430", dollars(40_000), 0n),
    line("1010", 0n, dollars(25_000)),
    line("2010", 0n, dollars(15_000)),
  ]);
}

async function seedOpCo(entityId: string) {
  const jul = await period(entityId, 2026, 7);
  const aug = await period(entityId, 2026, 8);

  await post(entityId, jul.id, ny(2026, 7, 31), "Opening cash from HoldCo contribution", [
    line("1010", dollars(120_000), 0n),
    line("3010", 0n, dollars(120_000)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "Accrue SPE asset management fee income", [
    line("1310", dollars(10_090), 0n),
    line("7010", 0n, dollars(10_090)),
  ]);
  await post(entityId, aug.id, ny(2026, 8, 31), "OpCo operating expenses", [
    line("5110", dollars(18_000), 0n),
    line("5610", dollars(6_500), 0n),
    line("5710", dollars(1_200), 0n),
    line("5990", dollars(800), 0n),
    line("1010", 0n, dollars(24_000)),
    line("2010", 0n, dollars(2_500)),
  ]);
}

async function seedHoldCo(entityId: string) {
  const jul = await period(entityId, 2026, 7);
  await period(entityId, 2026, 8);
  await post(entityId, jul.id, ny(2026, 7, 31), "Opening liquidity and OpCo investment", [
    line("1010", dollars(380_000), 0n),
    line("1350", dollars(120_000), 0n),
    line("3010", 0n, dollars(500_000)),
  ]);
}

async function seedRentRolls(byCode: Record<string, string>) {
  const asOfDate = demoAsOfDate();
  for (const spec of SPE_RENT_ROLL_SPECS) {
    const entityId = byCode[spec.speCode];
    if (!entityId) throw new Error(`Missing entity ${spec.speCode}`);
    const units = buildDemoRentRoll(spec);
    assertDemoRentRoll(units, spec);
    await replaceRentRoll({ entityId, units, asOfDate });
  }
}

async function seedBudgets(byCode: Record<string, string>) {
  for (const [code, rows] of Object.entries(SPE_BUDGETS_2026_08)) {
    const entityId = byCode[code];
    if (!entityId) continue;
    assertBudgetCodes(rows);
    await replaceBudget({ entityId, year: 2026, month: 8, rows, source: "seed" });
  }
}

export async function isDemoSeeded() {
  return (await prisma.entity.count()) > 0;
}

export type SeedSummary = {
  alreadySeeded: boolean;
  journals: number;
  lines: number;
  units: number;
  budgets: number;
  loans: number;
  projects: number;
  locked: number;
  partners: number;
  vault: number;
  jobs: number;
};

async function wipeDemoData() {
  await prisma.reportJobRun.deleteMany();
  await prisma.reportJob.deleteMany();
  await prisma.vaultDocument.deleteMany();
  await prisma.vendorPayment.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.partnerCapitalActivity.deleteMany();
  await prisma.partner.deleteMany();
  await prisma.taxAdjustment.deleteMany();
  await prisma.macrsLifeHook.deleteMany();
  await prisma.periodCloseEvent.deleteMany();
  await prisma.closeChecklistItem.deleteMany();
  await prisma.loanPayment.deleteMany();
  await prisma.loan.deleteMany();
  await prisma.capexCost.deleteMany();
  await prisma.capexProject.deleteMany();
  await prisma.budgetLine.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.journalLine.deleteMany();
  await prisma.journal.deleteMany();
  await prisma.period.deleteMany();
  await prisma.account.deleteMany();
  await prisma.entity.deleteMany();
}

export async function runSeed(options: { wipe?: boolean } = {}): Promise<SeedSummary> {
  const wipe = options.wipe ?? true;
  const alreadySeeded = await isDemoSeeded();
  if (alreadySeeded && !wipe) {
    return {
      alreadySeeded: true,
      journals: await prisma.journal.count(),
      lines: await prisma.journalLine.count(),
      units: await prisma.unit.count(),
      budgets: await prisma.budgetLine.count(),
      loans: await prisma.loan.count(),
      projects: await prisma.capexProject.count(),
      locked: await prisma.period.count({ where: { status: "CLOSED" } }),
      partners: await prisma.partner.count(),
      vault: await prisma.vaultDocument.count(),
      jobs: await prisma.reportJob.count(),
    };
  }

  await wipeDemoData();

  await seedMasterCoaTemplate();

  const hold = await createEntityWithCoa({
    code: "RCP-HOLD",
    name: "Roche Capital Partners HoldCo",
    type: "HOLDCO",
  });
  const opco = await createEntityWithCoa({
    code: "RCP-OPCO",
    name: "RCP Operating Company LLC",
    type: "OPCO",
    parentId: hold.id,
  });
  const wbg = await createEntityWithCoa({
    code: "SPE-WBG",
    name: "Willow Bend Gardens LLC",
    type: "SPE",
    parentId: opco.id,
    ownershipBps: 10_000,
    unitCount: 264,
    strategy: "VALUE_ADD_GARDEN",
  });
  const cvc = await createEntityWithCoa({
    code: "SPE-CVC",
    name: "Crestview Commons LLC",
    type: "SPE",
    parentId: opco.id,
    ownershipBps: 10_000,
    unitCount: 192,
    strategy: "STABILIZED",
  });
  const hcr = await createEntityWithCoa({
    code: "SPE-HCR",
    name: "Harbor Court Residences LLC",
    type: "SPE",
    parentId: opco.id,
    ownershipBps: 10_000,
    unitCount: 84,
    strategy: "LIGHT_REHAB",
  });

  // createEntityWithCoa already clones; keep a no-op guard for idempotency.
  await cloneCoaToEntity(hold.id);

  await seedHoldCo(hold.id);
  await seedOpCo(opco.id);
  await seedWillowBend(wbg.id);
  await seedCrestview(cvc.id);
  await seedHarborCourt(hcr.id);

  const byCode = {
    "RCP-HOLD": hold.id,
    "RCP-OPCO": opco.id,
    "SPE-WBG": wbg.id,
    "SPE-CVC": cvc.id,
    "SPE-HCR": hcr.id,
  };
  await seedRentRolls(byCode);
  await seedBudgets(byCode);
  await seedLoansAndRolls(prisma, byCode, post);
  await seedCapexProjects(prisma, byCode, post);
  await seedCloseDemo(prisma, byCode);
  await seedPhaseF(prisma, byCode);

  const summary: SeedSummary = {
    alreadySeeded: false,
    journals: await prisma.journal.count(),
    lines: await prisma.journalLine.count(),
    units: await prisma.unit.count(),
    budgets: await prisma.budgetLine.count(),
    loans: await prisma.loan.count(),
    projects: await prisma.capexProject.count(),
    locked: await prisma.period.count({ where: { status: "CLOSED" } }),
    partners: await prisma.partner.count(),
    vault: await prisma.vaultDocument.count(),
    jobs: await prisma.reportJob.count(),
  };
  console.log(`Seeded ${summary.journals} journals / ${summary.lines} lines`);
  console.log(`Seeded ${summary.units} rent-roll units / ${summary.budgets} budget lines`);
  console.log(`Seeded ${summary.loans} loans / ${summary.projects} capex projects / ${summary.locked} hard-locked period(s)`);
  console.log(`Seeded ${summary.partners} partners / ${summary.vault} vault docs / ${summary.jobs} scheduled jobs`);
  console.log("Entities:");
  console.log("  Roche Capital Partners HoldCo (RCP-HOLD)");
  console.log("  RCP Operating Company LLC (RCP-OPCO)");
  console.log("  Willow Bend Gardens LLC (SPE-WBG) — 264 units, value-add garden");
  console.log("  Crestview Commons LLC (SPE-CVC) — 192 units, stabilized");
  console.log("  Harbor Court Residences LLC (SPE-HCR) — 84 units, light rehab");
  console.log("Demo data only — this system does not file taxes.");
  return summary;
}

function invokedFromCli() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href;
  } catch {
    return /seed\.ts$/.test(entry);
  }
}

async function main() {
  await runSeed({ wipe: true });
}

if (invokedFromCli()) {
  main()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
