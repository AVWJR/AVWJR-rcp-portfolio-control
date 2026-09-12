/**
 * Document vault stub.
 * TODO(Phase E): operating agreements, rent rolls, bank recs, lender notices.
 * No live PMS or bank attachments in Phase A.
 */

export type DocumentKind = "oa" | "rent_roll" | "bank_rec" | "lender" | "other";

export const DOCUMENTS_STATUS = "not_implemented" as const;
