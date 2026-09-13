/**
 * Phase E: report-pack catalog and PDF / PPTX exporters.
 * Phase F: document vault + scheduled pack jobs (files + last-run status).
 */

export {
  listReportPacks,
  REPORT_PACKS,
} from "./catalog";
export { renderPdfPack } from "./pdf-pack";
export { renderPptxPack } from "./pptx-pack";
export {
  guessVaultKind,
  isVaultKind,
  looksLikeOmCimFilename,
  PHASE_F_VAULT_TODO,
  safeVaultFilename,
  VAULT_KIND_LABELS,
  VAULT_KINDS,
  VAULT_STATUS,
} from "./vault";
export type { VaultDocumentMeta, VaultKind } from "./vault";
export {
  catalogCadence,
  DEFAULT_SCHEDULED_JOBS,
  isScheduledPackId,
  PHASE_F_SCHEDULER_TODO,
  SCHEDULED_PACK_IDS,
  scheduledJobForPack,
  SCHEDULER_STATUS,
} from "./scheduler";
export type { JobCadence, ScheduledJobDef, ScheduledPackId } from "./scheduler";

export const DOCUMENTS_STATUS = "packs_and_vault_ready" as const;

export const PHASE_E_TODO =
  "Phase E live: audience narratives and PDF/PPTX packs at /narratives. Vault / scheduler are Phase F at /vault and /scheduler.";
