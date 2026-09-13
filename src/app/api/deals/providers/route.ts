import { describeFileStore, isBlobTokenConfigured, isOnVercel, resolveFileStoreBackend } from "@/lib/file-store";
import { listProviderStatus } from "@/lib/deals/providers";
import { rcpMailboxAddress } from "@/lib/deals/providers";
import {
  INTAKE_MAX_BYTES,
  INTAKE_MAX_BYTES_LABEL,
  VERCEL_FUNCTION_BODY_LIMIT_BYTES,
  VERCEL_MULTIPART_SAFE_BYTES,
} from "@/lib/deals/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    providers: listProviderStatus(),
    rcpMailbox: rcpMailboxAddress() || null,
    maxBytes: INTAKE_MAX_BYTES,
    maxBytesLabel: INTAKE_MAX_BYTES_LABEL,
    allowedExtensions: [".csv", ".xlsx", ".xls", ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".txt", ".eml", ".doc", ".docx"],
    fileStore: resolveFileStoreBackend(),
    fileStoreLabel: describeFileStore(),
    blobConfigured: isBlobTokenConfigured(),
    onVercel: isOnVercel(),
    clientUploadThresholdBytes: VERCEL_MULTIPART_SAFE_BYTES,
    vercelBodyLimitBytes: VERCEL_FUNCTION_BODY_LIMIT_BYTES,
  });
}
