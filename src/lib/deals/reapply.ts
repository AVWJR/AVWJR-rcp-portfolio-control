import { looksLikeRentRollFilename } from "@rcp/documents";
import { inferAsOfDate } from "./infer";
import { pickVaultRentRollForEntity } from "./rent-roll-candidates";
import { importRentRollSource } from "@/lib/rent-roll";
import { prisma } from "@/lib/prisma";
import { applyStructuredData } from "./apply";

function mapError(filename: string, error: unknown): never {
  const raw = error instanceof Error ? error.message : String(error);
  if (/could not map columns/i.test(raw)) {
    throw new Error(/^[^\n:]+:\s*could not map columns/i.test(raw) ? raw : `${filename}: ${raw}`);
  }
  throw error instanceof Error ? error : new Error(raw);
}

export async function reapplyRentRollForEntity(entityCode: string, documentId?: string) {
  const entity = await prisma.entity.findUnique({ where: { code: entityCode } });
  if (!entity || entity.type !== "SPE") {
    throw new Error("Re-apply is SPE-only. Open a property SPE, then retry.");
  }

  const vaulted = await pickVaultRentRollForEntity({ entityId: entity.id, documentId });
  if (vaulted) {
    const asOf = inferAsOfDate(vaulted.filename);
    let imported;
    try {
      imported = await importRentRollSource({
        entityId: entity.id,
        filename: vaulted.filename,
        mimeType: vaulted.mimeType,
        bytes: vaulted.bytes,
        confirmReplace: true,
        asOfDate: asOf ? new Date(`${asOf}T16:00:00.000Z`) : undefined,
        originalVaultDocumentId: vaulted.id,
      });
    } catch (error) {
      mapError(vaulted.filename, error);
    }
    if (!imported.units.length) {
      const headers = vaulted.ranked.detectedHeaders.join(", ") || "(none)";
      throw new Error(`${vaulted.filename}: could not map columns: unit rows. Detected headers: ${headers}`);
    }
    await prisma.entity.update({ where: { id: entity.id }, data: { unitCount: imported.units.length } });
    if (vaulted.kind !== "rent_roll") {
      await prisma.vaultDocument.update({
        where: { id: vaulted.id },
        data: { kind: "rent_roll" },
      });
    }
    return {
      entityCode: entity.code,
      imported: imported.units.length,
      source: vaulted.filename,
      dialect: imported.dialect,
      dialectLabel: imported.dialectLabel,
      results: [
        {
          kind: "rent_roll",
          imported: imported.units.length,
          dialect: imported.dialect,
          dialectLabel: imported.dialectLabel,
        },
      ],
    };
  }

  if (documentId) {
    throw new Error(
      `${entity.code}: that vault file is missing or is the canonical template. Choose the original rent-roll workbook.`,
    );
  }

  const intake = await prisma.dealIntake.findFirst({
    where: { entityId: entity.id },
    include: { files: true },
    orderBy: { updatedAt: "desc" },
  });
  const intakeRr = intake?.files.find(
    (file) => file.classification === "rent_roll_csv" || looksLikeRentRollFilename(file.filename),
  );
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
      throw new Error(rr?.skipped ?? `${entity.code}: could not map columns: unit rows. Detected headers: (none)`);
    }
    return {
      entityCode: entity.code,
      imported: rr.imported,
      source: intakeRr.filename,
      dialect: rr.dialect,
      dialectLabel: rr.dialectLabel,
      results: applied.results,
    };
  }

  throw new Error(
    `${entity.code} has no vaulted rent-roll file to re-apply. Upload the RR xlsx on Add Deal or Properties.`,
  );
}
