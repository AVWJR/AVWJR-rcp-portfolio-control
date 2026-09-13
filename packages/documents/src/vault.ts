/** Document vault kinds linked to a legal entity. Blobs live on local FS. */

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

export const PHASE_F_VAULT_TODO =
  "Phase F live: document vault stores metadata + file blobs at /vault (leases, loans, K-1s, draws, insurance).";

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
