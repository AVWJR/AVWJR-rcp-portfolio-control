import type { DealStatusValue } from "@/lib/deal-status";

export const MODEL_LIVE = "LIVE";
export const MODEL_TEST = "TEST";
export const MAX_COMPARE = 4;
export const PROJECTION_LABEL = "Projection, not books.";
export const NOT_YET_SCREENED = "not yet screened";

export type ModelKind = typeof MODEL_LIVE | typeof MODEL_TEST;

export function modelKind(value: string | null | undefined): ModelKind {
  return value === MODEL_TEST ? MODEL_TEST : MODEL_LIVE;
}

export type MembershipDecision =
  | { ok: true; optimizerEligible: boolean; flag: string | null }
  | { ok: false; reason: string };

/**
 * Pipeline may sit in a Model and is excluded from the future optimizer until Screened.
 * Archived is view only. Test deals belong only in Test Models.
 */
export function membershipDecision(status: DealStatusValue | string, kind: ModelKind): MembershipDecision {
  if (status === "ARCHIVED") {
    return { ok: false, reason: "Archived deals are view only. Restore one before it can go in a Model." };
  }
  if (status === "TEST" && kind !== MODEL_TEST) {
    return { ok: false, reason: "Test deals only go in a Test Model." };
  }
  if (status !== "TEST" && kind === MODEL_TEST) {
    return { ok: false, reason: "A Test Model only holds Test deals." };
  }
  if (status === "PIPELINE") {
    return { ok: true, optimizerEligible: false, flag: NOT_YET_SCREENED };
  }
  if (status === "SCREENED" || status === "OWNED" || status === "TEST") {
    return { ok: true, optimizerEligible: status !== "TEST", flag: null };
  }
  return { ok: false, reason: "That status cannot be added to a Model." };
}
