/**
 * Period snapshot shared by charts, narratives, and report packs.
 * Amounts stay integer USD cents. Ratio math is imported from Phase D —
 * this file does not redefine KPIs.
 */

export const AUDIENCES = ["lp", "gp", "ic", "lender", "mgmt"] as const;
export type AudienceId = (typeof AUDIENCES)[number];

export const AUDIENCE_LABELS: Record<AudienceId, string> = {
  lp: "Limited Partner",
  gp: "General Partner",
  ic: "Investment Committee",
  lender: "Lender",
  mgmt: "Management Committee",
};

export type MoneyLine = {
  key: string;
  label: string;
  code?: string;
  actualCents: bigint;
  budgetCents: bigint | null;
};

export type TrendPoint = {
  period: string;
  noiCents: bigint;
  egiCents: bigint;
  opexCents: bigint;
  opexRatioBps: number | null;
  bookEconomicOccupancyBps: number | null;
  dscrBps: number | null;
  interestCents: bigint;
  principalCents: bigint;
};

export type LoanBrief = {
  entityCode: string;
  entityName: string;
  lenderName: string;
  name: string;
  currentUpbCents: bigint;
  interestCents: bigint;
  principalCents: bigint;
  reserveRequirementCents: bigint;
  maturityDate: string;
  monthsRemaining: number;
  dscrBps: number | null;
  dscrThresholdBps: number;
  dscrPass: boolean | null;
  debtYieldBps: number | null;
  debtYieldThresholdBps: number;
  debtYieldPass: boolean | null;
};

export type WatchItem = {
  entityCode: string;
  entityName: string;
  lenderName: string;
  reason: string;
  dscrDisplay: string;
  debtYieldDisplay: string;
  monthsRemaining: number;
};

export type ConcentrationBrief = {
  entityCode: string;
  entityName: string;
  noiCents: bigint;
  shareBps: number | null;
  unitCount: number;
  opexRatioBps: number | null;
  bookEconomicOccupancyBps: number | null;
  physicalOccupancyBps: number | null;
  dscrBps: number | null;
  dscrPass: boolean | null;
};

export type BsSlice = {
  key: string;
  label: string;
  cents: bigint;
};

export type CapexBrief = {
  name: string;
  entityCode: string;
  classification: string;
  status: string;
  budgetCents: bigint;
  spentCents: bigint;
};

export type HeatCellTone = "good" | "watch" | "fail" | "neutral" | "gated";

export type HeatCell = {
  rowKey: string;
  colKey: string;
  display: string;
  tone: HeatCellTone;
};

export type PeriodSnapshot = {
  entityCode: string;
  entityName: string;
  entityType: "SPE" | "OPCO" | "HOLDCO";
  period: string;
  year: number;
  month: number;
  unitCount: number;
  strategy: string | null;
  viewLabel: string;
  lookThroughLabel: string | null;
  combinedNote: string | null;
  rollupIsNotGaap: boolean;

  gprCents: bigint;
  vacancyCents: bigint;
  concessionsCents: bigint;
  egrCents: bigint;
  otherIncomeCents: bigint;
  egiCents: bigint;
  opexCents: bigint;
  noiCents: bigint;
  interestCents: bigint;
  depreciationCents: bigint;
  amFeesCents: bigint;
  amIncomeCents: bigint;
  netIncomeCents: bigint;
  principalCents: bigint;
  btcfCents: bigint;

  budgetNoiCents: bigint | null;
  budgetGprCents: bigint | null;
  budgetVacancyCents: bigint | null;
  budgetConcessionsCents: bigint | null;
  budgetOtherIncomeCents: bigint | null;
  budgetEgiCents: bigint | null;
  budgetOpexCents: bigint | null;
  priorNoiCents: bigint | null;

  opexLines: MoneyLine[];
  incomeBridgeLines: MoneyLine[];

  opexRatioBps: number | null;
  controllableOpexCents: bigint;
  controllableOpexRatioBps: number | null;
  noiPerUnitCents: bigint | null;
  noiVarianceCents: bigint | null;
  noiVarianceBps: number | null;

  physicalOccupancyBps: number | null;
  occupiedCount: number | null;
  rentableCount: number | null;
  downCount: number | null;
  bookEconomicOccupancyBps: number | null;
  breakevenOccupancyBps: number | null;
  lossToLeaseCents: bigint | null;

  cashOperatingCents: bigint;
  cashReserveCents: bigint;
  cashEscrowCents: bigint;
  cashDepositsCents: bigint;
  cashTotalCents: bigint;
  periodCapexCents: bigint;
  reserveRequirementCents: bigint;
  cfadsCents: bigint;
  cfadsDscrBps: number | null;
  liquidityMonthsHundredths: number | null;

  dscrBps: number | null;
  dscrThresholdBps: number | null;
  dscrPass: boolean | null;
  debtYieldBps: number | null;
  debtYieldThresholdBps: number | null;
  debtYieldPass: boolean | null;
  upbCents: bigint;
  maturityDate: string | null;
  monthsRemaining: number | null;

  t12MonthsAvailable: number;
  t12NoiCents: bigint;
  t12Complete: boolean;
  t12Label: string;

  ltvGated: true;
  delinquencyGated: true;
  ltvReason: string;
  delinquencyReason: string;

  feeIncomeCents: bigint | null;
  gaRatioBps: number | null;

  lookThroughNoiCents: bigint | null;
  combinedRollupNoiCents: bigint | null;

  trends: TrendPoint[];
  loans: LoanBrief[];
  watchlist: WatchItem[];
  concentration: ConcentrationBrief[];
  bsAssets: BsSlice[];
  bsLiabilities: BsSlice[];
  bsEquity: BsSlice[];
  bsTotalAssetsCents: bigint;
  bsTotalLiabilitiesCents: bigint;
  bsTotalEquityCents: bigint;
  bsBalanced: boolean;
  capexProjects: CapexBrief[];
};

/** BTCF presentation identity: period NOI − interest − principal. AM stays below NOI. */
export function btcfCents(opts: {
  periodNoiCents: bigint;
  interestCents: bigint;
  principalCents: bigint;
}): bigint {
  return opts.periodNoiCents - opts.interestCents - opts.principalCents;
}
