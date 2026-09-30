/**
 * Who is in the real OpCo books.
 *
 * Production rows get dealStatus without a data migration:
 * the new column defaults to OWNED when prisma db push adds it.
 * effectiveDealStatus() still reads lifecycleStatus ARCHIVED as Archived,
 * and a missing dealStatus on a LIVE SPE as Owned.
 */

export const DEAL_STATUSES = ["PIPELINE", "SCREENED", "OWNED", "ARCHIVED", "TEST"] as const;
export type DealStatusValue = (typeof DEAL_STATUSES)[number];

export const DEAL_STATUS_LABEL: Record<DealStatusValue, string> = {
  PIPELINE: "Pipeline",
  SCREENED: "Screened",
  OWNED: "Owned",
  ARCHIVED: "Archived",
  TEST: "Test",
};

const STATUS_SET = new Set<string>(DEAL_STATUSES);

export function isDealStatus(value: string | null | undefined): value is DealStatusValue {
  return Boolean(value && STATUS_SET.has(value));
}

export function effectiveDealStatus(entity: {
  lifecycleStatus?: string | null;
  dealStatus?: string | null;
}): DealStatusValue {
  if (entity.lifecycleStatus === "ARCHIVED") return "ARCHIVED";
  if (isDealStatus(entity.dealStatus)) return entity.dealStatus;
  return "OWNED";
}

export function isOwnedSpe(entity: {
  type: string;
  lifecycleStatus?: string | null;
  dealStatus?: string | null;
}): boolean {
  return entity.type === "SPE" && entity.lifecycleStatus !== "ARCHIVED" && effectiveDealStatus(entity) === "OWNED";
}

export function ownedSpeWhere() {
  return {
    type: "SPE" as const,
    lifecycleStatus: "LIVE" as const,
    dealStatus: "OWNED" as const,
  };
}
