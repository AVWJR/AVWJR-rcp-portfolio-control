import { dollars, MASTER_COA_BY_CODE } from "@rcp/ledger";

export type BudgetSeed = { accountCode: string; amount: bigint };

/**
 * 2026-08 operating budgets. Amounts are natural magnitude (positive cents).
 * Slightly different from seed actuals so the NOI bridge shows line variance.
 */
export const SPE_BUDGETS_2026_08: Record<string, BudgetSeed[]> = {
  "SPE-WBG": [
    { accountCode: "4010", amount: dollars(342_000) },
    { accountCode: "4020", amount: dollars(25_000) },
    { accountCode: "4030", amount: dollars(7_500) },
    { accountCode: "4100", amount: dollars(12_000) },
    { accountCode: "5110", amount: dollars(40_000) },
    { accountCode: "5210", amount: dollars(26_000) },
    { accountCode: "5310", amount: dollars(30_000) },
    { accountCode: "5410", amount: dollars(14_000) },
    { accountCode: "5510", amount: dollars(5_800) },
    { accountCode: "5610", amount: dollars(8_000) },
    { accountCode: "5710", amount: dollars(18_500) },
    { accountCode: "5810", amount: dollars(36_000) },
    { accountCode: "5910", amount: dollars(9_600) },
    { accountCode: "5990", amount: dollars(4_000) },
    { accountCode: "6110", amount: dollars(80_500) },
    { accountCode: "6210", amount: dollars(62_000) },
    { accountCode: "6310", amount: dollars(4_800) },
  ],
  "SPE-CVC": [
    { accountCode: "4010", amount: dollars(274_000) },
    { accountCode: "4020", amount: dollars(8_200) },
    { accountCode: "4030", amount: dollars(2_500) },
    { accountCode: "4100", amount: dollars(9_500) },
    { accountCode: "5110", amount: dollars(31_000) },
    { accountCode: "5210", amount: dollars(16_000) },
    { accountCode: "5310", amount: dollars(18_000) },
    { accountCode: "5410", amount: dollars(11_000) },
    { accountCode: "5510", amount: dollars(3_000) },
    { accountCode: "5610", amount: dollars(6_500) },
    { accountCode: "5710", amount: dollars(14_200) },
    { accountCode: "5810", amount: dollars(29_500) },
    { accountCode: "5910", amount: dollars(8_200) },
    { accountCode: "5990", amount: dollars(2_200) },
    { accountCode: "6110", amount: dollars(65_200) },
    { accountCode: "6210", amount: dollars(48_000) },
    { accountCode: "6310", amount: dollars(4_100) },
  ],
  "SPE-HCR": [
    { accountCode: "4010", amount: dollars(102_000) },
    { accountCode: "4020", amount: dollars(10_200) },
    { accountCode: "4030", amount: dollars(4_000) },
    { accountCode: "4100", amount: dollars(3_000) },
    { accountCode: "5110", amount: dollars(16_000) },
    { accountCode: "5210", amount: dollars(12_500) },
    { accountCode: "5310", amount: dollars(12_000) },
    { accountCode: "5410", amount: dollars(5_400) },
    { accountCode: "5510", amount: dollars(4_200) },
    { accountCode: "5610", amount: dollars(3_000) },
    { accountCode: "5710", amount: dollars(6_400) },
    { accountCode: "5810", amount: dollars(9_800) },
    { accountCode: "5910", amount: dollars(2_700) },
    { accountCode: "5990", amount: dollars(1_600) },
    { accountCode: "6110", amount: dollars(22_650) },
    { accountCode: "6210", amount: dollars(19_500) },
    { accountCode: "6310", amount: dollars(1_300) },
  ],
  "RCP-OPCO": [
    { accountCode: "5110", amount: dollars(17_500) },
    { accountCode: "5610", amount: dollars(6_000) },
    { accountCode: "5710", amount: dollars(1_200) },
    { accountCode: "5990", amount: dollars(750) },
    { accountCode: "7010", amount: dollars(10_200) },
  ],
};

export function assertBudgetCodes(rows: BudgetSeed[]): void {
  for (const row of rows) {
    if (!MASTER_COA_BY_CODE.has(row.accountCode)) {
      throw new Error(`Budget references unknown CoA ${row.accountCode}`);
    }
  }
}
