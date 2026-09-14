import { looksLikeRentRollFilename } from "@rcp/documents";
import { detectRentRollDialect, parseCsvLines } from "@rcp/properties";
import { read } from "xlsx";
import { prisma } from "@/lib/prisma";
import { CANONICAL_WORKBOOK_FILENAME } from "@/lib/rent-roll-workbook";
import { readVaultDocument } from "@/lib/vault";
import {
  isSpreadsheetFilename,
  SPREADSHEET_MIME_TYPES,
  workbookSheets,
} from "./workbook";

export type RankedRentRollCandidate = {
  id: string;
  filename: string;
  kind: string;
  filenameHits: boolean;
  kindHits: boolean;
  dialectScore: number;
  dialect?: string;
  detectedHeaders: string[];
  total: number;
};

export type PickedVaultRentRoll = {
  id: string;
  filename: string;
  mimeType: string;
  kind: string;
  bytes: Buffer;
  ranked: RankedRentRollCandidate;
};

const DIALECT_MIN = 18;

export function isCanonicalRentRollFilename(filename: string): boolean {
  return filename.trim().toLowerCase() === CANONICAL_WORKBOOK_FILENAME.toLowerCase();
}

export function looksLikeTabularRentRollSource(filename: string, mimeType?: string | null): boolean {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv") || mimeType?.toLowerCase().includes("csv")) return true;
  if (isSpreadsheetFilename(filename)) return true;
  if (mimeType && (SPREADSHEET_MIME_TYPES as readonly string[]).includes(mimeType)) return true;
  return false;
}

export function scoreRentRollBytes(
  bytes: Buffer,
  filename: string,
): { dialectScore: number; dialect?: string; detectedHeaders: string[] } {
  try {
    if (isSpreadsheetFilename(filename)) {
      const workbook = read(bytes, { type: "buffer", cellDates: true, raw: false });
      const sheets = workbookSheets(workbook);
      let dialectScore = 0;
      let dialect: string | undefined;
      let detectedHeaders: string[] = [];
      for (const sheet of sheets) {
        const hit = detectRentRollDialect(sheet.rows);
        const score = hit?.score ?? 0;
        if (score > dialectScore) {
          dialectScore = score;
          dialect = hit?.dialect;
          const sample = sheet.rows.find((row) => row.some((cell) => cell.trim())) ?? [];
          detectedHeaders = sample.filter(Boolean).slice(0, 16);
        }
      }
      return { dialectScore, dialect, detectedHeaders };
    }
    const rows = parseCsvLines(bytes.toString("utf8"));
    const hit = detectRentRollDialect(rows);
    const sample = rows.find((row) => row.some((cell) => cell.trim())) ?? [];
    return {
      dialectScore: hit?.score ?? 0,
      dialect: hit?.dialect,
      detectedHeaders: sample.filter(Boolean).slice(0, 16),
    };
  } catch {
    return { dialectScore: 0, detectedHeaders: [] };
  }
}

export function rankVaultRentRollCandidate(opts: {
  id: string;
  filename: string;
  kind: string;
  title?: string | null;
  mimeType?: string | null;
  bytes?: Buffer | null;
}): RankedRentRollCandidate {
  const filenameHits =
    looksLikeRentRollFilename(opts.filename) || looksLikeRentRollFilename(opts.title ?? "");
  const kindHits = opts.kind === "rent_roll";
  let dialectScore = 0;
  let dialect: string | undefined;
  let detectedHeaders: string[] = [];
  if (opts.bytes && looksLikeTabularRentRollSource(opts.filename, opts.mimeType)) {
    const content = scoreRentRollBytes(opts.bytes, opts.filename);
    dialectScore = content.dialectScore;
    dialect = content.dialect;
    detectedHeaders = content.detectedHeaders;
  }
  return {
    id: opts.id,
    filename: opts.filename,
    kind: opts.kind,
    filenameHits,
    kindHits,
    dialectScore,
    dialect,
    detectedHeaders,
    total: (kindHits ? 30 : 0) + (filenameHits ? 50 : 0) + dialectScore,
  };
}

export function isViableRentRollCandidate(candidate: RankedRentRollCandidate): boolean {
  if (isCanonicalRentRollFilename(candidate.filename)) return false;
  return candidate.kindHits || candidate.filenameHits || candidate.dialectScore >= DIALECT_MIN;
}

function betterCandidate(a: RankedRentRollCandidate, b: RankedRentRollCandidate): RankedRentRollCandidate {
  if (a.total !== b.total) return a.total >= b.total ? a : b;
  if (a.dialectScore !== b.dialectScore) return a.dialectScore >= b.dialectScore ? a : b;
  if (a.filenameHits !== b.filenameHits) return a.filenameHits ? a : b;
  return a;
}

export async function pickVaultRentRollForEntity(opts: {
  entityId: string;
  documentId?: string;
}): Promise<PickedVaultRentRoll | null> {
  const docs = await prisma.vaultDocument.findMany({
    where: { entityId: opts.entityId },
    orderBy: { uploadedAt: "desc" },
  });
  if (opts.documentId) {
    const doc = docs.find((row) => row.id === opts.documentId);
    if (!doc) return null;
    if (isCanonicalRentRollFilename(doc.filename)) return null;
    const loaded = await readVaultDocumentSafe(doc.id);
    if (!loaded) {
      throw new Error(`${doc.filename} metadata exists, but the stored bytes are missing.`);
    }
    return {
      id: doc.id,
      filename: doc.filename,
      mimeType: doc.mimeType,
      kind: doc.kind,
      bytes: loaded.bytes,
      ranked: rankVaultRentRollCandidate({
        id: doc.id,
        filename: doc.filename,
        kind: doc.kind,
        title: doc.title,
        mimeType: doc.mimeType,
        bytes: loaded.bytes,
      }),
    };
  }

  let best: PickedVaultRentRoll | null = null;
  let unreadableRr: string | null = null;
  for (const doc of docs) {
    if (isCanonicalRentRollFilename(doc.filename)) continue;
    const tabular = looksLikeTabularRentRollSource(doc.filename, doc.mimeType);
    const nameHits = looksLikeRentRollFilename(doc.filename) || looksLikeRentRollFilename(doc.title);
    if (!tabular && doc.kind !== "rent_roll" && !nameHits) continue;
    const loaded = tabular || nameHits || doc.kind === "rent_roll" ? await readVaultDocumentSafe(doc.id) : null;
    const ranked = rankVaultRentRollCandidate({
      id: doc.id,
      filename: doc.filename,
      kind: doc.kind,
      title: doc.title,
      mimeType: doc.mimeType,
      bytes: loaded?.bytes ?? null,
    });
    if (!isViableRentRollCandidate(ranked)) continue;
    if (!loaded) {
      if (ranked.filenameHits && !unreadableRr) unreadableRr = doc.filename;
      continue;
    }
    if (!best || betterCandidate(ranked, best.ranked) === ranked) {
      best = {
        id: doc.id,
        filename: doc.filename,
        mimeType: doc.mimeType,
        kind: doc.kind,
        bytes: loaded.bytes,
        ranked,
      };
    }
  }
  if (!best && unreadableRr) {
    throw new Error(`${unreadableRr} metadata exists, but the stored bytes are missing.`);
  }
  return best;
}

async function readVaultDocumentSafe(id: string) {
  try {
    return await readVaultDocument(id);
  } catch {
    return null;
  }
}

export function pickOriginalRentRollMeta<T extends { filename: string; kind: string; title?: string | null }>(
  docs: T[],
): T | undefined {
  const live = docs.filter((doc) => !isCanonicalRentRollFilename(doc.filename));
  return (
    live.find((doc) => doc.kind === "rent_roll") ??
    live.find((doc) => looksLikeRentRollFilename(doc.filename) || looksLikeRentRollFilename(doc.title ?? ""))
  );
}
