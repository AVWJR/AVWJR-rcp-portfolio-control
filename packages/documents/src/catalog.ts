import { PACK_CATALOG, type PackMeta } from "@rcp/reporting";

/** Report catalog consumed by UI, VERIFY_PHASE_E, and docs/RCP_REPORT_CATALOG.md. */
export const REPORT_PACKS: PackMeta[] = PACK_CATALOG;

export { PHASE_F_VAULT_TODO } from "./vault";
export { PHASE_F_SCHEDULER_TODO } from "./scheduler";

export function listReportPacks(): PackMeta[] {
  return REPORT_PACKS;
}
