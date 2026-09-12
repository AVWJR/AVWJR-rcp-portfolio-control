/** Debt module stub. Phase A carries current + LT mortgage balances on the SPE CoA only. */

export type DebtInstrumentStub = {
  speCode: string;
  currentBalanceCents: bigint;
  longTermBalanceCents: bigint;
};

// TODO(Phase C): note-level amortization, rate, lender, covenant tests, LTL from loan file
export const PHASE_C_DEBT_TODO =
  "Loan-to-value / loan-to-cost and amortization schedules are Phase C. Do not fake LTL from the GL.";
