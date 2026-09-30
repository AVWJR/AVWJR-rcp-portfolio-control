/**
 * Analysis age is a flag only.
 * Amber at 90 days, red at 180. Nothing is deleted, archived, or hidden because of age.
 */

export const STALE_AMBER_DAYS = 90;
export const STALE_RED_DAYS = 180;

export type StaleLevel = "fresh" | "amber" | "red" | "missing";

const DAY_MS = 24 * 60 * 60 * 1000;

export function analysisAgeDays(recordedAt: Date, now = new Date()): number {
  return (now.getTime() - recordedAt.getTime()) / DAY_MS;
}

export function analysisStaleLevel(recordedAt: Date | null | undefined, now = new Date()): StaleLevel {
  if (!recordedAt) return "missing";
  const days = analysisAgeDays(recordedAt, now);
  if (days >= STALE_RED_DAYS) return "red";
  if (days >= STALE_AMBER_DAYS) return "amber";
  return "fresh";
}

export function staleFlagLabel(level: StaleLevel): string | null {
  if (level === "amber") return "Stale · 90 days";
  if (level === "red") return "Stale · 180 days";
  if (level === "missing") return "No snapshot";
  return null;
}
