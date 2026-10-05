export const DATA_NEEDED = "data needed";

export const OFFICIAL_MODEL_ID = "mkt-model-v1-equal-pillars-sup20";
export const OFFICIAL_MODEL_CODE = "v1-equal-pillars-sup20";
export const OFFICIAL_RUN_ID = "mkt-run-v1-2025-11-01";
export const OFFICIAL_BACKTEST_ID = "mkt-backtest-v1";
export const OFFICIAL_AS_OF_ISO = "2025-11-01";
export const OFFICIAL_AS_OF_LABEL = "Nov 1, 2025";

export const PILLAR_NAMES = ["Demand", "Demographics", "Supply", "Affordability", "Operating"] as const;
export type PillarName = (typeof PILLAR_NAMES)[number];

export const INTERNAL_BANNER =
  "Internal – free public data v1. Paid sources can be registered but are not in this score.";

export const NOT_INVESTMENT = "Internal use only. Not investment advice.";

export const REGISTERED_ONLY =
  "Registered only. Scores unchanged until a new model version is approved.";

export const NOT_CONNECTED = "not connected — Principal approval required";

export const MARKETS_LOCKED = "Partner view is read-only. Unlock to open Market Ranks.";
export const MARKETS_NAME = "Name the source.";
export const MARKETS_PUBLISHER = "Name the publisher.";
export const MARKETS_LOOPNET = "LoopNet is excluded. It is not registered and it does not enter the score.";
export const MARKETS_NO_CREDENTIALS = "This form does not store credentials or API keys.";
export const MARKETS_SETUP_PENDING =
  "Market ranks setup is pending. The score tables are not on this database yet.";
export const MARKETS_SCORES_PENDING =
  "The official scores are not on this database yet. They load on the production deploy, which is the only deploy that adds these tables.";
export const MARKETS_PUBLIC_SOURCE =
  "That name is already a public or commentary source. This form only registers a paid source.";
export const MARKETS_PREVIEW_WRITE =
  "This preview does not register a source. Registration writes on production, after the score tables are there.";
export const MARKETS_URL = "Use an http or https link, or leave the box blank.";

export const DERIVATION_PLAIN_ENGLISH =
  "Five pillars — Demand, Demographics, Supply, Affordability, and Operating — each take an equal 20% of the Viability Score. Within Supply, 100% of that pillar is SUP-20 (permits relative to jobs, adjusted for job growth). The other Supply measures are eligible and carry weight 0, because the backtest put all of the Supply weight on SUP-20. Within each of the other four pillars, every variable that is in the score today takes an equal share. Capital markets and Risk have no public variables in v1, so those pillar weights are 0. Market color and local news never enter the score. This official run reads only the approved free public data. A paid source can be registered and stays inactive until a new model version is approved.";

export const BACKTEST_LIMITATION =
  "The 2-year rent signal held its sign on 2 hold-out dates. That result is not statistically confirmed. The Supply pillar alone was negative in the backtest; read supply pressure carefully.";

export const SCENARIO_NOTE =
  "Scenario ranks in the Phase 5 file are illustrative. They are not shown here and they do not change this score.";

export type LicenseBasis = "public" | "manual_only" | "license_required" | "excluded";
export type SourceStatus = "active" | "inactive" | "pending_license";

export type SourceSeed = {
  id: string;
  name: string;
  publisher: string;
  url: string;
  termsUrl: string;
  licenseBasis: LicenseBasis;
  automationAllowed: boolean;
  costNotes: string;
  status: SourceStatus;
  paywalled: boolean;
  notes: string;
  sortOrder: number;
};

export type VariableSeed = {
  id: string;
  name: string;
  plainDefinition: string;
  pillar: string;
  unit: string;
  expectedSign: "higher_is_worse" | "not_stated";
  whyItMatters: string;
  inScoreToday: boolean;
  inScoreLabel: string;
  sourceLabel: string;
  weightNotes: string;
  sortOrder: number;
  sourceIds: string[];
};

export type WeightSeed = {
  id: string;
  scope: "PILLAR" | "VARIABLE";
  pillar: string;
  variableId: string | null;
  weightNumerator: number;
  weightDenominator: number;
  notes: string;
  sortOrder: number;
};

export type MetroScoreSeed = {
  id: string;
  cbsaCode: string;
  name: string;
  rank: number;
  viabilityTenths: number;
  band: string;
  tiedWithinBand: string;
  tiedCount: number;
  rankP5Milli: number;
  rankP95Milli: number;
  confidenceTenths: number;
  momentum: string;
  flags: string;
  pillarScoresJson: string;
};

export type MarketSeedPlan = {
  sources: SourceSeed[];
  variables: VariableSeed[];
  weights: WeightSeed[];
  metros: MetroScoreSeed[];
};
