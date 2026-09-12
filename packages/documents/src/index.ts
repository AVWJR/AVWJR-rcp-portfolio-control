/**
 * Document vault stub.
 * TODO(Phase E): audience narratives, PDF packs, operating agreements,
 * rent rolls, bank recs, lender notices. Phase D dashboards do not emit PDFs.
 * No live PMS or bank attachments.
 */

export type DocumentKind = "oa" | "rent_roll" | "bank_rec" | "lender" | "narrative" | "pdf_pack" | "other";

export const DOCUMENTS_STATUS = "not_implemented" as const;

export const PHASE_E_TODO =
  "TODO(Phase E): audience narratives and PDF packs. Do not generate lender/investor PDFs from Phase D dashboards.";
