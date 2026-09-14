import { inferAsOfDate } from "./infer";
import { importRentRollSource } from "@/lib/rent-roll";
import { prisma } from "@/lib/prisma";
import { readVaultDocument } from "@/lib/vault";
import { applyStructuredData } from "./apply";

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
    return { entityCode: entity.code, imported: rr.imported, source: intakeRr.filename, dialect: rr.dialect, dialectLabel: rr.dialectLabel, results: applied.results };
  }

  const vaulted = await prisma.vaultDocument.findFirst({
    where: { entityId: entity.id, kind: "rent_roll", NOT: { filename: "rent-roll-canonical.xlsx" } },
    orderBy: { uploadedAt: "desc" },
  });
  if (!vaulted) {
    throw new Error(`${entity.code} has no vaulted rent-roll file to re-apply. Upload the RR xlsx on Add Deal or Properties.`);
  }
  const loaded = await readVaultDocument(vaulted.id);
  if (!loaded) {
    throw new Error(`${vaulted.filename} metadata exists, but the stored bytes are missing.`);
  }
  const asOf = inferAsOfDate(loaded.doc.filename);
  const imported = await importRentRollSource({
    entityId: entity.id,
    filename: loaded.doc.filename,
    mimeType: loaded.doc.mimeType,
    bytes: loaded.bytes,
    confirmReplace: true,
    asOfDate: asOf ? new Date(`${asOf}T16:00:00.000Z`) : undefined,
    originalVaultDocumentId: loaded.doc.id,
  });
  if (!imported.units.length) {
    throw new Error(`${loaded.doc.filename}: could not map rent-roll columns. Detected headers: (none)`);
  }
  await prisma.entity.update({ where: { id: entity.id }, data: { unitCount: imported.units.length } });
  return {
    entityCode: entity.code,
    imported: imported.units.length,
    source: loaded.doc.filename,
    dialect: imported.dialect,
    dialectLabel: imported.dialectLabel,
    results: [{ kind: "rent_roll", imported: imported.units.length, dialect: imported.dialect, dialectLabel: imported.dialectLabel }],
  };
}
