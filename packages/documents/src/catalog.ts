import { PACK_CATALOG, type PackMeta } from "@rcp/reporting";

/** Report catalog consumed by UI, VERIFY_PHASE_E, and docs/RCP_REPORT_CATALOG.md. */
export const REPORT_PACKS: PackMeta[] = PACK_CATALOG;

export const PHASE_F_VAULT_TODO =
  "TODO(Phase F): document vault, operating-agreement store, bank recs, K-1 packets, and scheduler. Phase E emits PDF/PPTX packs only.";

export const PHASE_F_SCHEDULER_TODO =
  "TODO(Phase F): scheduled pack delivery. Exports are on-demand from /narratives.";

export function listReportPacks(): PackMeta[] {
  return REPORT_PACKS;
}
