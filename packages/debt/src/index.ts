/** Debt + capex journal helpers. Loan-file DSCR / debt yield are Phase C. LTV stays gated. */

export * from "./types";
export * from "./amortize";
export * from "./covenants";
export * from "./journals";

export const PHASE_C_LTV_POLICY =
  "Loan-to-value / loan-to-cost still needs an appraisal (or an explicit cost-basis policy). Do not divide UPB by book cost and label it LTV.";
