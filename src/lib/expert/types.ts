/** Shared types for the RCP Expert coach (read-only). */

export type ExpertRole = "user" | "expert";

export type ExpertChip = {
  id: string;
  label: string;
  prompt: string;
};

/** UI buttons that navigate, reopen an Expert intent, or ask for a later write confirm. */
export type ExpertActionKind = "navigate" | "intent" | "confirm_mutation";

export type ExpertSuggestedAction = {
  id: string;
  kind: ExpertActionKind;
  label: string;
  href?: string;
  intent?: string;
  prompt?: string;
  mutation?: string;
};

export type ExpertMessage = {
  id: string;
  role: ExpertRole;
  content: string;
  chips?: ExpertChip[];
  actions?: ExpertSuggestedAction[];
  sources?: string[];
  createdAt: string;
};

export type ExpertAccessRole = "principal" | "viewer";

export type ExpertClientContext = {
  pathname: string;
  entityCode: string;
  periodLabel: string;
  view?: "combined";
  pageTitle: string;
  uiHints: string[];
  accessRole?: ExpertAccessRole;
};

export type CompletenessStatus = "ready" | "missing" | "partial" | "na";

export type CompletenessItem = {
  id: string;
  label: string;
  status: CompletenessStatus;
  detail: string;
  href: string;
  source: string;
};

export type DataCompleteness = {
  entityCode: string;
  periodLabel: string;
  score: number;
  ready: number;
  applicable: number;
  items: CompletenessItem[];
};

export type AnomalySeverity = "blocker" | "watch" | "info";

export type AnomalyFlag = {
  id: string;
  severity: AnomalySeverity;
  title: string;
  detail: string;
  source: string;
  href: string;
};

export type EntitySummary = {
  code: string;
  name: string;
  type: string;
  parentCode: string | null;
  unitCount: number | null;
  strategy: string | null;
  children: { code: string; name: string; type: string; unitCount: number | null }[];
};

export type PeriodStatusView = {
  entityCode: string;
  periodLabel: string;
  status: string;
  statusLabel: string;
  exists: boolean;
  checklistDone: number;
  checklistTotal: number;
  openItems: { code: string; label: string; status: string }[];
};

export type KpiTileView = {
  id: string;
  display: string;
  hint: string;
  gated: boolean;
};

export type KpiSnapshot = {
  entityCode: string;
  entityName: string;
  periodLabel: string;
  kind: "property" | "opco" | "holdco" | "none";
  viewLabel: string;
  tiles: KpiTileView[];
  notes: string[];
};

export type NavTarget = {
  id: string;
  href: string;
  label: string;
  hint: string;
};

export type ExpertToolError = {
  ok: false;
  error: string;
};

export type OfflineBundle = {
  entity: EntitySummary | ExpertToolError;
  period: PeriodStatusView | ExpertToolError;
  completeness: DataCompleteness | ExpertToolError;
  anomalies: { entityCode: string; periodLabel: string; flags: AnomalyFlag[] } | ExpertToolError;
  kpis: KpiSnapshot | ExpertToolError;
};

export type ExpertChatRequest = {
  messages?: { role: string; content: string }[];
  context?: Partial<ExpertClientContext>;
  intent?: string;
  stream?: boolean;
};

export type ExpertModelProvider = "gateway" | "xai" | "openai" | "anthropic" | "none";

export type ExpertBannerKind = "grok" | "live" | "offline";

export type ExpertChatResponse = {
  mode: "offline" | "ai";
  aiEnabled: boolean;
  provider: ExpertModelProvider;
  modelId: string;
  banner: ExpertBannerKind;
  message: ExpertMessage;
};

export type ExpertStreamEvent =
  | {
      type: "start";
      aiEnabled: boolean;
      provider: ExpertModelProvider;
      modelId: string;
      banner: ExpertBannerKind;
      mode: "offline" | "ai";
    }
  | { type: "delta"; text: string }
  | { type: "done"; response: ExpertChatResponse };
