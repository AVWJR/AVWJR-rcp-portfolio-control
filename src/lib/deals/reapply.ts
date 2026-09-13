import { inferAsOfDate } from "./infer";
import { importRentRollCsv } from "@/lib/rent-roll";
import { prisma } from "@/lib/prisma";
import { readVaultDocument } from "@/lib/vault";
import { applyStructuredData } from "./apply";
import { bytesToImportCsv, isSpreadsheetFilename } from "./workbook";

export async function reapplyRentRollForEntity(entityCode: string) {
  const entity = await prisma.entity.findUnique({ where: { code: entityCode } });
  if (!entity || entity.type !== "SPE") {
    throw new Error("Re-apply is SPE-only. Open a property SPE, then retry.");
  }

  const intake = await prisma.dealIntake.findFirst({
    where: { entityId: entity.id },
    include: { files: true },
    orderBy: { updatedAt: "desc" },
  });
  const intakeRr = intake?.files.find((file) => file.classification === "rent_roll_csv");
  if (intake && intakeRr) {
    const applied = await applyStructuredData({
      intakeId: intake.id,
      confirmReplace: true,
      importRentRoll: true,
      importBudget: true,
      importT12: true,
      saveLoan: false,
      lenient: true,
    });
    const rr = applied.results.find((row) => row.kind === "rent_roll");
    if (!rr?.imported) {
      throw new Error(rr?.skipped ?? `${entity.code}: could not map rent-roll columns. Detected headers: (none)`);
    }
    return { entityCode: entity.code, imported: rr.imported, source: intakeRr.filename, results: applied.results };
  }

  const vaulted = await prisma.vaultDocument.findFirst({
    where: { entityId: entity.id, kind: "rent_roll" },
    orderBy: { uploadedAt: "desc" },
  });
  if (!vaulted) {
    throw new Error(`${entity.code} has no vaulted rent-roll file to re-apply. Upload the RR xlsx on Add Deal or Properties.`);
  }
  const loaded = await readVaultDocument(vaulted.id);
  if (!loaded) {
    throw new Error(`${vaulted.filename} metadata exists, but the stored bytes are missing.`);
  }
  const csv =
    isSpreadsheetFilename(loaded.doc.filename) || loaded.doc.mimeType.includes("spreadsheet")
      ? bytesToImportCsv(loaded.doc.filename, loaded.doc.mimeType, loaded.bytes)
      : loaded.bytes.toString("utf8");
  const asOf = inferAsOfDate(loaded.doc.filename);
  const units = await importRentRollCsv({
    entityId: entity.id,
    csv,
    confirmReplace: true,
    asOfDate: asOf ? new Date(`${asOf}T16:00:00.000Z`) : undefined,
  });
  if (!units.length) {
    throw new Error(`${loaded.doc.filename}: could not map rent-roll columns. Detected headers: (none)`);
  }
  await prisma.entity.update({ where: { id: entity.id }, data: { unitCount: units.length } });
  return { entityCode: entity.code, imported: units.length, source: loaded.doc.filename, results: [{ kind: "rent_roll", imported: units.length }] };
}
