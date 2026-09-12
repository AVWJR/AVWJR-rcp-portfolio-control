/** Entity graph: HoldCo → OpCo → Property SPE/LLC. Phase A implements persistence in Prisma. */

export const ENTITY_TYPES = ["HOLDCO", "OPCO", "SPE"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const DEFAULT_OWNERSHIP_BPS = 10_000; // 100.00% — seed all SPEs wholly owned

export type EntitySummary = {
  code: string;
  name: string;
  type: EntityType;
  parentCode?: string;
  ownershipBps: number;
  unitCount?: number;
};

// TODO(Phase B): ownership changes, minority interest, multi-OpCo graph
export function isWhollyOwned(ownershipBps: number): boolean {
  return ownershipBps === DEFAULT_OWNERSHIP_BPS;
}
