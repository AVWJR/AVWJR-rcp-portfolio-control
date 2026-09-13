/**
 * Phase E: report-pack catalog and PDF / PPTX exporters.
 * Document vault, K-1 packets, and scheduler remain Phase F stubs.
 */

export {
  PHASE_F_SCHEDULER_TODO,
  PHASE_F_VAULT_TODO,
  REPORT_PACKS,
  listReportPacks,
} from "./catalog";
export { renderPdfPack } from "./pdf-pack";
export { renderPptxPack } from "./pptx-pack";

export const DOCUMENTS_STATUS = "packs_ready" as const;

export const PHASE_E_TODO =
  "Phase E live: audience narratives and PDF/PPTX packs at /narratives. Vault / scheduler are Phase F.";
