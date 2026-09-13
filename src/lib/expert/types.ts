/** Shared types for the RCP Expert coach (read-only). */

export type ExpertRole = "user" | "expert";

export type ExpertChip = {
  id: string;
  label: string;
  prompt: string;
};

export type ExpertMessage = {
  id: string;
  role: ExpertRole;
  content: string;
  chips?: ExpertChip[];
  sources?: string[];
  createdAt: string;
};

export type ExpertClientContext = {
  pathname: string;
  entityCode: string;
  periodLabel: string;
  view?: "combined";
  pageTitle: string;
  uiHints: string[];
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

export type ExpertChatRequest = {
  messages?: { role: string; content: string }[];
  context?: Partial<ExpertClientContext>;
  intent?: string;
};

export type ExpertChatResponse = {
  mode: "offline" | "ai";
  aiEnabled: boolean;
  message: ExpertMessage;
};
