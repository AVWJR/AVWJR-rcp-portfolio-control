import { parseT12WorkbookBytes } from "@/lib/deals/workbook";
import { mapT12LabelToAccount, mapYardiCodeToAccount, t12ParseToBudgetRows } from "@rcp/properties";
import { describe, expect, it } from "vitest";
import {
  harringtonT12Workbook,
  harringtonYardiPlReport1Workbook,
  harringtonYardiT12ExtWorkbook,
} from "./fixtures/harrington-rent-roll";

describe("broker T12 / P&L mapping", () => {
  it("maps Harrington T12 line items to CoA and non-zero EGI/NOI", () => {
    const parsed = parseT12WorkbookBytes(harringtonT12Workbook(), "T12_NOI_-_Life_at_Harrington_-_11.2019.xlsx");
    expect(parsed.sheet).toMatch(/T12/i);
    expect(parsed.monthCount).toBeGreaterThanOrEqual(12);
    expect(parsed.gpr).toBe(2_160_000_00n);
    expect(parsed.vacancy).toBe(108_000_00n);
    expect(parsed.concessions).toBe(36_000_00n);
    expect(parsed.otherIncome).toBe(96_000_00n);
    expect(parsed.egi).toBe(2_112_000_00n);
    expect(parsed.noi).toBe(990_000_00n);
    const budget = t12ParseToBudgetRows(parsed);
    expect(budget.find((row) => row.accountCode === "4010")?.amount).toBe(180_000_00n);
    expect(budget.find((row) => row.accountCode === "5110")?.amount).toBe(22_000_00n);
  });

  it("maps Yardi cash-book codes (4022-000 Unit Rent, 41xx) on sheet ext", () => {
    expect(mapT12LabelToAccount("4022-000 Unit Rent")).toBe("4010");
    expect(mapYardiCodeToAccount("4120")).toBe("4100");
    const parsed = parseT12WorkbookBytes(harringtonYardiT12ExtWorkbook(), "T12_NOI_-_Life_at_Harrington_-_11.2019.xlsx");
    expect(parsed.sheet).toBe("ext");
    expect(parsed.gpr).toBe(2_160_000_00n);
    expect(parsed.vacancy).toBe(108_000_00n);
    expect(parsed.concessions).toBe(36_000_00n);
    expect(parsed.otherIncome).toBe(96_000_00n);
    expect(parsed.egi).toBeGreaterThan(0n);
    expect(parsed.noi).toBe(990_000_00n);
  });

  it("maps P&L sheet Report1 with month dates", () => {
    const parsed = parseT12WorkbookBytes(
      harringtonYardiPlReport1Workbook(),
      "PL_-_The_Life_at_Harrington_Park_-_Dec_2018_to_Nov_2019.xlsx",
    );
    expect(parsed.sheet).toBe("Report1");
    expect(parsed.egi).toBeGreaterThan(0n);
    expect(parsed.noi).toBeGreaterThan(0n);
  });
});
