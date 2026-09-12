/**
 * Analytics gates. Occupancy and loss-to-lease require a rent roll (Phase B).
 * Delinquency still requires charge/receipt data and must not be inferred from
 * GL account 1110. LTV/LTC stays gated without an appraisal even though the
 * Phase C loan file is present (UPB, rate, DSCR, debt yield).
 */

export type GatedRatio = "occupancy" | "loss_to_lease" | "ltl" | "delinquency";

export type RatioAvailability = {
  ready: boolean;
  phase: string;
  source: "rent_roll" | "gl" | "none";
  reason: string;
};

export function ratioAvailability(
  ratio: GatedRatio,
  ctx: { hasRentRoll: boolean } = { hasRentRoll: false },
): RatioAvailability {
  if (ratio === "occupancy" || ratio === "loss_to_lease") {
    return ctx.hasRentRoll
      ? {
          ready: true,
          phase: "B",
          source: "rent_roll",
          reason: "Computed from the unit master / rent roll. Not inferred from the GL.",
        }
      : {
          ready: false,
          phase: "B",
          source: "none",
          reason: "Requires a unit file or rent-roll import. Do not derive occupancy from vacancy GL.",
        };
  }
  if (ratio === "delinquency") {
    return {
      ready: false,
      phase: "B+",
      source: "none",
      reason:
        "TODO: tenant charge/receipt subledger. Account 1110 is a control total only — do not invent AR aging.",
    };
  }
  return {
    ready: false,
    phase: "D",
    source: "none",
    reason:
      "Loan file exists (UPB, rate, covenants). LTV/LTC still needs appraisal — do not divide UPB by book cost.",
  };
}

export const DELINQUENCY_TODO =
  "TODO(Phase B+): delinquency / AR aging needs tenant charges and receipts. Do not treat GL 1110 as a delinquency rate.";
