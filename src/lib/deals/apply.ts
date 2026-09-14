import { importBudgetCsv, replaceBudget } from "@/lib/budgets";
import { ReplaceRequiresConfirmError } from "@/lib/import-guard";
import { prisma } from "@/lib/prisma";
import { looksLikeRentRollFilename } from "@rcp/documents";
import { classifyFromFilename, inferAsOfDate } from "./infer";
import { importRentRollSource } from "@/lib/rent-roll";
import { parsePeriodLabel } from "@/lib/expert/period";
import { createSpeDeal } from "./create-spe";
import { promoteIntakeFilesToVault, readIntakeFileBytes } from "./files";
import { getIntake, updateIntake } from "./intake";
import type { DealGoal } from "./types";
import { bytesToImportCsv, isSpreadsheetFilename, parseT12WorkbookBytes } from "./workbook";
import { t12ParseToBudgetRows } from "@rcp/properties";
import { BROKER_T12_SOURCE, overlayNoteFromParse, postBrokerT12OverlayJournals } from "@/lib/t12-overlay";

function coachStructuredImportError(filename: string, error: unknown): never {
  const raw = error instanceof Error ? error.message : String(error);
  if (/could not map columns/i.test(raw)) {
    throw new Error(`${filename} is stored, but ${raw}`);
  }
  if (/missing required column|unit_id|account_code|no rows we can read|file is empty/i.test(raw)) {
    throw new Error(
      `${filename} is stored, but columns do not match the importer (${raw}). Supported dialects: Yardi Lease Charges, redIQ machine headers (UnitID, OccStatus, MktRent, InPlaceRent, NetSF), broker/Yardi-MRI flat rows, and the RCP canonical CSV. If this still fails, ask Expert — do not invent rows.`,
    );
  }
  throw error instanceof Error ? error : new Error(raw);
}

export async function applyCreateEntity(intakeId: string) {
  const intake = await getIntake(intakeId);
  if (!intake) throw new Error("Intake draft not found.");
  if (intake.entityId && intake.entity) {
    await promoteIntakeFilesToVault(intake.id, intake.entityId);
    return getIntake(intakeId);
  }
  if (!intake.speName || !intake.speCode) {
    throw new Error("Fill the SPE legal name and code before creating the entity.");
  }
  try {
    const { entity } = await createSpeDeal({
      name: intake.speName,
      code: intake.speCode,
      parentOpCoCode: intake.parentOpCoCode,
      unitCount: intake.unitCount,
      strategy: intake.strategy,
      goal: (intake.goal as DealGoal | null) ?? null,
      targetPeriod: intake.targetPeriod,
    });
    await updateIntake(intake.id, { entityId: entity.id, status: "READY", lastError: null, currentStep: 6 });
    await promoteIntakeFilesToVault(intake.id, entity.id);
    return getIntake(intakeId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create the SPE.";
    await updateIntake(intake.id, { status: "FAILED", lastError: message });
    throw error;
  }
}

export async function applyStructuredData(opts: {
  intakeId: string;
  confirmReplace?: boolean;
  importRentRoll?: boolean;
  importBudget?: boolean;
  importT12?: boolean;
  saveLoan?: boolean;
  lenient?: boolean;
}) {
  const intake = await getIntake(opts.intakeId);
  if (!intake) throw new Error("Intake draft not found.");
  if (!intake.entityId) {
    throw new Error("Create the SPE first, then apply rent-roll, budget, or loan data.");
  }

  const results: { kind: string; imported?: number; skipped?: string; loanId?: string; dialect?: string; dialectLabel?: string }[] = [];
  const period = parsePeriodLabel(intake.targetPeriod ?? "2026-08") ?? { year: 2026, month: 8 };

  try {
    if (opts.importRentRoll !== false) {
      const csvFile =
        intake.files.find((f) => f.classification === "rent_roll_csv") ??
        intake.files.find((f) => classifyFromFilename(f.filename) === "rent_roll_csv") ??
        intake.files.find((f) => looksLikeRentRollFilename(f.filename));
      if (csvFile) {
        const loaded = await readIntakeFileBytes(csvFile.id);
        if (!loaded) {
          results.push({
            kind: "rent_roll",
            skipped: `${csvFile.filename}: could not map columns: stored bytes missing. Detected headers: (none)`,
          });
        } else {
          let imported;
          try {
            const asOf = inferAsOfDate(loaded.file.filename);
            imported = await importRentRollSource({
              entityId: intake.entityId,
              filename: loaded.file.filename,
              mimeType: loaded.file.mimeType,
              bytes: loaded.bytes,
              confirmReplace: opts.confirmReplace,
              asOfDate: asOf ? new Date(`${asOf}T16:00:00.000Z`) : undefined,
              originalVaultDocumentId: loaded.file.vaultDocumentId,
            });
            if (!imported.units.length) {
              throw new Error(`could not map columns: unit rows. Detected headers: (none)`);
            }
          } catch (error) {
            if (error instanceof ReplaceRequiresConfirmError) throw error;
            if (opts.lenient) {
              const message = error instanceof Error ? error.message : String(error);
              const skipped = /could not map columns/i.test(message)
                ? `${loaded.file.filename}: ${message}`
                : `${loaded.file.filename} stored in vault; ${message}`;
              await prisma.dealIntakeFile.update({
                where: { id: csvFile.id },
                data: { status: "needs_mapping", lastError: message.slice(0, 500) },
              });
              results.push({ kind: "rent_roll", skipped });
              imported = undefined;
            } else {
              coachStructuredImportError(loaded.file.filename, error);
            }
          }
          if (imported) {
          await prisma.dealIntakeFile.update({
            where: { id: csvFile.id },
            data: { status: "imported", lastError: null },
          });
          await prisma.entity.update({
            where: { id: intake.entityId },
            data: { unitCount: imported.units.length },
          });
          results.push({
            kind: "rent_roll",
            imported: imported.units.length,
            dialect: imported.dialect,
            dialectLabel: imported.dialectLabel,
          });
          }
        }
      } else {
        results.push({ kind: "rent_roll", skipped: "No file classified as rent-roll CSV / XLSX." });
      }
    }

    if (opts.importBudget !== false) {
      const csvFile = intake.files.find((f) => f.classification === "budget_csv");
      if (csvFile) {
        const loaded = await readIntakeFileBytes(csvFile.id);
        if (loaded) {
          let rows;
          try {
            rows = await importBudgetCsv({
              entityId: intake.entityId,
              year: period.year,
              month: period.month,
              csv: bytesToImportCsv(loaded.file.filename, loaded.file.mimeType, loaded.bytes),
              source: "intake",
              confirmReplace: opts.confirmReplace,
            });
          } catch (error) {
            if (error instanceof ReplaceRequiresConfirmError) throw error;
            if (opts.lenient) {
              const message = error instanceof Error ? error.message : String(error);
              await prisma.dealIntakeFile.update({
                where: { id: csvFile.id },
                data: { status: "needs_mapping", lastError: message.slice(0, 500) },
              });
              results.push({ kind: "budget", skipped: `${loaded.file.filename} stored in vault; columns need mapping.` });
              rows = undefined;
            } else {
              coachStructuredImportError(loaded.file.filename, error);
            }
          }
          if (rows) {
          await prisma.dealIntakeFile.update({
            where: { id: csvFile.id },
            data: { status: "imported", lastError: null },
          });
          results.push({ kind: "budget", imported: rows.length });
          }
        }
      } else {
        results.push({ kind: "budget", skipped: "No file classified as budget CSV / XLSX." });
      }
    }

    if (opts.importT12 !== false) {
      const t12Files = intake.files.filter((f) => f.classification === "t12_pl");
      for (const t12File of t12Files) {
        const loaded = await readIntakeFileBytes(t12File.id);
        if (!loaded) {
          results.push({
            kind: "t12_overlay",
            skipped: `${t12File.filename}: stored bytes missing — vaulted only, not mapped to budget.`,
          });
          continue;
        }
        try {
          const parsed = isSpreadsheetFilename(loaded.file.filename)
            ? parseT12WorkbookBytes(loaded.bytes, loaded.file.filename)
            : null;
          if (!parsed) {
            results.push({
              kind: "t12_overlay",
              skipped: `${loaded.file.filename} is not a workbook we can map to CoA.`,
            });
            continue;
          }
          const rows = t12ParseToBudgetRows(parsed);
          if (!rows.length) {
            throw new Error(`could not map columns: T12 operating lines. Detected headers: ${parsed.detectedHeaders.join(", ")}`);
          }
          await replaceBudget({
            entityId: intake.entityId,
            year: period.year,
            month: period.month,
            rows,
            source: BROKER_T12_SOURCE,
          });
          const postedLines = await postBrokerT12OverlayJournals({
            entityId: intake.entityId,
            year: period.year,
            month: period.month,
            parsed,
            filename: loaded.file.filename,
          });
          if (t12File.vaultDocumentId) {
            await prisma.vaultDocument.update({
              where: { id: t12File.vaultDocumentId },
              data: {
                notes: overlayNoteFromParse(
                  parsed,
                  loaded.file.filename,
                  `${period.year}-${String(period.month).padStart(2, "0")}`,
                  postedLines > 0,
                ),
              },
            });
          }
          await prisma.dealIntakeFile.update({
            where: { id: t12File.id },
            data: { status: "imported", lastError: null },
          });
          results.push({ kind: "t12_overlay", imported: rows.length });
        } catch (error) {
          if (error instanceof ReplaceRequiresConfirmError) throw error;
          const message = error instanceof Error ? error.message : String(error);
          await prisma.dealIntakeFile.update({
            where: { id: t12File.id },
            data: { status: "needs_mapping", lastError: message.slice(0, 500) },
          });
          results.push({
            kind: "t12_overlay",
            skipped: `${loaded.file.filename}: ${message}. Overlay only — nothing posted to the GL.`,
          });
        }
      }
    }

    if (opts.saveLoan !== false && intake.loanLender && intake.loanUpbCents && intake.loanRateBps && intake.loanPaymentCents && intake.loanMaturity) {
      const existing = await prisma.loan.findFirst({ where: { entityId: intake.entityId } });
      const origination = intake.loanOrigination ?? new Date(Date.UTC(period.year, period.month - 1, 1, 16));
      const data = {
        name: intake.loanName?.trim() || `${intake.loanLender} first mortgage`,
        lenderName: intake.loanLender,
        originalPrincipalCents: intake.loanUpbCents,
        currentUpbCents: intake.loanUpbCents,
        interestRateBps: intake.loanRateBps,
        paymentCents: intake.loanPaymentCents,
        originationDate: origination,
        maturityDate: intake.loanMaturity,
        dscrThresholdBps: intake.dscrThresholdBps ?? 12_500,
        debtYieldThresholdBps: intake.debtYieldThresholdBps ?? 800,
        notes: "Captured from Add Deal. LTV is gated — do not invent it from book cost.",
      };
      const loan = existing
        ? await prisma.loan.update({ where: { id: existing.id }, data })
        : await prisma.loan.create({ data: { entityId: intake.entityId, ...data } });
      results.push({ kind: "loan", loanId: loan.id });
    } else if (opts.saveLoan !== false) {
      results.push({ kind: "loan", skipped: "Loan basics were not filled (lender, UPB, rate, payment, maturity)." });
    }

    await updateIntake(intake.id, { status: "APPLIED", lastError: null, currentStep: 7 });
    return { results, intake: await getIntake(intake.id) };
  } catch (error) {
    if (error instanceof ReplaceRequiresConfirmError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Apply failed.";
    await updateIntake(intake.id, { status: "FAILED", lastError: message });
    throw error;
  }
}
