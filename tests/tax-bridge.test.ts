import { dollars } from "@rcp/ledger";
import {
  AP_VENDOR_STUB,
  MACRS_LIFE_HOOKS,
  TAX_BRIDGE_STATUS,
  TAX_FILING_DISCLAIMER,
  allocateByBps,
  build1099Export,
  buildBooksToTaxWorksheet,
  buildCapitalRollforward,
  endingCapital,
  everyLineLabeled,
  monthlyStraightLineCents,
  sheetToCsv,
  sheetsToExcelXml,
  worksheetIdentityHolds,
  worksheetToSheets,
} from "@rcp/tax-bridge";
import { describe, expect, it } from "vitest";

describe("books-to-tax worksheet", () => {
  const ws = buildBooksToTaxWorksheet({
    entityCode: "SPE-WBG",
    entityName: "Willow Bend Gardens LLC",
    period: "2026-08",
    book: {
      netIncome: dollars(-30_500),
      depreciation: dollars(62_000),
      interest: dollars(80_500),
      amFees: dollars(4_740),
      amIncome: 0n,
    },
    ppe: {
      land: dollars(4_200_000),
      building: dollars(18_800_000),
      improvements: dollars(1_250_000),
      site: dollars(480_000),
      ffe: dollars(360_000),
      cip: dollars(100_000),
    },
    extraAdjustments: [
      { lineCode: "meals", label: "Meals addback", basis: "BRIDGE", booksCents: 0n, taxCents: dollars(350) },
    ],
  });

  it("labels every line BOOKS, TAX, or BRIDGE", () => {
    expect(everyLineLabeled(ws)).toBe(true);
    expect(ws.lines.some((l) => l.basis === "BOOKS")).toBe(true);
    expect(ws.lines.some((l) => l.basis === "TAX")).toBe(true);
    expect(ws.lines.some((l) => l.basis === "BRIDGE")).toBe(true);
  });

  it("keeps book dep / interest / AM fee columns", () => {
    expect(ws.bookDepreciation).toBe(dollars(62_000));
    expect(ws.bookInterest).toBe(dollars(80_500));
    expect(ws.bookAmFees).toBe(dollars(4_740));
    expect(ws.lines.find((l) => l.key === "book_dep")?.accountCode).toBe("6210");
  });

  it("computes MACRS tax dep hook and worksheet identity", () => {
    expect(ws.taxDepreciation).toBeGreaterThan(0n);
    expect(worksheetIdentityHolds(ws)).toBe(true);
    expect(ws.taxableIncomeWorksheet).toBe(ws.bookNetIncome - ws.excessTaxDepreciation + dollars(350));
  });

  it("does not depreciate land or CIP", () => {
    const land = ws.lines.find((l) => l.key === "macrs_land");
    const cip = ws.lines.find((l) => l.key === "macrs_cip");
    expect(land?.taxCents).toBe(0n);
    expect(cip?.taxCents).toBe(0n);
  });

  it("exports CSV/Excel with basis labels and disclaimer", () => {
    const sheets = worksheetToSheets(ws);
    const csv = sheetToCsv(sheets[0]!);
    expect(csv).toMatch(/BOOKS/);
    expect(csv).toMatch(/TAX/);
    expect(csv).toMatch(/BRIDGE/);
    const xls = sheetsToExcelXml(sheets);
    expect(xls).toMatch(/Excel.Sheet/);
    expect(xls).toContain("Books-to-tax");
  });

  it("status is live and disclaimer refuses filing", () => {
    expect(TAX_BRIDGE_STATUS).toBe("worksheet_ready");
    expect(TAX_FILING_DISCLAIMER).toMatch(/does not file/i);
  });
});

describe("MACRS lives hooks", () => {
  it("uses 27.5 / 15 / 5 year lives", () => {
    const years = MACRS_LIFE_HOOKS.map((h) => h.recoveryYears);
    expect(years).toContain(27.5);
    expect(years).toContain(15);
    expect(years).toContain(5);
  });

  it("monthly SL is integer cents", () => {
    expect(monthlyStraightLineCents(dollars(18_800_000), 27.5)).toBe(dollars(18_800_000) / 330n);
    expect(monthlyStraightLineCents(0n, 5)).toBe(0n);
  });
});

describe("partner capital rollforward", () => {
  it("holds beg + contrib − dist ± NI = end", () => {
    const roll = buildCapitalRollforward({
      entityCode: "SPE-WBG",
      entityName: "Willow Bend Gardens LLC",
      period: "2026-08",
      partners: [{ code: "P-OPCO", name: "RCP Operating Company LLC", role: "MEMBER", ownershipBps: 10_000 }],
      activities: [
        {
          partnerCode: "P-OPCO",
          beginningCents: dollars(9_002_000),
          contributionsCents: 0n,
          distributionsCents: 0n,
          bookNiAllocCents: dollars(-30_500),
        },
      ],
    });
    expect(roll.totals.identityHolds).toBe(true);
    expect(roll.totals.endingCents).toBe(dollars(8_971_500));
    expect(roll.limitations.some((l) => /not a filed/i.test(l))).toBe(true);
  });

  it("allocates leftover cents to the last partner", () => {
    const partners = [
      { code: "A", name: "A", role: "GP" as const, ownershipBps: 3333 },
      { code: "B", name: "B", role: "LP" as const, ownershipBps: 6667 },
    ];
    const map = allocateByBps(100n, partners);
    expect(map.get("A")! + map.get("B")!).toBe(100n);
    expect(endingCapital({ beginningCents: 10n, contributionsCents: 2n, distributionsCents: 3n, bookNiAllocCents: 4n })).toBe(13n);
  });
});

describe("1099 vendor hooks", () => {
  it("stubs when AP overlay is empty", () => {
    const exp = build1099Export({ vendors: [], payments: [], year: 2026, month: 8 });
    expect(exp.stub).toBe(true);
    expect(exp.stubReason).toContain("2010");
    expect(AP_VENDOR_STUB).toMatch(/no vendor invoice/);
  });

  it("exports reportable NEC payments only in the total", () => {
    const exp = build1099Export({
      vendors: [
        { code: "V-GREEN", name: "Greenway", form1099: "NEC" },
        { code: "V-INS", name: "Insurer", form1099: "NONE" },
      ],
      payments: [
        { vendorCode: "V-GREEN", entityCode: "SPE-WBG", year: 2026, month: 8, amountCents: 100n, accountCode: "5410", reportable: true },
        { vendorCode: "V-INS", entityCode: "SPE-WBG", year: 2026, month: 8, amountCents: 50n, accountCode: "5710", reportable: true },
      ],
      year: 2026,
      month: 8,
    });
    expect(exp.stub).toBe(false);
    expect(exp.totalReportableCents).toBe(100n);
  });
});
