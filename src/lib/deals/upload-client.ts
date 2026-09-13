import {
  INTAKE_MAX_BYTES,
  INTAKE_MAX_BYTES_LABEL,
  TYPICAL_OM_BYTES,
  VERCEL_MULTIPART_SAFE_BYTES,
} from "./types";

export const UNTITLED_DEAL_NAME = "Untitled deal";
export const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;
export { VERCEL_MULTIPART_SAFE_BYTES, TYPICAL_OM_BYTES };

export type UploadRow = {
  key: string;
  name: string;
  progress: "queued" | "uploading" | "done" | "error";
  error?: string;
};

export function fileTooLargeMessage(maxBytes: number = INTAKE_MAX_BYTES): string {
  const mb = Math.round(maxBytes / (1024 * 1024));
  return `File too large (max ${mb} MB)`;
}

export function isUntitledDealName(name: string | null | undefined): boolean {
  return !name?.trim() || /^untitled deal$/i.test(name.trim());
}

export function workingTitle(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed && !isUntitledDealName(trimmed) ? trimmed : UNTITLED_DEAL_NAME;
}

export function requestExceedsIntakeLimit(contentLength: number, maxBytes: number = INTAKE_MAX_BYTES): boolean {
  return Number.isFinite(contentLength) && contentLength > maxBytes + MULTIPART_OVERHEAD_BYTES;
}

export function formatFileMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  const rounded = Math.round(mb * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function looksLikeOfferingMemo(filename: string): boolean {
  return /\b(om|cim|offering)\b|\.pdf$/i.test(filename);
}

/** Principal-facing copy when a valid OM would 413 on Vercel without Blob. */
export function blobTokenRequiredMessage(opts?: { filename?: string; byteSize?: number }): string {
  const filename = opts?.filename ?? "Life_at_Harrington_Park_OM.pdf";
  const byteSize = opts?.byteSize && opts.byteSize > 0 ? opts.byteSize : TYPICAL_OM_BYTES;
  const label = looksLikeOfferingMemo(filename) ? "OM" : "File";
  return `${label} is ${formatFileMb(byteSize)} MB — add BLOB_READ_WRITE_TOKEN in Vercel (Storage → Blob) or upload Excel first and add OM after Blob is connected`;
}

export function shouldUseClientBlobUpload(
  fileSize: number,
  opts: { onVercel?: boolean; blobConfigured?: boolean } = {},
): boolean {
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > INTAKE_MAX_BYTES) return false;
  const overThreshold = fileSize >= VERCEL_MULTIPART_SAFE_BYTES;
  if (!overThreshold) return false;
  return Boolean(opts.onVercel || opts.blobConfigured);
}

export function looksLikePlatform413(text: string): boolean {
  return /request entity too large|payload too large|functional payload|413/i.test(text) && /<html|<!doctype/i.test(text);
}

export function formatUploadFailure(input: {
  status?: number;
  serverMessage?: string;
  networkMessage?: string;
  filename?: string;
  byteSize?: number;
  blobConfigured?: boolean;
}): string {
  if (input.status) {
    const detail = input.serverMessage?.trim() || "Upload failed";
    const platformLimit =
      input.status === 413 &&
      !input.blobConfigured &&
      ((input.byteSize != null && input.byteSize >= VERCEL_MULTIPART_SAFE_BYTES && input.byteSize <= INTAKE_MAX_BYTES) ||
        /BLOB_READ_WRITE_TOKEN/i.test(detail));
    if (platformLimit || (input.status === 413 && /BLOB_READ_WRITE_TOKEN/i.test(detail))) {
      return /BLOB_READ_WRITE_TOKEN/i.test(detail)
        ? detail
        : blobTokenRequiredMessage({ filename: input.filename, byteSize: input.byteSize });
    }
    if (input.status === 413 && !/too large/i.test(detail) && !/BLOB_READ_WRITE_TOKEN/i.test(detail)) {
      return `HTTP 413: ${fileTooLargeMessage()}`;
    }
    return `HTTP ${input.status}: ${detail}`;
  }
  const raw = input.networkMessage?.trim() || "Failed to fetch";
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(raw)) {
    return `HTTP request failed (${raw}). The file was not stored. Upload one file at a time (max ${INTAKE_MAX_BYTES_LABEL} each).`;
  }
  return raw;
}

export function parseApiErrorText(
  status: number,
  text: string,
  fallback = "Upload failed",
  context?: { filename?: string; byteSize?: number; blobConfigured?: boolean },
): string {
  const trimmed = text.trim();
  if (trimmed) {
    try {
      const json = JSON.parse(trimmed) as { error?: string };
      if (json.error) {
        return formatUploadFailure({
          status,
          serverMessage: json.error,
          filename: context?.filename,
          byteSize: context?.byteSize,
          blobConfigured: context?.blobConfigured,
        });
      }
    } catch {
      // platform 413 / HTML error pages
    }
  }
  if (status === 413) {
    const platform =
      looksLikePlatform413(trimmed) ||
      (context?.byteSize != null &&
        context.byteSize >= VERCEL_MULTIPART_SAFE_BYTES &&
        context.byteSize <= INTAKE_MAX_BYTES);
    if (platform && !context?.blobConfigured) {
      return blobTokenRequiredMessage({ filename: context?.filename, byteSize: context?.byteSize });
    }
    return formatUploadFailure({
      status,
      serverMessage: fileTooLargeMessage(),
      filename: context?.filename,
      byteSize: context?.byteSize,
      blobConfigured: context?.blobConfigured,
    });
  }
  if (status === 429) {
    return formatUploadFailure({
      status,
      serverMessage: "Too many Add Deal requests. Wait a minute and retry.",
    });
  }
  const stripped = trimmed.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 280);
  return formatUploadFailure({ status, serverMessage: stripped || fallback });
}

export function initialUploadRows(
  files: { name: string; size: number }[],
  maxBytes: number = INTAKE_MAX_BYTES,
): UploadRow[] {
  return files.map((file, index) => {
    const key = `${index}:${file.name}`;
    if (file.size <= 0) {
      return { key, name: file.name, progress: "error", error: "File is empty." };
    }
    if (file.size > maxBytes) {
      return { key, name: file.name, progress: "error", error: fileTooLargeMessage(maxBytes) };
    }
    return { key, name: file.name, progress: "queued" };
  });
}

const DOC_PREFIX =
  /^(om|cim|pl|p&l|rr|t12|t-12|t12_noi|noi|rent\s*roll|budget|offering)[-_\s.]+/i;
const DATE_TOKEN =
  /\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}|\d{1,2}[./]\d{4}|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/gi;
const NOISE = new Set([
  "om",
  "cim",
  "pl",
  "rr",
  "t12",
  "t-12",
  "noi",
  "resi",
  "pdf",
  "xlsx",
  "xls",
  "csv",
  "the",
  "to",
  "from",
  "and",
  "of",
  "llc",
  "offering",
  "memorandum",
]);

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (word.length <= 2 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1).toLowerCase()))
    .join(" ")
    .replace(/\bAt\b/g, "at");
}

export function cleanFilenameForIdentity(filename: string): string {
  let stem = filename.replace(/\.[A-Za-z0-9]+$/, "");
  stem = stem.replace(/[–—]/g, "-");
  for (let i = 0; i < 5; i += 1) {
    const next = stem.replace(DOC_PREFIX, "");
    if (next === stem) break;
    stem = next;
  }
  stem = stem.replace(DATE_TOKEN, " ");
  stem = stem.replace(/[_]+/g, " ").replace(/[-]+/g, " ");
  const words = stem
    .split(/\s+/)
    .filter((word) => word && !NOISE.has(word.toLowerCase()) && !/^\d+$/.test(word));
  return titleCase(words.join(" "));
}

export function suggestIdentityFromFilenames(filenames: string[]): string | null {
  const cleaned = filenames.map(cleanFilenameForIdentity).filter((name) => name.replace(/\s+/g, "").length >= 4);
  if (!cleaned.length) return null;
  cleaned.sort((a, b) => b.length - a.length || a.localeCompare(b));
  return cleaned[0] ?? null;
}
