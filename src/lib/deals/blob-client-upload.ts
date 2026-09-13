"use client";

import { upload } from "@vercel/blob/client";
import { VERCEL_MULTIPART_SAFE_BYTES } from "./types";

export const INTAKE_BLOB_HANDLE_URL = "/api/deals/intake/blob";

export function intakeBlobPathname(intakeId: string, filename: string): string {
  const safe = filename.replace(/[^\w.\-]+/g, "_").slice(0, 180);
  return `rcp-intake/${intakeId}/${Date.now()}-${safe}`;
}

export async function uploadFileToVercelBlob(
  file: File,
  opts: { intakeId: string; source: string },
) {
  return upload(intakeBlobPathname(opts.intakeId, file.name), file, {
    access: "private",
    handleUploadUrl: INTAKE_BLOB_HANDLE_URL,
    contentType: file.type || "application/octet-stream",
    multipart: file.size >= VERCEL_MULTIPART_SAFE_BYTES,
    clientPayload: JSON.stringify({
      intakeId: opts.intakeId,
      source: opts.source,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      byteSize: file.size,
    }),
  });
}
