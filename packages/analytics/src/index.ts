/**
 * Analytics stub. Occupancy, LTL, and delinquency are Phase B+ and must not
 * be fabricated from the general ledger. See docs/RCP_RATIO_DICTIONARY_STUB.md.
 */

export type GatedRatio = "occupancy" | "ltl" | "delinquency";

export function ratioAvailability(ratio: GatedRatio): { ready: false; phase: string } {
  if (ratio === "occupancy" || ratio === "delinquency") {
    return { ready: false, phase: "B" };
  }
  return { ready: false, phase: "C" };
}

// TODO(Phase B): wire PMS occupancy and delinquency aging
// TODO(Phase C): wire debt file LTL / DSCR
// TODO(Phase D): portfolio roll-up analytics
