import { INTAKE_MAX_BYTES, INTAKE_MAX_BYTES_LABEL } from "./types";

export const UNTITLED_DEAL_NAME = "Untitled deal";
export const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

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

export function formatUploadFailure(input: {
  status?: number;
  serverMessage?: string;
  networkMessage?: string;
}): string {
  if (input.status) {
    const detail = input.serverMessage?.trim() || "Upload failed";
    if (input.status === 413 && !/too large/i.test(detail)) {
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

export function parseApiErrorText(status: number, text: string, fallback = "Upload failed"): string {
  const trimmed = text.trim();
  if (trimmed) {
    try {
      const json = JSON.parse(trimmed) as { error?: string };
      if (json.error) return formatUploadFailure({ status, serverMessage: json.error });
    } catch {
      // platform 413 / HTML error pages
    }
  }
  if (status === 413) return formatUploadFailure({ status, serverMessage: fileTooLargeMessage() });
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
