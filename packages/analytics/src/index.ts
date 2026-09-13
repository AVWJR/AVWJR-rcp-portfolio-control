/**
 * Analytics: live RCP ratio dictionary, formula helpers, and availability gates.
 * Occupancy / LTL require a rent roll. Delinquency stays gated (no charge/receipt
 * subledger). LTV stays gated without an appraisal — do not use book cost.
 */

import type { RatioAvailability } from "./availability";

export type GatedRatio = "occupancy" | "loss_to_lease" | "ltl" | "delinquency";

export type { RatioAvailability };

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

export const LTV_TODO =
  "TODO: LTV/LTC needs an appraisal (or a documented cost-basis policy). Do not divide UPB by book PPE.";

export const PHASE_E_NARRATIVES_TODO =
  "Phase E live: audience narratives and PDF/PPTX packs at /narratives. Dashboards stay book/ratio math only.";

export * from "./types";
export * from "./formulas";
export * from "./dictionary";
export * from "./availability";
