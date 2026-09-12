/** Loan-file types. Amounts are integer USD cents. Rates and covenants are basis points. */

export type LoanSnapshot = {
  speCode: string;
  name: string;
  lenderName: string;
  originalPrincipalCents: bigint;
  currentUpbCents: bigint;
  interestRateBps: number;
  paymentCents: bigint;
  originationDate: Date;
  maturityDate: Date;
  reserveRequirementCents: bigint;
  dscrThresholdBps: number;
  debtYieldThresholdBps: number;
};

export type AmortRow = {
  year: number;
  month: number;
  interestCents: bigint;
  principalCents: bigint;
  endingUpbCents: bigint;
};

export type CurrentLtSplit = {
  currentPortionCents: bigint;
  longTermPortionCents: bigint;
  rollFromLtCents: bigint;
};

export type CovenantResult = {
  dscrBps: number | null;
  dscrThresholdBps: number;
  dscrPass: boolean | null;
  debtYieldBps: number | null;
  debtYieldThresholdBps: number;
  debtYieldPass: boolean | null;
  noiCents: bigint;
  debtServiceCents: bigint;
  upbCents: bigint;
  annualizedNoiCents: bigint;
};

export type DebtServiceDraft = {
  interestCents: bigint;
  principalCents: bigint;
  reserveCents: bigint;
  cashAccountCode: string;
  reserveAccountCode: string;
};
