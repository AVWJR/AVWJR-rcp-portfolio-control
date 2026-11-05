import type { WaterfallConfig } from "@rcp/ledger";

export type DealProformaSeed = {
  entityCode: string;
  entityName: string;
  config: WaterfallConfig;
  lpContributedCents: string;
  /** null = blank unreturned capital (use contributed). */
  unreturnedCapitalCents: string | null;
  /** null = blank unpaid pref (none carried in). */
  unpaidPrefCents: string | null;
  prefPaidToDateCents: string;
  periodCfadsCents: string;
  europeanPromoteOpen: boolean;
};
