import { readFileSync } from "node:fs";
import path from "node:path";
import { utils, write } from "xlsx";
import { buildIncomeStatement, dollars, incomeStatementJournal, type PostedLine } from "@rcp/ledger";
import {
  incomeStatementFromBudget,
  incomeStatementKeyedAmounts,
} from "@rcp/reporting";
import {
  leaseExpirationSummary,
  leaseMasterRecord,
  lossToLease,
  parseYardiLeaseCharges,
  rentRollEconomicOccupancyBps,
  rentRollGpr,
  rentRollNonRevenue,
  runRentRollTieOuts,
  signedLossToLease,
  summarizeRentRoll,
  type TieOutInput,
  type UnitSnapshot,
} from "@rcp/properties";
import { classifyCloseFile, parseCloseFile } from "@/lib/close/parse-file";
import {
  loadCloseWorkspace,
  postCloseToBooks,
  previewOperatingReversals,
  rememberMap,
  reverseOperatingJournals,
  setTieOutTolerance,
  storeCloseUpload,
  transitionClose,
} from "@/lib/close/workspace";
import { reviewTreeIntercompany } from "@/lib/intercompany";
import { importRentRollSource, loadUnits } from "@/lib/rent-roll";
import { loadYtdBudgetMap } from "@/lib/budgets";
import { openPeriod } from "@/lib/deals/periods";
import { createEntityWithCoa } from "@/lib/entities";
import { completeChecklist, hardLockPeriod, softClosePeriod } from "@/lib/period-close";
import { resolveReportingPeriod, spesStillOpen } from "@/lib/period-default";
import { buildOperatingPackage, priorYearSameMonth } from "@/lib/operating";
import { postJournal } from "@/lib/post-journal";
import { prisma } from "@/lib/prisma";
import { loadPostedLines } from "@/lib/queries";
import { hamptonLeaseChargesRows, hamptonLeaseChargesWorkbook } from "./fixtures/hampton-lease-charges";
import { afterAll, describe, expect, it } from "vitest";

const ids: string[] = [];

afterAll(async () => {
  for (const id of ids) {
    await prisma.journalLine.deleteMany({ where: { journal: { entityId: id } } });
    await prisma.journal.deleteMany({ where: { entityId: id } });
    await prisma.leasePeriodSnapshot.deleteMany({ where: { entityId: id } });
    await prisma.monthEndUpload.deleteMany({ where: { entityId: id } });
    await prisma.monthEndEvent.deleteMany({ where: { entityId: id } });
    await prisma.tieOutTolerance.deleteMany({ where: { entityId: id } });
    await prisma.vendorAccountMap.deleteMany({ where: { entityId: id } });
    await prisma.vaultDocument.deleteMany({ where: { entityId: id } });
    await prisma.unit.deleteMany({ where: { entityId: id } });
    await prisma.budgetLine.deleteMany({ where: { entityId: id } });
    await prisma.closeChecklistItem.deleteMany({ where: { period: { entityId: id } } });
    await prisma.periodCloseEvent.deleteMany({ where: { period: { entityId: id } } });
    await prisma.period.deleteMany({ where: { entityId: id } });
    await prisma.account.deleteMany({ where: { entityId: id } });
    await prisma.entity.delete({ where: { id } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

function sheet(rows: string[][]): Buffer {
  const book = utils.book_new();
  utils.book_append_sheet(book, utils.aoa_to_sheet(rows), "Sheet1");
  return Buffer.from(write(book, { type: "buffer", bookType: "xlsx" }));
}

function wbgProfitCsv(): Buffer {
  return readFileSync(path.join(process.cwd(), "tests/fixtures/wbg-2026-08-profit.csv"));
}

function wbgAugustT12(): Buffer {
  return sheet([
    ["Account", "Jul 2026", "Aug 2026", "T12"],
    ["Gross Potential Rent", "5000", "110000", "900000"],
    ["Payroll", "1000", "30000", "400000"],
  ]);
}

async function uploadProfit(entity: { id: string; code: string }, filename: string) {
  return storeCloseUpload({
    entityId: entity.id,
    entityCode: entity.code,
    year: 2026,
    month: 8,
    filename,
    mimeType: "text/csv",
    bytes: wbgProfitCsv(),
  });
}

async function stampUpload(id: string, iso: string) {
  await prisma.monthEndUpload.update({ where: { id }, data: { createdAt: new Date(iso) } });
}

function pnlCsv(): Buffer {
  return Buffer.from(
    [
      "Account,Actual,Budget,Var,YTD",
      'Gross Potential Rent,"12,000.00",10000,2000,"99,999.00"',
      'Vacancy Loss,"(5,000.00)",4000,-1000,"80,000.00"',
      'Payroll,"3,000.00",2500,500,"40,000.00"',
      'Net Operating Income,"4,000.00",3500,500,"82,000.00"',
    ].join("\n"),
    "utf8",
  );
}

const LEASE_FIELDS = [
  "property_code",
  "as_of_date",
  "unit_code",
  "building",
  "unit_type",
  "beds",
  "baths_tenths",
  "sqft",
  "unit_status",
  "unit_substatus",
  "resident_id",
  "resident_name",
  "lease_start",
  "lease_end",
  "move_in_date",
  "move_out_date",
  "notice_date",
  "market_rent",
  "lease_rent",
  "recurring_charges",
  "concession_amount",
  "concession_type",
  "concession_total",
  "concession_start",
  "concession_end",
  "amortization_method",
  "security_deposit_held",
  "balance_total",
  "aging_current",
  "aging_0_30",
  "aging_31_60",
  "aging_61_90",
  "aging_90_plus",
  "prepaid_balance",
  "mtm_flag",
  "renewal_status",
  "source_rows",
  "extras",
  "dialect",
] as const;

describe("close file parser", () => {
  it("posts GPR, vacancy, payroll, and NOI from the Actual column", () => {
    const parsed = parseCloseFile("august-pnl.csv", pnlCsv(), {
      classification: "income_statement",
      year: 2026,
      month: 8,
    });
    expect(parsed.control.blocksPosting).toBe(false);
    const gpr = parsed.lines.find((line) => line.accountCode === "4010");
    const vacancy = parsed.lines.find((line) => line.accountCode === "4020");
    const payroll = parsed.lines.find((line) => line.accountCode === "5110");
    expect(gpr?.signedCents).toBe("1200000");
    expect(vacancy?.signedCents).toBe("500000");
    expect(payroll?.signedCents).toBe("300000");
    expect(gpr?.ytdCents).toBe("9999900");
    const journal = incomeStatementJournal(
      parsed.lines
        .filter((line) => line.accountCode)
        .map((line) => ({ accountCode: line.accountCode!, signedCents: BigInt(line.signedCents), memo: line.sourceLabel })),
    );
    const vacancyLine = journal.find((line) => line.accountCode === "4020");
    expect(vacancyLine?.debit).toBe(500000n);
    expect(vacancyLine?.credit).toBe(0n);
    const posted: PostedLine[] = journal.map((line) => ({
      accountCode: line.accountCode,
      debit: line.debit,
      credit: line.credit,
    }));
    const statement = buildIncomeStatement({ throughEnd: posted, inPeriod: posted, eliminate: false });
    expect(statement.gpr).toBe(dollars(12_000));
    expect(statement.vacancy).toBe(dollars(5_000));
    expect(statement.opex).toBe(dollars(3_000));
    expect(statement.noi).toBe(dollars(4_000));
  });

  it("maps a balance-sheet line that starts with an RCP account number", () => {
    const parsed = parseCloseFile(
      "balance-sheet.csv",
      Buffer.from(["Account,Actual", "1010 Cash - Operating,5000"].join("\n"), "utf8"),
      { year: 2026, month: 8 },
    );
    const cash = parsed.lines.find((line) => /cash/i.test(line.sourceLabel));
    expect(cash?.accountCode).toBe("1010");
    expect(cash?.sourceAccountNo).toBe("1010");
    expect(parsed.unmapped.some((label) => /cash/i.test(label))).toBe(false);
    const foreign = parseCloseFile(
      "balance-sheet.csv",
      Buffer.from(["Account,Actual", "9999 Mystery Vendor,100"].join("\n"), "utf8"),
      { year: 2026, month: 8 },
    );
    expect(foreign.lines.find((line) => /mystery/i.test(line.sourceLabel))?.accountCode ?? null).toBeNull();
  });

  it("keeps a labeled row with a blank Actual and blocks posting", () => {
    const csv = Buffer.from("Account,Actual,Budget,Var,YTD\nMystery Fee,,100,0,100\n", "utf8");
    const parsed = parseCloseFile("blank.csv", csv, { classification: "income_statement", year: 2026, month: 8 });
    expect(parsed.lines.some((line) => /mystery fee/i.test(line.sourceLabel))).toBe(true);
    expect(parsed.flagged.length).toBeGreaterThan(0);
    expect(parsed.control.blocksPosting).toBe(true);
  });

  it("blocks posting when the file NOI does not match the mapped sum", () => {
    const csv = Buffer.from(
      'Account,Actual,Budget,Var,YTD\nGross Potential Rent,"12,000.00",0,0,0\nNet Operating Income,"1.00",0,0,0\n',
      "utf8",
    );
    const parsed = parseCloseFile("mismatch.csv", csv, { classification: "income_statement" });
    expect(parsed.control.noiTies).toBe(false);
    expect(parsed.control.blocksPosting).toBe(true);
  });

  it("sums GL debit and credit and ignores the running balance", () => {
    const csv = Buffer.from(
      'Account,Debit,Credit,Balance\nGross Potential Rent,0,"1,000.00","9,999,999.00"\nPayroll,"300.00",0,"9,999,999.00"\n',
      "utf8",
    );
    const parsed = parseCloseFile("gl.csv", csv, { classification: "gl_detail" });
    expect(parsed.lines.find((line) => line.accountCode === "4010")?.signedCents).toBe("100000");
    expect(parsed.lines.find((line) => line.accountCode === "5110")?.signedCents).toBe("30000");
  });

  it("posts the T12 close-month column instead of the trailing total", () => {
    const bytes = sheet([
      ["Account", "Jul 2026", "Aug 2026", "T12"],
      ["Gross Potential Rent", "100", "1000", "12000"],
    ]);
    const parsed = parseCloseFile("t12.xlsx", bytes, { classification: "t12", year: 2026, month: 8 });
    expect(parsed.lines.find((line) => line.accountCode === "4010")?.signedCents).toBe("100000");
    expect(parsed.note).toMatch(/Aug 2026/);
  });

  it("treats pnl, p&l, and p-l filenames as income statements and reads an Aug Actual column", () => {
    expect(classifyCloseFile("pnl.csv")).toBe("income_statement");
    expect(classifyCloseFile("P&L.csv")).toBe("income_statement");
    expect(classifyCloseFile("p-l.csv")).toBe("income_statement");
    expect(classifyCloseFile("WBG_PnL_Aug.csv")).toBe("income_statement");
    expect(classifyCloseFile("WBG_P&L_Aug.xlsx")).toBe("income_statement");
    const file = Buffer.from(
      [
        "Account,Aug Actual,YTD Actual",
        'Gross Potential Rent,"1,500.00","99,000.00"',
        'Payroll,"300.00","40,000.00"',
        'Net Operating Income,"1,200.00","59,000.00"',
      ].join("\n"),
      "utf8",
    );
    const august = parseCloseFile("pnl.csv", file, { year: 2026, month: 8 });
    expect(august.classification).toBe("income_statement");
    expect(august.control.blocksPosting).toBe(false);
    expect(august.lines.find((line) => line.accountCode === "4010")?.signedCents).toBe("150000");
    expect(august.lines.find((line) => line.accountCode === "5110")?.signedCents).toBe("30000");
    const july = parseCloseFile("pnl.csv", file, { year: 2026, month: 7 });
    expect(july.lines.filter((line) => line.accountCode && !line.flag)).toHaveLength(0);
    expect(july.control.blocksPosting).toBe(true);
    expect(july.note).toMatch(/posting is blocked/i);
    expect(july.note).toMatch(/July 2026/);
  });

  it("maps an Aug Actual header to the close month for a T12 file and blocks a missing month", () => {
    const bytes = sheet([
      ["Account", "Jul Actual", "Aug Actual", "YTD Actual"],
      ["Gross Potential Rent", "100", "1000", "12000"],
      ["Payroll", "40", "300", "4000"],
    ]);
    const august = parseCloseFile("t12.xlsx", bytes, { classification: "t12", year: 2026, month: 8 });
    expect(august.lines.find((line) => line.accountCode === "4010")?.signedCents).toBe("100000");
    expect(august.lines.find((line) => line.accountCode === "5110")?.signedCents).toBe("30000");
    expect(august.note).toMatch(/Aug Actual/);
    expect(august.control.blocksPosting).toBe(false);
    const missing = parseCloseFile("t12.xlsx", bytes, { classification: "t12", year: 2026, month: 9 });
    expect(missing.lines).toHaveLength(0);
    expect(missing.control.blocksPosting).toBe(true);
    expect(missing.note).toMatch(/September 2026/);
    expect(missing.note).toMatch(/posting is blocked/i);
    expect(missing.note).toMatch(/trailing total was not used/i);
  });
});

describe("GPR and lease master", () => {
  it("leaves economic occupancy unchanged when an offline down unit is added", () => {
    const occupied: UnitSnapshot = {
      unitCode: "101",
      floorplan: "A",
      beds: 1,
      bathsTenths: 10,
      sqft: 700,
      status: "OCCUPIED",
      marketRent: dollars(1_000),
      inPlaceRent: dollars(1_000),
      leaseStart: null,
      leaseEnd: null,
      concessionCents: 0n,
    };
    const down: UnitSnapshot = { ...occupied, unitCode: "102", status: "DOWN", substatus: "DOWN", inPlaceRent: 0n, marketRent: dollars(800) };
    expect(rentRollGpr([occupied, down])).toBe(dollars(1_000));
    expect(rentRollEconomicOccupancyBps([occupied])).toBe(rentRollEconomicOccupancyBps([occupied, down]));
  });

  it("stores the 29 lease-master fields and separates lease start from move-in", () => {
    const record = leaseMasterRecord({
      propertyCode: "SPE-QC",
      asOfDate: "2026-08-31",
      dialect: "csv",
      unitCode: "101",
      building: null,
      unitType: "A",
      beds: 1,
      bathsTenths: 10,
      sqft: 700,
      status: "OCCUPIED",
      substatus: "MODEL",
      residentId: "r1",
      residentName: "Ada",
      leaseStart: null,
      leaseEnd: "2026-12-31",
      moveIn: "2026-01-15",
      moveOut: null,
      marketRentCents: dollars(1_000),
      leaseRentCents: dollars(900),
      concessionCents: dollars(25),
      depositCents: dollars(50),
      balanceCents: dollars(-10),
      charges: [],
      extras: { notice_date: "2026-08-01", renewal_status: "OFFERED", aging_0_30: "100" },
      sourceRows: [2],
    });
    for (const field of LEASE_FIELDS) expect(record).toHaveProperty(field);
    expect(record.property_code).toBe("SPE-QC");
    expect(record.lease_start).toBeNull();
    expect(record.move_in_date).toBe("2026-01-15");
    expect(record.notice_date).toBe("2026-08-01");
    expect(record.mtm_flag).toBe(false);
    expect(record.prepaid_balance).toBe(dollars(10).toString());
    expect(record.renewal_status).toBe("OFFERED");
    expect(record.aging_0_30).toBe("100");
  });

  it("buckets expirations by quarter and reports term stats", () => {
    const summary = leaseExpirationSummary(
      [
        {
          unitCode: "1",
          status: "OCCUPIED",
          marketRentCents: dollars(100),
          leaseRentCents: dollars(100),
          leaseStart: "2026-01-01",
          leaseEnd: "2026-09-30",
          moveIn: "2026-01-01",
          moveOut: null,
          mtm: false,
          balanceCents: 0n,
          depositCents: 0n,
        },
      ],
      "2026-08-31",
    );
    expect(summary.quarters.find((bucket) => bucket.key === "2026-Q3")?.count).toBe(1);
    expect(summary.averageRemainingMonths).toBe(1);
    expect(summary.averageOriginalMonths).toBe(8);
    expect(summary.rentWeightedOriginalMonths).toBe(8);
  });
});

describe("budget sub-codes and prior-year comparison", () => {
  it("rolls payroll, repairs, and utility sub-codes into the parent groups", () => {
    const budget = new Map<string, bigint>([
      ["5110", dollars(10)],
      ["5120", dollars(5)],
      ["5210", dollars(2)],
      ["5220", dollars(3)],
      ["5310", dollars(1)],
      ["5320", dollars(1)],
      ["5330", dollars(1)],
      ["5340", dollars(1)],
      ["5350", dollars(1)],
    ]);
    const statement = incomeStatementFromBudget(budget);
    expect(statement.opex).toBe(dollars(25));
    expect(incomeStatementKeyedAmounts(statement).get("opex_payroll")).toBe(dollars(15));
    expect(incomeStatementKeyedAmounts(statement).get("opex_rm")).toBe(dollars(5));
    expect(incomeStatementKeyedAmounts(statement).get("opex_util")).toBe(dollars(5));
  });

  it("uses the same month last year as the comparison period", () => {
    expect(priorYearSameMonth(2026, 8)).toEqual({ year: 2025, month: 8 });
    expect(priorYearSameMonth(2026, 1)).toEqual({ year: 2025, month: 1 });
  });
});

function leaseChargesWorkbook(count: number, asOf: string): Buffer {
  const rows: string[][] = [
    ["Rent Roll with Lease Charges"],
    [`As Of = ${asOf}`],
    ["Property Name: Hampton Gardens"],
    [],
    ["Unit", "Unit Type", "Unit", "Resident", "Name", "Market", "Charge", "Amount", "Resident", "Other", "Move In", "Lease", "Move Out", "Balance"],
    ["", "", "Sq Ft", "", "", "", "Code", "", "Deposit", "Deposit", "", "Expiration", "", ""],
    ["Current/Notice/Vacant Residents"],
  ];
  for (let i = 1; i <= count; i += 1) {
    const code = `H${String(i).padStart(4, "0")}`;
    rows.push([code, "1PW", "540", `R${i}`, `Resident ${i}`, "1000.00", "r-rent", "1000.00", "0.00", "0.00", "1/15/2026", "12/31/2026", "", "0.00"]);
    rows.push(["", "", "", "", "", "", "Total", "1000.00"]);
  }
  rows.push(["Summary of Charges by Charge Code"]);
  const book = utils.book_new();
  utils.book_append_sheet(book, utils.aoa_to_sheet([["Cover"]]), "Cover");
  utils.book_append_sheet(book, utils.aoa_to_sheet(rows), "Rent Roll with Lease Charges");
  return Buffer.from(write(book, { type: "buffer", bookType: "xlsx" }));
}

describe("close upload, posting, and tie-outs", () => {
  it("resolves the latest closed period for a SPE, OpCo, and HoldCo", async () => {
    expect(await resolveReportingPeriod("SPE-WBG", null)).toBe("2026-07");
    expect(await resolveReportingPeriod("RCP-OPCO", null)).toBe("2026-08");
    expect(await resolveReportingPeriod("RCP-HOLD", null)).toBe("2026-08");
    expect(await resolveReportingPeriod("SPE-WBG", "2026-08")).toBe("2026-08");
    const stillOpen = await spesStillOpen("RCP-OPCO", "2026-07");
    const seededSpes = new Set(["SPE-WBG", "SPE-CVC", "SPE-HCR"]);
    expect(stillOpen.map((spe) => spe.code).filter((code) => seededSpes.has(code))).toEqual(["SPE-CVC", "SPE-HCR"]);
  });

  it("runs the close path on a 511-unit Lease Charges file without replacing a past month or the SPE unit count", async () => {
    const opco = await prisma.entity.findUnique({ where: { code: "RCP-OPCO" } });
    if (!opco) throw new Error("Seed RCP-OPCO first");
    const entity = await createEntityWithCoa({
      code: `SPE-Q511${Date.now().toString(36).slice(-4).toUpperCase()}`,
      name: "QC Hampton Path LLC",
      type: "SPE",
      parentId: opco.id,
      unitCount: 999,
    });
    ids.push(entity.id);
    await openPeriod(entity.id, 2026, 9);
    const past = await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 3,
      filename: "hampton-511-lease-charges.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: leaseChargesWorkbook(511, "03/15/2026"),
    });
    expect(past.rentRollUnits).toBe(511);
    expect(await prisma.unit.count({ where: { entityId: entity.id } })).toBe(0);
    expect(await prisma.leasePeriodSnapshot.count({ where: { entityId: entity.id, year: 2026, month: 3 } })).toBe(511);
    const live = await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 9,
      filename: "hampton-511-lease-charges.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: leaseChargesWorkbook(511, "09/15/2026"),
    });
    expect(live.rentRollUnits).toBe(511);
    expect(await prisma.unit.count({ where: { entityId: entity.id } })).toBe(511);
    const fresh = await prisma.entity.findUnique({ where: { id: entity.id } });
    expect(fresh?.unitCount).toBe(999);
    const snapshot = await prisma.leasePeriodSnapshot.findFirst({ where: { entityId: entity.id, year: 2026, month: 9 } });
    const payload = JSON.parse(snapshot?.payloadJson ?? "{}") as { property_code?: string; lease_start?: string | null; move_in_date?: string | null };
    expect(payload.property_code).toBe(entity.code);
    expect(payload.move_in_date).toBeTruthy();
    expect(payload.lease_start ?? null).toBeNull();
    const workspace = await loadCloseWorkspace(entity.id, 2026, 9);
    expect(workspace.tieOuts.find((row) => row.id === "RR-11")?.severity).toBe("hard_fail");
    expect(workspace.tieOuts.find((row) => row.id === "RR-11")?.detail).toMatch(/999/);
  });

  it("uses the file as-of, the snapshot, the charge mismatch, and a saved tolerance", async () => {
    const opco = await prisma.entity.findUnique({ where: { code: "RCP-OPCO" } });
    if (!opco) throw new Error("Seed RCP-OPCO first");
    const entity = await createEntityWithCoa({
      code: `SPE-QTIE${Date.now().toString(36).slice(-4).toUpperCase()}`,
      name: "QC Tie Out LLC",
      type: "SPE",
      parentId: opco.id,
      unitCount: 1,
    });
    ids.push(entity.id);
    await openPeriod(entity.id, 2026, 9);
    const csv = Buffer.from(
      "As of 2026-03-15\nunit_id,floorplan,beds,baths,sqft,status,market_rent,in_place_rent,concession\n101,A1,1,1,700,OCCUPIED,500.00,400.00,25.00\n",
      "utf8",
    );
    await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 8,
      filename: "rent-roll.csv",
      mimeType: "text/csv",
      bytes: csv,
    });
    const afterUpload = await prisma.entity.findUnique({ where: { id: entity.id } });
    expect(afterUpload?.unitCount).toBe(1);
    expect(await prisma.unit.count({ where: { entityId: entity.id } })).toBe(0);
    await prisma.unit.create({
      data: {
        entityId: entity.id,
        unitCode: "LIVE",
        floorplan: "Z",
        beds: 2,
        bathsTenths: 20,
        sqft: 900,
        status: "VACANT",
        marketRent: dollars(9_000),
        inPlaceRent: 0n,
        concessionCents: dollars(99),
        asOfDate: new Date("2026-08-31T16:00:00.000Z"),
      },
    });
    const workspace = await loadCloseWorkspace(entity.id, 2026, 8);
    expect(workspace.tieOuts.find((row) => row.id === "RR-12")?.severity).toBe("hard_fail");
    expect(workspace.tieOuts.find((row) => row.id === "RR-12")?.detail).toMatch(/2026-03-15/);
    expect(workspace.tieOuts.find((row) => row.id === "RR-4")?.rentRollCents).toBe(0n);
    expect(workspace.tieOuts.find((row) => row.id === "RR-5")?.rentRollCents).toBe(dollars(25));
    expect(workspace.tieOuts.find((row) => row.id === "RR-6")?.rentRollCents).toBe(0n);
    expect(workspace.tieOuts.find((row) => row.id === "RR-7")?.severity).toBe("na");
    expect(workspace.tieOuts.find((row) => row.id === "RR-1")?.severity).toBe("warning");
    await prisma.tieOutTolerance.create({
      data: { entityId: entity.id, key: "gpr", cents: dollars(10_000) },
    });
    const tolerated = await loadCloseWorkspace(entity.id, 2026, 8);
    expect(tolerated.tieOuts.find((row) => row.id === "RR-1")?.severity).toBe("pass");

    const mismatchRows: string[][] = [
      ["Rent Roll with Lease Charges"],
      ["As Of = 05/15/2026"],
      ["Property Name: Hampton Gardens"],
      [],
      ["Unit", "Unit Type", "Unit", "Resident", "Name", "Market", "Charge", "Amount", "Resident", "Other", "Move In", "Lease", "Move Out", "Balance"],
      ["", "", "Sq Ft", "", "", "", "Code", "", "Deposit", "Deposit", "", "Expiration", "", ""],
      ["Current/Notice/Vacant Residents"],
      ["H0001", "1PW", "540", "R1", "Resident", "1000.00", "r-rent", "1000.00", "0.00", "0.00", "1/15/2026", "12/31/2026", "", "0.00"],
      ["", "", "", "", "", "", "Total", "50.00"],
    ];
    await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 5,
      filename: "hampton-mismatch.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: sheet(mismatchRows),
    });
    const mismatched = await loadCloseWorkspace(entity.id, 2026, 5);
    expect(mismatched.tieOuts.find((row) => row.id === "RR-13")?.severity).toBe("warning");
    expect(mismatched.tieOuts.find((row) => row.id === "RR-13")?.detail).toMatch(/1 unit/);
    const hampton = await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 4,
      filename: "hampton-lease-charges.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: hamptonLeaseChargesWorkbook(),
    });
    expect(hampton.rentRollUnits).toBe(8);
    const august = await loadCloseWorkspace(entity.id, 2026, 4);
    expect(august.tieOuts.find((row) => row.id === "RR-7")?.severity).not.toBe("na");
    expect(august.tieOuts.find((row) => row.id === "RR-12")?.severity).toBe("hard_fail");
  });

  it("refuses an archived SPE, a closed month, a second operating journal, and a suspense lock", async () => {
    const opco = await prisma.entity.findUnique({ where: { code: "RCP-OPCO" } });
    if (!opco) throw new Error("Seed RCP-OPCO first");
    const archived = await createEntityWithCoa({
      code: `SPE-QARC${Date.now().toString(36).slice(-4).toUpperCase()}`,
      name: "QC Archived LLC",
      type: "SPE",
      parentId: opco.id,
      unitCount: 1,
    });
    ids.push(archived.id);
    await prisma.entity.update({ where: { id: archived.id }, data: { lifecycleStatus: "ARCHIVED" } });
    await expect(
      storeCloseUpload({
        entityId: archived.id,
        entityCode: archived.code,
        year: 2026,
        month: 8,
        filename: "pnl.csv",
        mimeType: "text/csv",
        bytes: pnlCsv(),
      }),
    ).rejects.toThrow(/soft-archived/);

    const entity = await createEntityWithCoa({
      code: `SPE-QPST${Date.now().toString(36).slice(-4).toUpperCase()}`,
      name: "QC Posting LLC",
      type: "SPE",
      parentId: opco.id,
      unitCount: 1,
    });
    ids.push(entity.id);

    await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 8,
      filename: "august-pnl.csv",
      mimeType: "text/csv",
      bytes: pnlCsv(),
    });
    await postCloseToBooks({ entityId: entity.id, year: 2026, month: 8 });
    const first = await prisma.journal.findFirst({ where: { entityId: entity.id, source: "month_end_is" } });
    expect(first).toBeTruthy();
    await transitionClose({ entityId: entity.id, year: 2026, month: 8, action: "soft" });
    await postCloseToBooks({
      entityId: entity.id,
      year: 2026,
      month: 8,
      controllerOverride: "yes",
      reason: "Repost the soft-closed package",
    });
    const stillThere = await prisma.journal.findUnique({ where: { id: first!.id } });
    expect(stillThere).toBeTruthy();
    expect(await prisma.journal.count({ where: { entityId: entity.id, source: "month_end_is_reversal" } })).toBe(1);
    expect(await prisma.journal.count({ where: { entityId: entity.id, source: "month_end_is" } })).toBe(2);

    await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 8,
      filename: "rent-roll.csv",
      mimeType: "text/csv",
      bytes: Buffer.from(
        "As of 2026-08-31\nunit_id,floorplan,beds,baths,sqft,status,market_rent,in_place_rent\n101,A1,1,1,700,OCCUPIED,500.00,500.00\n",
        "utf8",
      ),
    });
    const period = await prisma.period.findUnique({
      where: { entityId_year_month: { entityId: entity.id, year: 2026, month: 8 } },
    });
    await completeChecklist(period!.id);
    await postJournal({
      entityId: entity.id,
      periodId: period!.id,
      date: new Date("2026-08-31T16:00:00.000Z"),
      memo: "Suspense",
      source: "manual_suspense",
      allowControllerAdjustment: true,
      lines: [
        { accountCode: "1999", debit: 100n, credit: 0n },
        { accountCode: "2010", debit: 0n, credit: 100n },
      ],
    });
    await expect(transitionClose({ entityId: entity.id, year: 2026, month: 8, action: "hard" })).rejects.toThrow(/1999/);

    await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 6,
      filename: "unmapped.csv",
      mimeType: "text/csv",
      bytes: Buffer.from("Account,Actual\nZorbax mystery fee,25.00\n", "utf8"),
    });
    await expect(transitionClose({ entityId: entity.id, year: 2026, month: 6, action: "hard" })).rejects.toThrow(/Unmapped|suspense/i);

    await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 2,
      filename: "bad-control.csv",
      mimeType: "text/csv",
      bytes: Buffer.from('Account,Actual\nGross Potential Rent,"12,000.00"\nNet Operating Income,"1.00"\n', "utf8"),
    });
    await expect(postCloseToBooks({ entityId: entity.id, year: 2026, month: 2 })).rejects.toThrow(/NOI|control|blocked/i);

    await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 1,
      filename: "january-pnl.csv",
      mimeType: "text/csv",
      bytes: pnlCsv(),
    });
    const january = await prisma.period.findUniqueOrThrow({
      where: { entityId_year_month: { entityId: entity.id, year: 2026, month: 1 } },
    });
    await postJournal({
      entityId: entity.id,
      periodId: january.id,
      date: new Date("2026-01-31T16:00:00.000Z"),
      memo: "Operating payroll",
      source: "operating",
      lines: [
        { accountCode: "5110", debit: dollars(10), credit: 0n },
        { accountCode: "2010", debit: 0n, credit: dollars(10) },
      ],
    });
    await expect(postCloseToBooks({ entityId: entity.id, year: 2026, month: 1 })).rejects.toThrow(/NOI twice/);

    await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 7,
      filename: "july-pnl.csv",
      mimeType: "text/csv",
      bytes: pnlCsv(),
    });
    const julyPeriod = await prisma.period.findUniqueOrThrow({
      where: { entityId_year_month: { entityId: entity.id, year: 2026, month: 7 } },
    });
    await softClosePeriod(julyPeriod.id);
    await completeChecklist(julyPeriod.id);
    await hardLockPeriod(julyPeriod.id);
    await expect(
      storeCloseUpload({
        entityId: entity.id,
        entityCode: entity.code,
        year: 2026,
        month: 7,
        filename: "july-replace.csv",
        mimeType: "text/csv",
        bytes: pnlCsv(),
      }),
    ).rejects.toThrow(/hard-locked|Closed/);
    await expect(transitionClose({ entityId: entity.id, year: 2026, month: 7, action: "reopen" })).rejects.toThrow(/reason|ticket/i);
    await transitionClose({
      entityId: entity.id,
      year: 2026,
      month: 7,
      action: "reopen",
      reason: "QC replacement",
      ticket: "QC-7",
    });
    const reopened = await prisma.period.findUnique({ where: { id: julyPeriod.id } });
    expect(reopened?.status).toBe("OPEN");
  });

  it("keeps file NOI across three soft-closed reposts", async () => {
    const entity = await freshSpe("SPE-QREP", "QC Repost LLC");
    const file = Buffer.from(
      ["Account,Actual", 'Gross Potential Rent,"100,000.00"', 'Payroll,"29,500.00"', 'Net Operating Income,"70,500.00"'].join("\n"),
      "utf8",
    );
    await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 8,
      filename: "repost-pnl.csv",
      mimeType: "text/csv",
      bytes: file,
    });
    await postCloseToBooks({ entityId: entity.id, year: 2026, month: 8 });
    expect(await periodNoi(entity.id, 2026, 8)).toBe(dollars(70_500));
    await transitionClose({ entityId: entity.id, year: 2026, month: 8, action: "soft" });
    for (let i = 0; i < 3; i += 1) {
      await postCloseToBooks({
        entityId: entity.id,
        year: 2026,
        month: 8,
        controllerOverride: "yes",
        reason: "Controller repost",
      });
      expect(await periodNoi(entity.id, 2026, 8)).toBe(dollars(70_500));
    }
    const reversals = await prisma.journal.findMany({
      where: { entityId: entity.id, source: "month_end_is_reversal" },
    });
    expect(reversals).toHaveLength(3);
    expect(new Set(reversals.map((row) => row.reversesJournalId)).size).toBe(3);
    expect(reversals.every((row) => row.reversesJournalId)).toBe(true);
  });

  it("posts one wbg-2026-08-profit file when two P&Ls are uploaded", async () => {
    const entity = await freshSpe("SPE-Q2PL", "QC Two P&L LLC");
    const older = await uploadProfit(entity, "wbg-2026-08-profit.csv");
    const newer = await uploadProfit(entity, "wbg-2026-08-profit-v2.csv");
    await stampUpload(older.uploadId, "2026-08-01T12:00:00.000Z");
    await stampUpload(newer.uploadId, "2026-08-02T12:00:00.000Z");
    const view = await loadCloseWorkspace(entity.id, 2026, 8);
    expect(view.defaultIncomeUploadId).toBe(newer.uploadId);
    expect(view.uploads.find((file) => file.id === older.uploadId)?.incomePosting).toBe("superseded");
    expect(view.uploads.find((file) => file.id === newer.uploadId)?.incomePosting).toBe("source");
    await postCloseToBooks({ entityId: entity.id, year: 2026, month: 8 });
    expect(await periodNoi(entity.id, 2026, 8)).toBe(dollars(70_500));
  });

  it("posts wbg-2026-08-profit instead of adding a T12 with an August column", async () => {
    const entity = await freshSpe("SPE-QPLT", "QC P&L Plus T12 LLC");
    const profit = await uploadProfit(entity, "wbg-2026-08-profit.csv");
    const t12 = await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 8,
      filename: "wbg-2026-08-t12.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: wbgAugustT12(),
    });
    await stampUpload(profit.uploadId, "2026-08-01T12:00:00.000Z");
    await stampUpload(t12.uploadId, "2026-08-03T12:00:00.000Z");
    const view = await loadCloseWorkspace(entity.id, 2026, 8);
    expect(view.uploads.find((file) => file.id === profit.uploadId)?.incomePosting).toBe("source");
    expect(view.uploads.find((file) => file.id === t12.uploadId)?.incomePosting).toBe("superseded");
    await postCloseToBooks({ entityId: entity.id, year: 2026, month: 8 });
    expect(await periodNoi(entity.id, 2026, 8)).toBe(dollars(70_500));
  });

  it("posts only the T12 close-month column when that file is the chosen source", async () => {
    const entity = await freshSpe("SPE-QT12", "QC Chosen T12 LLC");
    await uploadProfit(entity, "wbg-2026-08-profit.csv");
    const t12 = await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 8,
      filename: "wbg-2026-08-t12.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: wbgAugustT12(),
    });
    await postCloseToBooks({ entityId: entity.id, year: 2026, month: 8, incomeUploadId: t12.uploadId });
    expect(await periodNoi(entity.id, 2026, 8)).toBe(dollars(80_000));
  });

  it("keeps a chosen T12 at $75,000 when a later post omits the choice", async () => {
    const entity = await freshSpe("SPE-QSRC", "QC Saved Income Source LLC");
    const profit = await uploadProfit(entity, "wbg-2026-08-profit.csv");
    await stampUpload(profit.uploadId, "2026-08-01T12:00:00.000Z");
    const t12 = await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 8,
      filename: "chosen-t12.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: sheet([
        ["Account", "Aug 2026", "T12"],
        ["Gross Potential Rent", "75000", "900000"],
      ]),
    });
    await stampUpload(t12.uploadId, "2026-08-02T12:00:00.000Z");
    const before = await loadCloseWorkspace(entity.id, 2026, 8);
    expect(before.defaultIncomeUploadId).toBe(profit.uploadId);
    expect(before.incomeSourceSummary).toMatch(/wbg-2026-08-profit\.csv/);
    expect(before.uploads.find((file) => file.id === t12.uploadId)?.incomePosting).toBe("superseded");

    await postCloseToBooks({ entityId: entity.id, year: 2026, month: 8, incomeUploadId: t12.uploadId });
    expect(await periodNoi(entity.id, 2026, 8)).toBe(dollars(75_000));
    const saved = await loadCloseWorkspace(entity.id, 2026, 8);
    expect(saved.savedIncomeUploadId).toBe(t12.uploadId);
    expect(saved.defaultIncomeUploadId).toBe(t12.uploadId);
    expect(saved.incomeSourceSummary).toBe("Income source: chosen-t12.xlsx — saved for this SPE and period.");
    expect(saved.uploads.find((file) => file.id === t12.uploadId)?.incomePosting).toBe("source");
    expect(saved.uploads.find((file) => file.id === t12.uploadId)?.postingLabel).toMatch(/close-month column/);
    expect(saved.uploads.find((file) => file.id === profit.uploadId)?.postingLabel).toBe("Superseded — not posted");

    await postCloseToBooks({ entityId: entity.id, year: 2026, month: 8 });
    expect(await periodNoi(entity.id, 2026, 8)).toBe(dollars(75_000));

    const newer = await uploadProfit(entity, "newer-profit.csv");
    await stampUpload(newer.uploadId, "2026-08-20T12:00:00.000Z");
    const noticed = await loadCloseWorkspace(entity.id, 2026, 8);
    expect(noticed.defaultIncomeUploadId).toBe(t12.uploadId);
    expect(noticed.incomeSourceSummary).toMatch(/chosen-t12\.xlsx/);
    expect(noticed.incomeSourceSummary).not.toMatch(/profit/);
    expect(noticed.newerIncomeNotice).toBe(
      "A newer income file is in this package (newer-profit.csv). The saved source stays in place until you select the newer file.",
    );
    expect(noticed.uploads.find((file) => file.id === newer.uploadId)?.incomePosting).toBe("superseded");
    await postCloseToBooks({ entityId: entity.id, year: 2026, month: 8 });
    expect(await periodNoi(entity.id, 2026, 8)).toBe(dollars(75_000));
  });

  it("posts one balance sheet when two identical files are uploaded", async () => {
    const entity = await freshSpe("SPE-QBS1", "QC Identical Balance Sheet LLC");
    const older = await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 8,
      filename: "balance-sheet.csv",
      mimeType: "text/csv",
      bytes: Buffer.from(["Account,Actual", "2010 Accounts Payable,10000"].join("\n"), "utf8"),
    });
    const newer = await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 8,
      filename: "balance-sheet-v2.csv",
      mimeType: "text/csv",
      bytes: Buffer.from(["Account,Actual", "2010 Accounts Payable,10000"].join("\n"), "utf8"),
    });
    await stampUpload(older.uploadId, "2026-08-01T12:00:00.000Z");
    await stampUpload(newer.uploadId, "2026-08-02T12:00:00.000Z");
    const view = await loadCloseWorkspace(entity.id, 2026, 8);
    expect(view.defaultBalanceUploadId).toBe(newer.uploadId);
    expect(view.uploads.find((file) => file.id === older.uploadId)?.balancePosting).toBe("superseded");
    expect(view.uploads.find((file) => file.id === older.uploadId)?.postingLabel).toBe("Superseded — not posted");
    expect(view.uploads.find((file) => file.id === newer.uploadId)?.balancePosting).toBe("source");
    await postCloseToBooks({ entityId: entity.id, year: 2026, month: 8 });
    expect(await accountNet(entity.id, "2010")).toBe(-dollars(10_000));
    expect(await accountNet(entity.id, "1999")).toBe(dollars(10_000));
  });

  it("posts one balance sheet when two files have different amounts and keeps that choice", async () => {
    const entity = await freshSpe("SPE-QBS2", "QC Different Balance Sheet LLC");
    const older = await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 8,
      filename: "balance-sheet.csv",
      mimeType: "text/csv",
      bytes: Buffer.from(["Account,Actual", "2010 Accounts Payable,10000"].join("\n"), "utf8"),
    });
    const newer = await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 8,
      filename: "balance-sheet-v2.csv",
      mimeType: "text/csv",
      bytes: Buffer.from(["Account,Actual", "2010 Accounts Payable,15000"].join("\n"), "utf8"),
    });
    await stampUpload(older.uploadId, "2026-08-01T12:00:00.000Z");
    await stampUpload(newer.uploadId, "2026-08-02T12:00:00.000Z");
    await postCloseToBooks({ entityId: entity.id, year: 2026, month: 8 });
    expect(await accountNet(entity.id, "2010")).toBe(-dollars(15_000));
    expect(await accountNet(entity.id, "1999")).toBe(dollars(15_000));

    await postCloseToBooks({ entityId: entity.id, year: 2026, month: 8, balanceUploadId: older.uploadId });
    expect(await accountNet(entity.id, "2010")).toBe(-dollars(10_000));
    expect(await accountNet(entity.id, "1999")).toBe(dollars(10_000));
    const saved = await loadCloseWorkspace(entity.id, 2026, 8);
    expect(saved.savedBalanceUploadId).toBe(older.uploadId);
    expect(saved.defaultBalanceUploadId).toBe(older.uploadId);
    expect(saved.balanceSourceSummary).toBe("Balance sheet source: balance-sheet.csv — saved for this SPE and period.");
    expect(saved.uploads.find((file) => file.id === newer.uploadId)?.postingLabel).toBe("Superseded — not posted");
    expect(saved.newerBalanceNotice).toMatch(/balance-sheet-v2\.csv/);

    await postCloseToBooks({ entityId: entity.id, year: 2026, month: 8 });
    expect(await accountNet(entity.id, "2010")).toBe(-dollars(10_000));

    const third = await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 8,
      filename: "balance-sheet-v3.csv",
      mimeType: "text/csv",
      bytes: Buffer.from(["Account,Actual", "2010 Accounts Payable,7000"].join("\n"), "utf8"),
    });
    await stampUpload(third.uploadId, "2026-08-20T12:00:00.000Z");
    const noticed = await loadCloseWorkspace(entity.id, 2026, 8);
    expect(noticed.defaultBalanceUploadId).toBe(older.uploadId);
    expect(noticed.newerBalanceNotice).toBe(
      "A newer balance sheet file is in this package (balance-sheet-v3.csv). The saved source stays in place until you select the newer file.",
    );
    await postCloseToBooks({ entityId: entity.id, year: 2026, month: 8 });
    expect(await accountNet(entity.id, "2010")).toBe(-dollars(10_000));
    expect(await accountNet(entity.id, "1999")).toBe(dollars(10_000));
  });

  it("refuses a blocked balance sheet and posts the newest file that can be chosen", async () => {
    const entity = await freshSpe("SPE-QBSB", "QC Blocked Balance Sheet LLC");
    const good = await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 8,
      filename: "balance-sheet.csv",
      mimeType: "text/csv",
      bytes: Buffer.from(["Account,Actual", "2010 Accounts Payable,10000"].join("\n"), "utf8"),
    });
    const blocked = await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 8,
      filename: "balance-sheet-v2.csv",
      mimeType: "text/csv",
      bytes: Buffer.from(["Account,Actual", "2010 Accounts Payable,"].join("\n"), "utf8"),
    });
    await stampUpload(good.uploadId, "2026-08-01T12:00:00.000Z");
    await stampUpload(blocked.uploadId, "2026-08-02T12:00:00.000Z");
    await expect(
      postCloseToBooks({ entityId: entity.id, year: 2026, month: 8, balanceUploadId: blocked.uploadId }),
    ).rejects.toThrow(/cannot be chosen/);
    const view = await loadCloseWorkspace(entity.id, 2026, 8);
    expect(view.uploads.find((file) => file.id === blocked.uploadId)?.blocksPosting).toBe(true);
    expect(view.defaultBalanceUploadId).toBe(good.uploadId);
    expect(view.uploads.find((file) => file.id === blocked.uploadId)?.balancePosting).toBe("superseded");
    await postCloseToBooks({ entityId: entity.id, year: 2026, month: 8 });
    expect(await accountNet(entity.id, "2010")).toBe(-dollars(10_000));
    expect(await accountNet(entity.id, "1999")).toBe(dollars(10_000));
  });

  it("keeps wbg-2026-08-profit NOI when a v2 file is posted after soft close", async () => {
    const entity = await freshSpe("SPE-QV2", "QC V2 Repost LLC");
    const first = await uploadProfit(entity, "wbg-2026-08-profit.csv");
    await stampUpload(first.uploadId, "2026-08-01T12:00:00.000Z");
    await postCloseToBooks({ entityId: entity.id, year: 2026, month: 8 });
    expect(await periodNoi(entity.id, 2026, 8)).toBe(dollars(70_500));
    await transitionClose({ entityId: entity.id, year: 2026, month: 8, action: "soft" });
    const v2 = await uploadProfit(entity, "wbg-2026-08-profit-v2.csv");
    await stampUpload(v2.uploadId, "2026-08-20T12:00:00.000Z");
    await postCloseToBooks({
      entityId: entity.id,
      year: 2026,
      month: 8,
      controllerOverride: "yes",
      reason: "Post the v2 profit file",
    });
    expect(await periodNoi(entity.id, 2026, 8)).toBe(dollars(70_500));
    const source = await loadCloseWorkspace(entity.id, 2026, 8);
    expect(source.uploads.find((file) => file.id === v2.uploadId)?.incomePosting).toBe("source");
    expect(source.uploads.find((file) => file.filename === "wbg-2026-08-profit.csv")?.incomePosting).toBe("superseded");
  });

  it("refuses posting or reversing a soft-closed month without a controller override", async () => {
    const entity = await freshSpe("SPE-QOVR", "QC Override Refuse LLC");
    await uploadProfit(entity, "wbg-2026-08-profit.csv");
    await postCloseToBooks({ entityId: entity.id, year: 2026, month: 8 });
    await transitionClose({ entityId: entity.id, year: 2026, month: 8, action: "soft" });
    await expect(postCloseToBooks({ entityId: entity.id, year: 2026, month: 8 })).rejects.toThrow(
      /soft-closed|controller override/i,
    );
    await expect(
      postCloseToBooks({ entityId: entity.id, year: 2026, month: 8, controllerOverride: "yes" }),
    ).rejects.toThrow(/reason/i);
    await expect(
      postCloseToBooks({ entityId: entity.id, year: 2026, month: 8, controllerOverride: "yes", reason: "   " }),
    ).rejects.toThrow(/reason/i);
    expect(await periodNoi(entity.id, 2026, 8)).toBe(dollars(70_500));
    expect(await prisma.monthEndEvent.count({ where: { entityId: entity.id, action: "CONTROLLER_OVERRIDE" } })).toBe(0);

    const april = await openPeriod(entity.id, 2026, 4);
    await postJournal({
      entityId: entity.id,
      periodId: april.id,
      date: new Date("2026-04-30T16:00:00.000Z"),
      memo: "Seeded April GPR",
      source: "seed",
      lines: [
        { accountCode: "1110", debit: dollars(100), credit: 0n },
        { accountCode: "4010", debit: 0n, credit: dollars(100) },
      ],
    });
    await transitionClose({ entityId: entity.id, year: 2026, month: 4, action: "soft" });
    await expect(
      reverseOperatingJournals({
        entityId: entity.id,
        year: 2026,
        month: 4,
        reason: "Replace the seeded journal",
      }),
    ).rejects.toThrow(/soft-closed|controller override/i);
    expect(await prisma.journal.count({ where: { entityId: entity.id, source: "operating_reversal" } })).toBe(0);
    expect(await prisma.monthEndEvent.count({ where: { entityId: entity.id, action: "CONTROLLER_OVERRIDE" } })).toBe(0);
  });

  it("logs the controller override reason when a soft-closed post or reversal is allowed", async () => {
    const entity = await freshSpe("SPE-QLOG", "QC Override Log LLC");
    await uploadProfit(entity, "wbg-2026-08-profit.csv");
    await postCloseToBooks({ entityId: entity.id, year: 2026, month: 8 });
    await transitionClose({ entityId: entity.id, year: 2026, month: 8, action: "soft" });
    await postCloseToBooks({
      entityId: entity.id,
      year: 2026,
      month: 8,
      controllerOverride: "yes",
      reason: "Correct the August package",
    });
    expect(await periodNoi(entity.id, 2026, 8)).toBe(dollars(70_500));
    const posted = await prisma.monthEndEvent.findFirst({
      where: { entityId: entity.id, month: 8, action: "CONTROLLER_OVERRIDE" },
    });
    expect(posted?.detail).toBe("Correct the August package");

    const march = await openPeriod(entity.id, 2026, 3);
    await postJournal({
      entityId: entity.id,
      periodId: march.id,
      date: new Date("2026-03-31T16:00:00.000Z"),
      memo: "Seeded March GPR",
      source: "seed",
      lines: [
        { accountCode: "1110", debit: dollars(100), credit: 0n },
        { accountCode: "4010", debit: 0n, credit: dollars(100) },
      ],
    });
    await transitionClose({ entityId: entity.id, year: 2026, month: 3, action: "soft" });
    await reverseOperatingJournals({
      entityId: entity.id,
      year: 2026,
      month: 3,
      reason: "Replace seeded March books",
      controllerOverride: true,
    });
    const reversed = await prisma.monthEndEvent.findFirst({
      where: { entityId: entity.id, month: 3, action: "CONTROLLER_OVERRIDE" },
    });
    expect(reversed?.detail).toBe("Replace seeded March books");
    expect(await prisma.journal.count({ where: { entityId: entity.id, source: "operating_reversal" } })).toBe(1);
  });

  it("ties and posts a loss NOI without taking the absolute value", async () => {
    const file = Buffer.from(
      ["Account,Actual", 'Gross Potential Rent,"10,000.00"', 'Payroll,"29,500.00"', 'Net Operating Income,"(19,500.00)"'].join("\n"),
      "utf8",
    );
    const parsed = parseCloseFile("loss-pnl.csv", file, { year: 2026, month: 8 });
    expect(parsed.control.noiTies).toBe(true);
    expect(parsed.control.blocksPosting).toBe(false);
    expect(parsed.control.sourceNoiCents).toBe(dollars(-19_500).toString());
    const entity = await freshSpe("SPE-QLOS", "QC Loss NOI LLC");
    await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 8,
      filename: "loss-pnl.csv",
      mimeType: "text/csv",
      bytes: file,
    });
    await postCloseToBooks({ entityId: entity.id, year: 2026, month: 8 });
    expect(await periodNoi(entity.id, 2026, 8)).toBe(dollars(-19_500));
  });

  it("reads MODEL and DOWN from the Hampton resident name and keeps model out of loss-to-lease", async () => {
    const rows = hamptonLeaseChargesRows();
    const summary = rows.findIndex((row) => row[0] === "Summary of Charges by Charge Code");
    rows.splice(
      summary,
      0,
      ["171L799-1", "1P/V", "540", "MODEL", "MODEL", "1220.00", "r-rent", "0.00", "0.00", "0.00", "", "", "", "0.00"],
      ["", "", "", "", "", "", "Total", "0.00"],
      ["171L799-2", "1P/V", "540", "DOWN", "DOWN", "1220.00", "", "", "0.00", "0.00", "", "", "", "0.00"],
    );
    const parsed = parseYardiLeaseCharges(rows);
    const model = parsed.units.find((unit) => unit.unitCode === "171L799-1");
    const down = parsed.units.find((unit) => unit.unitCode === "171L799-2");
    expect(model?.status).toBe("OCCUPIED");
    expect(model?.extras.unit_substatus).toBe("MODEL");
    expect(down?.status).toBe("DOWN");
    expect(down?.extras.unit_substatus).toBe("DOWN");
    const snaps = parsed.units.map((unit) =>
      snap({
        unitCode: unit.unitCode,
        status: unit.status,
        marketRent: unit.marketRentCents,
        inPlaceRent: unit.inPlaceRentCents,
        substatus: unit.extras.unit_substatus,
      }),
    );
    const withoutSpecial = snaps.filter((unit) => unit.unitCode !== "171L799-1" && unit.unitCode !== "171L799-2");
    expect(rentRollGpr(snaps) - rentRollGpr(withoutSpecial)).toBe(dollars(1_220));
    expect(rentRollNonRevenue(snaps)).toBe(dollars(1_220));
    const explicit = parseYardiLeaseCharges([
      ["Unit", "Resident", "Name", "Status", "Market", "Charge", "Amount"],
      ["", "", "", "", "", "Code", ""],
      ["101", "t1", "Model", "Down", "1000.00", "r-rent", "0.00"],
      ["", "", "", "", "", "Total", "0.00"],
    ]);
    expect(explicit.units[0]?.status).toBe("DOWN");
    expect(explicit.units[0]?.extras.unit_substatus).toBe("DOWN");

    const entity = await freshSpe("SPE-QMOD", "QC Model LLC");
    const only = [snap({ unitCode: "MOD", status: "OCCUPIED", marketRent: dollars(1_220), inPlaceRent: 0n, substatus: "MODEL" })];
    expect(rentRollNonRevenue(only)).toBe(dollars(1_220));
    expect(signedLossToLease(only)).toBe(0n);
    expect(lossToLease(only)).toBe(0n);
    await prisma.leasePeriodSnapshot.create({
      data: {
        entityId: entity.id,
        year: 2026,
        month: 3,
        unitCode: "MOD",
        payloadJson: JSON.stringify({
          unit_status: "OCCUPIED",
          unit_substatus: "MODEL",
          market_rent: dollars(1_220).toString(),
          lease_rent: "0",
        }),
      },
    });
    const workspace = await loadCloseWorkspace(entity.id, 2026, 3);
    expect(workspace.tieOuts.find((row) => row.id === "RR-6")?.rentRollCents).toBe(dollars(1_220));
    expect(workspace.tieOuts.find((row) => row.id === "RR-3")?.rentRollCents).toBe(0n);
    expect(workspace.tieOuts.find((row) => row.id === "RR-2")?.rentRollCents).toBe(0n);
  });

  it("counts an MTM flag saved as a boolean or as text", async () => {
    const entity = await freshSpe("SPE-QMTM", "QC MTM LLC");
    await prisma.leasePeriodSnapshot.createMany({
      data: [
        { entityId: entity.id, year: 2026, month: 8, unitCode: "B", payloadJson: JSON.stringify({ unit_status: "OCCUPIED", market_rent: "100", lease_rent: "100", mtm_flag: true }) },
        { entityId: entity.id, year: 2026, month: 8, unitCode: "T", payloadJson: JSON.stringify({ unit_status: "OCCUPIED", market_rent: "100", lease_rent: "100", mtm_flag: "yes" }) },
        { entityId: entity.id, year: 2026, month: 8, unitCode: "F", payloadJson: JSON.stringify({ unit_status: "OCCUPIED", market_rent: "100", lease_rent: "100", mtm_flag: false }) },
        { entityId: entity.id, year: 2026, month: 8, unitCode: "S", payloadJson: JSON.stringify({ unit_status: "OCCUPIED", market_rent: "100", lease_rent: "100", mtm_flag: "false" }) },
      ],
    });
    const workspace = await loadCloseWorkspace(entity.id, 2026, 8);
    expect(workspace.summary.mtmCount).toBe(2);
    expect(workspace.summary.buckets.find((bucket) => bucket.key === "mtm")?.count).toBe(2);
  });

  it("replaces live units for the latest open month and writes only a snapshot for earlier or reopened months", async () => {
    const entity = await freshSpe("SPE-QLIV", "QC Live Roll LLC");
    await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 8,
      filename: "rent-roll.csv",
      mimeType: "text/csv",
      bytes: rollCsv("2026-08-31", "AUG", "OCCUPIED", "500.00", "500.00"),
    });
    expect(await prisma.unit.count({ where: { entityId: entity.id } })).toBe(1);
    expect((await prisma.unit.findFirst({ where: { entityId: entity.id } }))?.unitCode).toBe("AUG");
    await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 7,
      filename: "rent-roll.csv",
      mimeType: "text/csv",
      bytes: rollCsv("2026-07-31", "JUL", "OCCUPIED", "400.00", "400.00"),
    });
    expect(await prisma.unit.count({ where: { entityId: entity.id } })).toBe(1);
    expect((await prisma.unit.findFirst({ where: { entityId: entity.id } }))?.unitCode).toBe("AUG");
    expect(await prisma.leasePeriodSnapshot.count({ where: { entityId: entity.id, year: 2026, month: 7 } })).toBe(1);
    await transitionClose({ entityId: entity.id, year: 2026, month: 8, action: "soft" });
    await transitionClose({
      entityId: entity.id,
      year: 2026,
      month: 8,
      action: "reopen",
      reason: "Replace the August roll",
      ticket: "QC-LIVE",
    });
    await prisma.unit.deleteMany({ where: { entityId: entity.id } });
    await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 8,
      filename: "rent-roll.csv",
      mimeType: "text/csv",
      bytes: rollCsv("2026-08-31", "AUG2", "OCCUPIED", "500.00", "500.00"),
    });
    expect(await prisma.unit.count({ where: { entityId: entity.id } })).toBe(0);
    expect(await prisma.leasePeriodSnapshot.count({ where: { entityId: entity.id, year: 2026, month: 8, unitCode: "AUG2" } })).toBe(1);
  });

  it("reverses blocking operating journals so the package can post", async () => {
    const entity = await freshSpe("SPE-QREV", "QC Reverse LLC");
    await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 8,
      filename: "august-pnl.csv",
      mimeType: "text/csv",
      bytes: pnlCsv(),
    });
    const period = await openPeriod(entity.id, 2026, 8);
    await postJournal({
      entityId: entity.id,
      periodId: period.id,
      date: new Date("2026-08-31T16:00:00.000Z"),
      memo: "Seeded GPR",
      source: "seed",
      lines: [
        { accountCode: "1110", debit: dollars(100), credit: 0n },
        { accountCode: "4010", debit: 0n, credit: dollars(100) },
      ],
    });
    await expect(postCloseToBooks({ entityId: entity.id, year: 2026, month: 8 })).rejects.toThrow(/NOI twice/);
    await expect(reverseOperatingJournals({ entityId: entity.id, year: 2026, month: 8, reason: "   " })).rejects.toThrow(/reason/i);
    const reversed = await reverseOperatingJournals({
      entityId: entity.id,
      year: 2026,
      month: 8,
      reason: "Replace seeded August books with the manager package",
    });
    expect(reversed.reversed).toBe(1);
    const reversal = await prisma.journal.findFirst({ where: { entityId: entity.id, source: "operating_reversal" } });
    expect(reversal?.reversesJournalId).toBeTruthy();
    await postCloseToBooks({ entityId: entity.id, year: 2026, month: 8 });
    expect(await periodNoi(entity.id, 2026, 8)).toBe(dollars(4_000));
  });

  it("reverses only the above-NOI portion of a mixed journal and leaves a balancing entry", async () => {
    const entity = await freshSpe("SPE-QMIX", "QC Mixed Reverse LLC");
    const period = await openPeriod(entity.id, 2026, 8);
    await postJournal({
      entityId: entity.id,
      periodId: period.id,
      date: new Date("2026-08-31T16:00:00.000Z"),
      memo: "Payroll and mortgage interest",
      source: "seed",
      lines: [
        { accountCode: "5110", debit: dollars(100), credit: 0n },
        { accountCode: "6110", debit: dollars(40), credit: 0n },
        { accountCode: "1010", debit: 0n, credit: dollars(140) },
      ],
    });
    const preview = await previewOperatingReversals({ entityId: entity.id, year: 2026, month: 8 });
    expect(preview).toHaveLength(1);
    expect(preview[0]?.partial).toBe(true);
    expect(preview[0]?.memo).toBe("Payroll and mortgage interest");
    expect(preview[0]?.amountCents).toBe(dollars(100));
    await reverseOperatingJournals({
      entityId: entity.id,
      year: 2026,
      month: 8,
      reason: "Replace the above-NOI payroll line and keep interest",
    });
    const reversal = await prisma.journal.findFirst({
      where: { entityId: entity.id, source: "operating_reversal" },
      include: { lines: true },
    });
    const debit = reversal?.lines.reduce((acc, line) => acc + line.debit, 0n) ?? 0n;
    const credit = reversal?.lines.reduce((acc, line) => acc + line.credit, 0n) ?? 0n;
    expect(debit).toBe(credit);
    expect(debit).toBe(dollars(100));
    expect(await accountNet(entity.id, "5110")).toBe(0n);
    expect(await accountNet(entity.id, "6110")).toBe(dollars(40));
    const lines = await loadPostedLines({
      entityIds: [entity.id],
      from: new Date(Date.UTC(2026, 7, 1)),
      to: new Date(Date.UTC(2026, 7, 31, 23, 59, 59)),
    });
    const statement = buildIncomeStatement({ throughEnd: lines, inPeriod: lines, eliminate: false });
    expect(statement.interest).toBe(dollars(40));
    expect(statement.noi).toBe(0n);
  });

  it("uses one above-NOI absolute amount for a full journal and a partial journal", async () => {
    const entity = await freshSpe("SPE-QAMT", "QC Amount LLC");
    const period = await openPeriod(entity.id, 2026, 8);
    await postJournal({
      entityId: entity.id,
      periodId: period.id,
      date: new Date("2026-08-31T16:00:00.000Z"),
      memo: "Revenue and payroll",
      source: "seed",
      lines: [
        { accountCode: "4010", debit: 0n, credit: dollars(1_500) },
        { accountCode: "5110", debit: dollars(300), credit: 0n },
        { accountCode: "1010", debit: dollars(1_200), credit: 0n },
      ],
    });
    await postJournal({
      entityId: entity.id,
      periodId: period.id,
      date: new Date("2026-08-31T16:00:00.000Z"),
      memo: "Revenue, payroll, and interest",
      source: "seed",
      lines: [
        { accountCode: "4010", debit: 0n, credit: dollars(1_500) },
        { accountCode: "5110", debit: dollars(300), credit: 0n },
        { accountCode: "6110", debit: dollars(200), credit: 0n },
        { accountCode: "1010", debit: dollars(1_000), credit: 0n },
      ],
    });
    const preview = await previewOperatingReversals({ entityId: entity.id, year: 2026, month: 8 });
    expect(preview).toHaveLength(2);
    for (const row of preview) {
      expect(row.needsManualSplit).toBe(false);
      expect(row.amountCents).toBe(dollars(1_800));
    }
    expect(preview.find((row) => row.memo === "Revenue and payroll")?.partial).toBe(false);
    expect(preview.find((row) => row.memo === "Revenue, payroll, and interest")?.partial).toBe(true);
  });

  it("blocks a journal that mixes operating lines with an OpCo mirror instead of skipping it", async () => {
    const entity = await freshSpe("SPE-QMAN", "QC Manual Split LLC");
    const period = await openPeriod(entity.id, 2026, 8);
    await postJournal({
      entityId: entity.id,
      periodId: period.id,
      date: new Date("2026-08-31T16:00:00.000Z"),
      memo: "GPR with related-party mirror",
      source: "seed",
      lines: [
        { accountCode: "4010", debit: 0n, credit: dollars(1_500) },
        { accountCode: "5110", debit: dollars(300), credit: 0n },
        { accountCode: "1310", debit: dollars(1_200), credit: 0n },
      ],
    });
    await postJournal({
      entityId: entity.id,
      periodId: period.id,
      date: new Date("2026-08-31T16:00:00.000Z"),
      memo: "OpCo asset management fee only",
      source: "seed",
      lines: [
        { accountCode: "6310", debit: dollars(50), credit: 0n },
        { accountCode: "2310", debit: 0n, credit: dollars(50) },
      ],
    });
    const preview = await previewOperatingReversals({ entityId: entity.id, year: 2026, month: 8 });
    expect(preview.map((row) => row.memo)).toEqual(["GPR with related-party mirror"]);
    expect(preview[0]?.needsManualSplit).toBe(true);
    expect(preview[0]?.amountCents).toBe(dollars(1_800));
    await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 8,
      filename: "august-pnl.csv",
      mimeType: "text/csv",
      bytes: pnlCsv(),
    });
    await expect(postCloseToBooks({ entityId: entity.id, year: 2026, month: 8 })).rejects.toThrow(/manual split/);
    await expect(
      reverseOperatingJournals({
        entityId: entity.id,
        year: 2026,
        month: 8,
        reason: "Try to reverse the mixed journal",
      }),
    ).rejects.toThrow(/manual split/);
    expect(await prisma.journal.count({ where: { entityId: entity.id, source: "operating_reversal" } })).toBe(0);
    expect(await prisma.journal.count({ where: { entityId: entity.id, source: "month_end_is" } })).toBe(0);
    expect(await accountNet(entity.id, "4010")).toBe(-dollars(1_500));
    expect(await accountNet(entity.id, "5110")).toBe(dollars(300));
    await prisma.journalLine.deleteMany({ where: { journal: { entityId: entity.id } } });
    await prisma.journal.deleteMany({ where: { entityId: entity.id } });
  });

  it("refuses to post a P&L or T12 that mapped no income lines", async () => {
    const entity = await freshSpe("SPE-QNIL", "QC Empty P&L LLC");
    const augustFile = Buffer.from(
      [
        "Account,Aug Actual,YTD Actual",
        'Gross Potential Rent,"1,500.00","99,000.00"',
        'Payroll,"300.00","40,000.00"',
        'Net Operating Income,"1,200.00","59,000.00"',
      ].join("\n"),
      "utf8",
    );
    await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 8,
      filename: "pnl.csv",
      mimeType: "text/csv",
      bytes: augustFile,
    });
    await postCloseToBooks({ entityId: entity.id, year: 2026, month: 8 });
    expect(await periodNoi(entity.id, 2026, 8)).toBe(dollars(1_200));

    await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 7,
      filename: "pnl.csv",
      mimeType: "text/csv",
      bytes: augustFile,
    });
    await expect(postCloseToBooks({ entityId: entity.id, year: 2026, month: 7 })).rejects.toThrow(
      /posting is blocked|no income lines|no column/i,
    );
    const july = await loadCloseWorkspace(entity.id, 2026, 7);
    expect(july.uploads[0]?.blocksPosting).toBe(true);
    expect(july.uploads[0]?.note).toMatch(/posting is blocked/i);
    expect(july.uploads[0]?.note).toMatch(/July 2026/);
    expect(await prisma.journal.count({ where: { entityId: entity.id, source: "month_end_is", period: { month: 7 } } })).toBe(0);

    const aug = await openPeriod(entity.id, 2026, 5);
    await postJournal({
      entityId: entity.id,
      periodId: aug.id,
      date: new Date("2026-05-31T16:00:00.000Z"),
      memo: "Seeded May GPR",
      source: "seed",
      lines: [
        { accountCode: "1110", debit: dollars(100), credit: 0n },
        { accountCode: "4010", debit: 0n, credit: dollars(100) },
      ],
    });
    await reverseOperatingJournals({
      entityId: entity.id,
      year: 2026,
      month: 5,
      reason: "Replace seeded May books with the manager package",
    });
    await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 5,
      filename: "t12.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: sheet([
        ["Account", "Jul 2026", "T12"],
        ["Gross Potential Rent", "100", "12000"],
      ]),
    });
    await expect(postCloseToBooks({ entityId: entity.id, year: 2026, month: 5 })).rejects.toThrow(
      /posting is blocked|no column/i,
    );
    expect(await periodNoi(entity.id, 2026, 5)).toBe(0n);
    expect(await prisma.journal.count({ where: { entityId: entity.id, source: "month_end_is", period: { month: 5 } } })).toBe(0);
    const may = await loadCloseWorkspace(entity.id, 2026, 5);
    const t12 = may.uploads.find((file) => file.filename === "t12.xlsx");
    expect(t12?.blocksPosting).toBe(true);
    expect(t12?.note).toMatch(/May 2026/);
    expect(t12?.note).toMatch(/posting is blocked/i);
  });

  it("posts an all-unmapped income statement after both labels are remembered, without uploading again", async () => {
    const entity = await freshSpe("SPE-QMAP", "QC Remember Map LLC");
    const file = Buffer.from(["Account,Aug Actual", "Zork Revenue Widget,1000", "Frobnicator Cost,200"].join("\n"), "utf8");
    await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 8,
      filename: "august-profit.csv",
      mimeType: "text/csv",
      bytes: file,
    });
    const blocked = await loadCloseWorkspace(entity.id, 2026, 8);
    expect(blocked.uploads[0]?.classification).toBe("income_statement");
    expect(blocked.uploads[0]?.unmapped).toEqual(["Zork Revenue Widget", "Frobnicator Cost"]);
    expect(blocked.uploads[0]?.blocksPosting).toBe(true);
    await expect(postCloseToBooks({ entityId: entity.id, year: 2026, month: 8 })).rejects.toThrow(/no mapped income lines/i);
    await rememberMap({
      entityId: entity.id,
      sourceSystem: entity.code,
      sourceAccountNo: "",
      label: "Zork Revenue Widget",
      accountCode: "4010",
      year: 2026,
      month: 8,
    });
    await rememberMap({
      entityId: entity.id,
      sourceSystem: entity.code,
      sourceAccountNo: "",
      label: "Frobnicator Cost",
      accountCode: "5110",
      year: 2026,
      month: 8,
    });
    const ready = await loadCloseWorkspace(entity.id, 2026, 8);
    expect(ready.uploads[0]?.unmapped).toEqual([]);
    expect(ready.uploads[0]?.blocksPosting).toBe(false);
    expect(await prisma.monthEndUpload.count({ where: { entityId: entity.id, year: 2026, month: 8 } })).toBe(1);
    await postCloseToBooks({ entityId: entity.id, year: 2026, month: 8 });
    expect(await periodNoi(entity.id, 2026, 8)).toBe(dollars(800));
  });

  it("keeps SPE-WBG interest, depreciation, and the AM fee when a P&L package replaces above-NOI journals", async () => {
    const wbg = await prisma.entity.findUnique({ where: { code: "SPE-WBG" } });
    if (!wbg) throw new Error("Seed SPE-WBG first");
    const through = new Date("2026-08-31T23:59:59.000Z");
    await clearWbgAugustClose(wbg.id);
    try {
      const before = await reviewTreeIntercompany(through);
      expect(before.ok).toBe(true);
      const preview = await previewOperatingReversals({ entityId: wbg.id, year: 2026, month: 8 });
      const memos = preview.map((row) => row.memo);
      expect(memos).toEqual(expect.arrayContaining(["Accrue GPR", "Operating expenses"]));
      expect(memos.join(" ")).not.toMatch(/Mortgage interest|Depreciation|asset management fee/i);
      expect(preview.find((row) => row.memo === "Accrue GPR")?.amountCents).toBe(dollars(339_240));
      expect(preview.every((row) => row.partial === false)).toBe(true);
      await reverseOperatingJournals({
        entityId: wbg.id,
        year: 2026,
        month: 8,
        reason: "Replace seeded above-NOI August books with the manager package",
      });
      await storeCloseUpload({
        entityId: wbg.id,
        entityCode: wbg.code,
        year: 2026,
        month: 8,
        filename: "profit.csv",
        mimeType: "text/csv",
        bytes: pnlCsv(),
      });
      await postCloseToBooks({ entityId: wbg.id, year: 2026, month: 8 });
      const posted = await prisma.journal.findFirst({
        where: { entityId: wbg.id, source: "month_end_is" },
        include: { lines: { include: { account: true } } },
      });
      const postedCodes = new Set(posted?.lines.map((line) => line.account.code));
      expect(postedCodes.has("6110")).toBe(false);
      expect(postedCodes.has("6210")).toBe(false);
      expect(postedCodes.has("6310")).toBe(false);
      const after = await reviewTreeIntercompany(through);
      expect(after.ok).toBe(true);
      const lines = await loadPostedLines({
        entityIds: [wbg.id],
        from: new Date(Date.UTC(2026, 7, 1)),
        to: new Date(Date.UTC(2026, 7, 31, 23, 59, 59)),
      });
      const statement = buildIncomeStatement({ throughEnd: lines, inPeriod: lines, eliminate: false });
      expect(statement.interest).toBe(dollars(80_500));
      expect(statement.depreciation).toBe(dollars(62_000));
      expect(statement.amFees).toBe(dollars(4_740));
      expect(statement.netIncome).toBe(statement.noi - statement.interest - statement.depreciation - statement.amFees);
      expect(statement.noi).toBe(dollars(4_000));
    } finally {
      await clearWbgAugustClose(wbg.id);
    }
  });

  it("keeps MODEL on 4040 with no loss-to-lease, and DOWN out of GPR, for CSV, redIQ, and Yardi", async () => {
    const cases = [
      {
        filename: "rent-roll.csv",
        mimeType: "text/csv",
        bytes: Buffer.from(
          [
            "unit_id,floorplan,beds,baths,sqft,status,market_rent,in_place_rent",
            "101,A1,1,1,700,OCCUPIED,1000.00,1000.00",
            "102,A1,1,1,700,MODEL,1220.00,0",
            "103,A1,1,1,700,DOWN,800.00,0",
          ].join("\n"),
          "utf8",
        ),
        dialect: "canonical_csv",
      },
      {
        filename: "rediq-rent-roll.csv",
        mimeType: "text/csv",
        bytes: Buffer.from(
          [
            "UnitID,PlanID,NetSF,Bed,Bath,OccStatus,MktRent,InPlaceRent",
            "101,A1,700,1,1,Occupied,1000,1000",
            "102,A1,700,1,1,MODEL,1220,0",
            "103,A1,700,1,1,Down,800,0",
          ].join("\n"),
          "utf8",
        ),
        dialect: "redi_q_machine",
      },
      {
        filename: "yardi-lease-charges.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        bytes: sheet([
          ["Residential Rent Roll with Lease Charges"],
          ["As of: 08/31/2026"],
          ["Unit", "Unit Type", "Unit Sq Ft", "Resident", "Name", "Status", "Market", "Charge Code", "Amount"],
          ["101", "A1", "700", "R101", "Smith", "Occupied", "1000", "rent", "1000"],
          ["102", "A1", "700", "M102", "Model", "MODEL", "1220", "rent", "0"],
          ["103", "A1", "700", "D103", "Offline", "DOWN", "800", "rent", "0"],
        ]),
        dialect: "yardi_lease_charges",
      },
    ] as const;
    for (const [index, file] of cases.entries()) {
      const entity = await freshSpe(`SPE-QSUB${index}`, "QC Substatus LLC");
      const imported = await importRentRollSource({
        entityId: entity.id,
        filename: file.filename,
        mimeType: file.mimeType,
        bytes: file.bytes,
        confirmReplace: true,
      });
      expect(imported.dialect).toBe(file.dialect);
      const units = await loadUnits([entity.id]);
      const model = units.find((unit) => unit.unitCode === "102");
      const down = units.find((unit) => unit.unitCode === "103");
      expect(model?.status).toBe("OCCUPIED");
      expect(model?.substatus).toBe("MODEL");
      expect(down?.status).toBe("DOWN");
      expect(down?.substatus).toBe("DOWN");
      const roll = summarizeRentRoll(units);
      expect(roll.gpr).toBe(dollars(2_220));
      expect(roll.nonRevenueDeduction).toBe(dollars(1_220));
      expect(roll.lossToLease).toBe(0n);
      expect(roll.signedLossToLease).toBe(0n);
      expect(roll.inPlaceRent).toBe(dollars(1_000));
      const operating = await buildOperatingPackage({
        entityId: entity.id,
        year: 2026,
        month: 8,
        consolidated: false,
      });
      expect(operating.kpis.rentRoll?.nonRevenueDeduction).toBe(dollars(1_220));
      expect(operating.kpis.rentRoll?.lossToLease).toBe(0n);
      expect(operating.kpis.rentRoll?.inPlaceRent).toBe(dollars(1_000));
      expect(await prisma.leasePeriodSnapshot.count({ where: { entityId: entity.id } })).toBe(0);
      const workspace = await loadCloseWorkspace(entity.id, 2026, 8);
      expect(workspace.tieOuts.find((row) => row.id === "RR-6")?.rentRollCents).toBe(dollars(1_220));
      expect(workspace.tieOuts.find((row) => row.id === "RR-3")?.rentRollCents).toBe(0n);
    }
  });

  it("rejects an unknown tolerance key and lets asof_days pass RR-12", async () => {
    const entity = await freshSpe("SPE-QTOL", "QC Tolerance LLC");
    await expect(setTieOutTolerance({ entityId: entity.id, key: "nope", cents: 1n })).rejects.toThrow(/Unknown tie-out key/);
    await expect(setTieOutTolerance({ entityId: entity.id, key: "days", days: 30 })).rejects.toThrow(/Unknown tie-out key/);
    const outside = runRentRollTieOuts(tieInput("2026-03-15", "2026-08-31"));
    expect(outside.find((row) => row.id === "RR-12")?.severity).toBe("hard_fail");
    const inside = runRentRollTieOuts(
      tieInput("2026-03-15", "2026-08-31", { asof_days: { days: 200 } }),
    );
    expect(inside.find((row) => row.id === "RR-12")?.severity).toBe("pass");
    expect(inside.find((row) => row.id === "RR-12")?.detail).toMatch(/inside the 200-day tolerance/);
    await storeCloseUpload({
      entityId: entity.id,
      entityCode: entity.code,
      year: 2026,
      month: 8,
      filename: "rent-roll.csv",
      mimeType: "text/csv",
      bytes: rollCsv("2026-03-15", "101", "OCCUPIED", "500.00", "500.00"),
    });
    expect((await loadCloseWorkspace(entity.id, 2026, 8)).tieOuts.find((row) => row.id === "RR-12")?.severity).toBe(
      "hard_fail",
    );
    await setTieOutTolerance({ entityId: entity.id, key: "asof_days", days: 200, year: 2026, month: 8 });
    const saved = await loadCloseWorkspace(entity.id, 2026, 8);
    expect(saved.tieOuts.find((row) => row.id === "RR-12")?.severity).toBe("pass");
    expect(saved.tolerances.find((row) => row.key === "asof_days")?.days).toBe(200);
  });

  it("uses the latest month closed by every live SPE", async () => {
    const hold = await prisma.entity.findUnique({ where: { code: "RCP-HOLD" } });
    if (!hold) throw new Error("Seed RCP-HOLD first");
    const suffix = Date.now().toString(36).slice(-4).toUpperCase();
    const left = await createEntityWithCoa({
      code: `SPE-QL${suffix}`,
      name: "QC Left LLC",
      type: "SPE",
      parentId: hold.id,
      unitCount: 1,
    });
    const right = await createEntityWithCoa({
      code: `SPE-QR${suffix}`,
      name: "QC Right LLC",
      type: "SPE",
      parentId: hold.id,
      unitCount: 1,
    });
    const opco = await createEntityWithCoa({
      code: `OPC-Q${suffix}`,
      name: "QC OpCo LLC",
      type: "OPCO",
      parentId: hold.id,
    });
    await prisma.entity.update({ where: { id: left.id }, data: { parentId: opco.id } });
    await prisma.entity.update({ where: { id: right.id }, data: { parentId: opco.id } });
    ids.push(left.id, right.id, opco.id);
    await lockMonth(left.id, 2026, 5);
    await lockMonth(left.id, 2026, 4);
    await lockMonth(right.id, 2026, 4);
    expect(await resolveReportingPeriod(opco.code, null)).toBe("2026-04");
    expect(await resolveReportingPeriod(opco.code, "2026-05")).toBe("2026-05");
    const open = await spesStillOpen(opco.code, "2026-05");
    expect(open.map((spe) => spe.code)).toEqual([right.code]);
  });
});

async function freshSpe(prefix: string, name: string) {
  const opco = await prisma.entity.findUnique({ where: { code: "RCP-OPCO" } });
  if (!opco) throw new Error("Seed RCP-OPCO first");
  const entity = await createEntityWithCoa({
    code: `${prefix}${Date.now().toString(36).slice(-4).toUpperCase()}`,
    name,
    type: "SPE",
    parentId: opco.id,
    unitCount: 1,
  });
  ids.push(entity.id);
  return entity;
}

const WBG_CLOSE_SOURCES = [
  "operating_reversal",
  "month_end_is",
  "month_end_bs",
  "month_end_is_reversal",
  "month_end_bs_reversal",
] as const;

async function clearWbgAugustClose(entityId: string) {
  const period = await prisma.period.findUnique({
    where: { entityId_year_month: { entityId, year: 2026, month: 8 } },
  });
  if (period) {
    await prisma.period.update({
      where: { id: period.id },
      data: { incomeSourceUploadId: null, balanceSourceUploadId: null },
    });
    const doomed = await prisma.journal.findMany({
      where: { entityId, periodId: period.id, source: { in: [...WBG_CLOSE_SOURCES] } },
      select: { id: true },
    });
    const doomedIds = doomed.map((row) => row.id);
    if (doomedIds.length) {
      await prisma.journalLine.deleteMany({ where: { journalId: { in: doomedIds } } });
      await prisma.journal.deleteMany({ where: { id: { in: doomedIds }, reversesJournalId: { not: null } } });
      await prisma.journal.deleteMany({ where: { id: { in: doomedIds } } });
    }
  }
  await prisma.monthEndUpload.deleteMany({ where: { entityId, year: 2026, month: 8 } });
  await prisma.monthEndEvent.deleteMany({ where: { entityId, year: 2026, month: 8 } });
  await prisma.vaultDocument.deleteMany({ where: { entityId, filename: "profit.csv" } });
}

async function accountNet(entityId: string, code: string) {
  const lines = await prisma.journalLine.findMany({
    where: { journal: { entityId, status: "POSTED" }, account: { code } },
  });
  return lines.reduce((acc, line) => acc + line.debit - line.credit, 0n);
}

function tieInput(
  asOfDate: string,
  periodEnd: string,
  tolerances?: TieOutInput["tolerances"],
): TieOutInput {
  return {
    rentRollPresent: true,
    entityUnitCount: 1,
    unitCount: 1,
    rentableCount: 1,
    occupiedCount: 1,
    vacantCount: 0,
    downCount: 0,
    gprCents: dollars(500),
    scheduledRentCents: dollars(500),
    signedLtlCents: 0n,
    vacancyCents: 0n,
    concessionCents: 0n,
    nonRevenueCents: 0n,
    delinquencyCents: null,
    depositCents: 0n,
    prepaidCents: 0n,
    asOfDate,
    periodEnd,
    gl: {
      gpr: dollars(500),
      ltl: 0n,
      vacancy: 0n,
      concessions: 0n,
      nru: 0n,
      ar: 0n,
      deposits: 0n,
      depositCash: 0n,
      prepaid: 0n,
    },
    chargeMismatchCount: 0,
    tolerances,
  };
}

async function periodNoi(entityId: string, year: number, month: number) {
  const lines = await loadPostedLines({
    entityIds: [entityId],
    from: new Date(Date.UTC(year, month - 1, 1)),
    to: new Date(Date.UTC(year, month, 0, 23, 59, 59)),
  });
  return buildIncomeStatement({ throughEnd: lines, inPeriod: lines, eliminate: false }).noi;
}

function rollCsv(asOf: string, unit: string, status: string, market: string, inplace: string) {
  return Buffer.from(
    `As of ${asOf}\nunit_id,floorplan,beds,baths,sqft,status,market_rent,in_place_rent\n${unit},A1,1,1,700,${status},${market},${inplace}\n`,
    "utf8",
  );
}

function snap(partial: Partial<UnitSnapshot> & Pick<UnitSnapshot, "unitCode" | "status">): UnitSnapshot {
  return {
    floorplan: "A",
    beds: 1,
    bathsTenths: 10,
    sqft: 700,
    marketRent: 0n,
    inPlaceRent: 0n,
    leaseStart: null,
    leaseEnd: null,
    concessionCents: 0n,
    ...partial,
  };
}

async function lockMonth(entityId: string, year: number, month: number) {
  const period = await openPeriod(entityId, year, month);
  await softClosePeriod(period.id);
  await completeChecklist(period.id);
  await hardLockPeriod(period.id);
}
