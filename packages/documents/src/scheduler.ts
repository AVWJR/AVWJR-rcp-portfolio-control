import { PACK_CATALOG, type PackId } from "@rcp/reporting";

export const SCHEDULER_STATUS = "ready" as const;

export const PHASE_F_SCHEDULER_TODO =
  "Phase F live: scheduled pack jobs persist last-run status. CLI: npm run reports:run -- --pack=monthly_investor. No email send — files + status UI only.";

export const SCHEDULED_PACK_IDS = ["monthly_investor", "quarterly_lender"] as const;
export type ScheduledPackId = (typeof SCHEDULED_PACK_IDS)[number];

export type JobCadence = "monthly" | "quarterly";

export type ScheduledJobDef = {
  code: string;
  packId: ScheduledPackId;
  title: string;
  cadence: JobCadence;
  entityCode: string;
  periodLabel: string;
  notes: string;
};

export const DEFAULT_SCHEDULED_JOBS: ScheduledJobDef[] = [
  {
    code: "wbg-monthly-investor",
    packId: "monthly_investor",
    title: "SPE-WBG monthly investor pack",
    cadence: "monthly",
    entityCode: "SPE-WBG",
    periodLabel: "2026-08",
    notes: "Demo cron: 0 7 1 * * npm run reports:run -- --pack=monthly_investor --entity=SPE-WBG",
  },
  {
    code: "wbg-quarterly-lender",
    packId: "quarterly_lender",
    title: "SPE-WBG quarterly lender pack",
    cadence: "quarterly",
    entityCode: "SPE-WBG",
    periodLabel: "2026-08",
    notes: "Demo cron: 0 7 1 1,4,7,10 * npm run reports:run -- --pack=quarterly_lender --entity=SPE-WBG",
  },
];

export function isScheduledPackId(value: string): value is ScheduledPackId {
  return (SCHEDULED_PACK_IDS as readonly string[]).includes(value);
}

export function scheduledJobForPack(packId: PackId): ScheduledJobDef | undefined {
  return DEFAULT_SCHEDULED_JOBS.find((j) => j.packId === packId);
}

export function catalogCadence(packId: PackId): string {
  return PACK_CATALOG.find((p) => p.id === packId)?.cadence ?? "as_needed";
}
