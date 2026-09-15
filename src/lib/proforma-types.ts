import type { WaterfallConfig } from "@rcp/ledger";

export type DealProformaSeed = {
  entityCode: string;
  entityName: string;
  config: WaterfallConfig;
  lpContributedCents: string;
  unreturnedCapitalCents: string;
  unpaidPrefCents: string;
  prefPaidToDateCents: string;
  periodCfadsCents: string;
  europeanPromoteOpen: boolean;
};
