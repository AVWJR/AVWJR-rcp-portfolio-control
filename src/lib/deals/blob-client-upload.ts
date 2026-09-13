"use client";

import { upload } from "@vercel/blob/client";
import { VERCEL_MULTIPART_SAFE_BYTES } from "./types";

export const INTAKE_BLOB_HANDLE_URL = "/api/deals/intake/blob";
export const VAULT_BLOB_HANDLE_URL = "/api/vault/blob";

function safeBlobFilename(filename: string): string {
  return filename.replace(/[^\w.\-]+/g, "_").slice(0, 180);
}

export function intakeBlobPathname(intakeId: string, filename: string): string {
  return `rcp-intake/${intakeId}/${Date.now()}-${safeBlobFilename(filename)}`;
}

export function vaultBlobPathname(entityCode: string, filename: string): string {
  return `rcp-vault/${entityCode}/${Date.now()}-${safeBlobFilename(filename)}`;
}

export type IntakeBlobUploadOpts = { intakeId: string; source: string };
export type VaultBlobUploadOpts = {
  entityCode: string;
  kind?: string;
  title?: string;
  notes?: string;
};

export async function uploadFileToVercelBlob(
  file: File,
  opts: IntakeBlobUploadOpts | VaultBlobUploadOpts,
) {
  const isVault = "entityCode" in opts;
  const pathname = isVault
    ? vaultBlobPathname(opts.entityCode, file.name)
    : intakeBlobPathname(opts.intakeId, file.name);
  const handleUploadUrl = isVault ? VAULT_BLOB_HANDLE_URL : INTAKE_BLOB_HANDLE_URL;
  const clientPayload = isVault
    ? {
        entityCode: opts.entityCode,
        kind: opts.kind,
        title: opts.title,
        notes: opts.notes,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        byteSize: file.size,
      }
    : {
        intakeId: opts.intakeId,
        source: opts.source,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        byteSize: file.size,
      };
  return upload(pathname, file, {
    access: "private",
    handleUploadUrl,
    contentType: file.type || "application/octet-stream",
    multipart: file.size >= VERCEL_MULTIPART_SAFE_BYTES,
    clientPayload: JSON.stringify(clientPayload),
  });
}
