/** Document vault kinds linked to a legal entity. Blobs use the durable file store. */

export const VAULT_STATUS = "ready" as const;

export const VAULT_KINDS = [
  "lease",
  "loan",
  "k1",
  "draw",
  "insurance",
  "rent_roll",
  "budget",
  "om_cim",
  "other",
] as const;
export type VaultKind = (typeof VAULT_KINDS)[number];

export const VAULT_KIND_LABELS: Record<VaultKind, string> = {
  lease: "Lease",
  loan: "Loan",
  k1: "K-1 / capital packet",
  draw: "Draw / funding",
  insurance: "Insurance",
  rent_roll: "Rent roll",
  budget: "Budget",
  om_cim: "OM / CIM",
  other: "Other",
};

export function isVaultKind(value: string): value is VaultKind {
  return (VAULT_KINDS as readonly string[]).includes(value);
}

/** Offering memo / CIM filenames, including Life_at_Harrington_Park_OM_….pdf */
export function looksLikeOmCimFilename(filename: string): boolean {
  const stem = filename.replace(/\.[A-Za-z0-9]+$/, "");
  if (/_OM(_|\b)|_OM$/i.test(stem)) return true;
  if (/(^|[-_\s.])(om|cim)([-_\s.]|$)/i.test(stem)) return true;
  if (/offering[\s._-]*mem/i.test(filename)) return true;
  if (/\boffering\b/i.test(filename)) return true;
  return false;
}

/**
 * Rent-roll filenames even when Kind is Other.
 * Matches `RR_-_Harrington_…`, `Hampton - RR 07.08.26.xlsx`, `*rent-roll*`, and lease-charges workbooks.
 * Does not treat “Harrington” / T-12 operating statements as rent rolls.
 */
export function looksLikeRentRollFilename(filename: string): boolean {
  const stem = filename.replace(/\.[A-Za-z0-9]+$/, "");
  const tokens = stem
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[._/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!tokens) return false;
  if (/\b(lease\s*charges|rent\s*rolls?|rentroll)\b/.test(tokens)) return true;
  return /\brr\b/.test(tokens);
}

/** Prefer OM / CIM or rent-roll when the filename is decisive; otherwise keep the selected kind. */
export function guessVaultKind(filename: string, selected?: string | null): VaultKind {
  if (looksLikeOmCimFilename(filename)) return "om_cim";
  if (looksLikeRentRollFilename(filename)) return "rent_roll";
  if (selected && isVaultKind(selected)) return selected;
  return "other";
}

export const PHASE_F_VAULT_TODO =
  "Phase F live: document vault stores metadata + file blobs at /vault (leases, loans, K-1s, draws, insurance). On Vercel, blobs persist in Neon StoredBlob or Vercel Blob — not the ephemeral function filesystem.";

export type VaultDocumentMeta = {
  id: string;
  entityCode: string;
  entityName: string;
  kind: VaultKind;
  title: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  notes: string | null;
  uploadedAt: string;
};

export function safeVaultFilename(name: string): string {
  const base = name.replace(/[/\\?%*:|"<>]/g, "-").replace(/\s+/g, " ").trim();
  return base.slice(0, 180) || "document.bin";
}
