export const SPE_STRATEGIES = ["VALUE_ADD_GARDEN", "STABILIZED", "LIGHT_REHAB"] as const;
export type SpeStrategy = (typeof SPE_STRATEGIES)[number];

export const DEAL_INTAKE_STATUSES = ["DRAFT", "AWAITING_FILES", "READY", "APPLIED", "FAILED"] as const;
export type DealIntakeStatus = (typeof DEAL_INTAKE_STATUSES)[number];

export const DEAL_FILE_SOURCES = ["upload", "dropbox", "email_attachment", "rcp_mailbox"] as const;
export type DealFileSource = (typeof DEAL_FILE_SOURCES)[number];

export const DEAL_GOALS = ["stabilize", "value_add", "light_rehab"] as const;
export type DealGoal = (typeof DEAL_GOALS)[number];

export const DEAL_FILE_CLASSES = [
  "rent_roll_csv",
  "budget_csv",
  "loan_doc",
  "lease",
  "om_cim",
  "insurance",
  "other",
] as const;
export type DealFileClass = (typeof DEAL_FILE_CLASSES)[number];

export const DEAL_FILE_CLASS_LABELS: Record<DealFileClass, string> = {
  rent_roll_csv: "Rent-roll CSV / XLSX",
  budget_csv: "Budget CSV / XLSX",
  loan_doc: "Loan document",
  lease: "Lease",
  om_cim: "OM / CIM",
  insurance: "Insurance",
  other: "Other",
};

export const DEFAULT_OPCO_CODE = "RCP-OPCO";
export const DEFAULT_TARGET_PERIOD = "2026-08";
export const INTAKE_MAX_BYTES = 10 * 1024 * 1024;
export const INTAKE_MAX_BYTES_LABEL = "10 MB";

export const DEAL_WIZARD_STEPS = [
  { id: 1, key: "goal", title: "Goal", hint: "What are you onboarding?" },
  { id: 2, key: "identity", title: "Identity", hint: "SPE legal name and code" },
  { id: 3, key: "sources", title: "Source files", hint: "Upload, Dropbox, email, or RCP mailbox" },
  { id: 4, key: "classify", title: "Classify files", hint: "Map each file to a type" },
  { id: 5, key: "create", title: "Create entity", hint: "Create the SPE and clone the CoA" },
  { id: 6, key: "apply", title: "Apply data", hint: "Import CSV / XLSX and capture loan basics" },
  { id: 7, key: "completeness", title: "Completeness", hint: "Score and missing next steps" },
  { id: 8, key: "done", title: "Done", hint: "Open the new deal screens" },
] as const;

export type RemoteFile = {
  id: string;
  name: string;
  mimeType?: string;
  byteSize?: number;
  path?: string;
};

export type DealIntakePatch = {
  currentStep?: number;
  status?: DealIntakeStatus;
  goal?: DealGoal | null;
  targetPeriod?: string | null;
  speName?: string | null;
  speCode?: string | null;
  unitCount?: number | null;
  strategy?: SpeStrategy | null;
  parentOpCoCode?: string;
  sources?: DealFileSource[];
  loanName?: string | null;
  loanLender?: string | null;
  loanUpbCents?: bigint | null;
  loanRateBps?: number | null;
  loanPaymentCents?: bigint | null;
  loanOrigination?: Date | null;
  loanMaturity?: Date | null;
  dscrThresholdBps?: number | null;
  debtYieldThresholdBps?: number | null;
  lastError?: string | null;
  entityId?: string | null;
};

export function isDealFileSource(value: string): value is DealFileSource {
  return (DEAL_FILE_SOURCES as readonly string[]).includes(value);
}

export function isDealFileClass(value: string): value is DealFileClass {
  return (DEAL_FILE_CLASSES as readonly string[]).includes(value);
}

export function isDealGoal(value: string): value is DealGoal {
  return (DEAL_GOALS as readonly string[]).includes(value);
}

export function goalToStrategy(goal: DealGoal): SpeStrategy {
  if (goal === "stabilize") return "STABILIZED";
  if (goal === "light_rehab") return "LIGHT_REHAB";
  return "VALUE_ADD_GARDEN";
}

export function defaultOpCoCode() {
  return process.env.RCP_DEFAULT_OPCO?.trim() || DEFAULT_OPCO_CODE;
}
