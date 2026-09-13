import { renderPdfPack, renderPptxPack } from "@rcp/documents";
import { buildPack, isPackId, type BuiltPack, type PackId } from "@rcp/reporting";
import { loadPeriodSnapshot } from "./period-snapshot";

export async function buildEntityPack(opts: {
  entityId: string;
  entityType: string;
  year: number;
  month: number;
  packId: PackId;
}): Promise<BuiltPack> {
  const snap = await loadPeriodSnapshot({
    entityId: opts.entityId,
    entityType: opts.entityType,
    year: opts.year,
    month: opts.month,
  });
  return buildPack(snap, opts.packId);
}

export async function exportPackBuffer(pack: BuiltPack, format: "pdf" | "pptx"): Promise<Buffer> {
  if (format === "pdf") return renderPdfPack(pack);
  return renderPptxPack(pack);
}

export function parsePackId(value: string | undefined): PackId | null {
  if (!value) return null;
  return isPackId(value) ? value : null;
}
