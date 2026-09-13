import { importBudgetCsv } from "@/lib/budgets";
import { ReplaceRequiresConfirmError } from "@/lib/import-guard";
import { prisma } from "@/lib/prisma";
import { importRentRollCsv } from "@/lib/rent-roll";
import { parsePeriodLabel } from "@/lib/expert/period";
import { createSpeDeal } from "./create-spe";
import { promoteIntakeFilesToVault, readIntakeFileBytes } from "./files";
import { getIntake, updateIntake } from "./intake";
import type { DealGoal } from "./types";
import { bytesToImportCsv } from "./workbook";

function coachStructuredImportError(filename: string, error: unknown): never {
  const raw = error instanceof Error ? error.message : String(error);
  if (/missing required column|unit_id|account_code|no rows we can read|file is empty/i.test(raw)) {
    throw new Error(
      `${filename} is stored, but columns do not match the importer (${raw}). Ask Expert to map columns (rent-roll: unit_id, floorplan, beds, baths, sqft, status, market_rent, in_place_rent, lease_start, lease_end; budget: account_code, amount) or save the first sheet as CSV. Do not invent rows.`,
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
  saveLoan?: boolean;
}) {
  const intake = await getIntake(opts.intakeId);
  if (!intake) throw new Error("Intake draft not found.");
  if (!intake.entityId) {
    throw new Error("Create the SPE first, then apply rent-roll, budget, or loan data.");
  }

  const results: { kind: string; imported?: number; skipped?: string; loanId?: string }[] = [];
  const period = parsePeriodLabel(intake.targetPeriod ?? "2026-08") ?? { year: 2026, month: 8 };

  try {
    if (opts.importRentRoll !== false) {
      const csvFile = intake.files.find((f) => f.classification === "rent_roll_csv");
      if (csvFile) {
        const loaded = await readIntakeFileBytes(csvFile.id);
        if (loaded) {
          let units;
          try {
            units = await importRentRollCsv({
              entityId: intake.entityId,
              csv: bytesToImportCsv(loaded.file.filename, loaded.file.mimeType, loaded.bytes),
              confirmReplace: opts.confirmReplace,
            });
          } catch (error) {
            if (error instanceof ReplaceRequiresConfirmError) throw error;
            coachStructuredImportError(loaded.file.filename, error);
          }
          await prisma.dealIntakeFile.update({
            where: { id: csvFile.id },
            data: { status: "imported", lastError: null },
          });
          results.push({ kind: "rent_roll", imported: units.length });
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
            coachStructuredImportError(loaded.file.filename, error);
          }
          await prisma.dealIntakeFile.update({
            where: { id: csvFile.id },
            data: { status: "imported", lastError: null },
          });
          results.push({ kind: "budget", imported: rows.length });
        }
      } else {
        results.push({ kind: "budget", skipped: "No file classified as budget CSV / XLSX." });
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
