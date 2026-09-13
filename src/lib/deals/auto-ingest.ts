import { prisma } from "@/lib/prisma";
import { applyCreateEntity, applyStructuredData } from "./apply";
import { suggestCodeForName } from "./create-spe";
import { getIntake, publicIntake, updateIntake } from "./intake";
import { inferDealIdentity, suggestDealSpeCode } from "./infer";
import { isUntitledDealName, workingTitle } from "./upload-client";

export type AutoIngestReport = {
  inferred: {
    speName: string | null;
    speCode: string | null;
    targetPeriod: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
  };
  created: { entityId: string | null; entityCode: string | null; entityName: string | null };
  results: { kind: string; imported?: number; skipped?: string }[];
  gaps: string[];
  intake: ReturnType<typeof publicIntake> | null;
};

export async function autoIngestIntake(intakeId: string): Promise<AutoIngestReport> {
  const intake = await getIntake(intakeId);
  if (!intake) throw new Error("Intake draft not found. Upload files first.");

  const filenames = intake.files.map((file) => file.filename);
  const inferred = inferDealIdentity(filenames);
  const gaps = [...inferred.notes];

  const speName = inferred.speName ?? (isUntitledDealName(intake.speName) ? null : intake.speName);
  if (!speName) {
    throw new Error("Could not infer an SPE name from the filenames. Add a legal name on Identity, then create the SPE.");
  }

  const existing = await prisma.entity.findMany({ select: { code: true } });
  const speCode =
    intake.speCode && !isUntitledDealName(intake.speCode)
      ? intake.speCode
      : suggestDealSpeCode(speName, existing.map((row) => row.code));

  const uniqueCode = existing.some((row) => row.code === speCode) ? await suggestCodeForName(speName) : speCode;

  await updateIntake(intake.id, {
    speName: workingTitle(speName),
    speCode: uniqueCode,
    // Filename as-of (OM/RR vintage) is not the OpCo close month. Keep the wizard period (default 2026-08).
    targetPeriod: intake.targetPeriod,
    currentStep: 5,
    lastError: null,
  });

  const created = await applyCreateEntity(intake.id);
  if (!created?.entityId) {
    throw new Error("The SPE was not created. Check the name and code, then retry.");
  }

  const t12Files = created.files.filter((file) => file.classification === "t12_pl");
  for (const file of t12Files) {
    gaps.push(
      `${file.filename} is a T12 / P&L workbook — retained in the vault. Full GL mapping is a follow-on (do not invent accounts).`,
    );
  }

  const applied = await applyStructuredData({
    intakeId: intake.id,
    confirmReplace: true,
    importRentRoll: true,
    importBudget: created.files.some((file) => file.classification === "budget_csv"),
    saveLoan: false,
    lenient: true,
  });

  for (const row of applied.results) {
    if (row.skipped) gaps.push(row.skipped);
  }
  const rr = applied.results.find((row) => row.kind === "rent_roll");
  if (rr?.imported) {
    gaps.push(
      `Rent roll wrote ${rr.imported} Unit rows. Open Properties / Dashboard for ${uniqueCode}. GL $0 is expected until T12/P&L is mapped — occupancy comes from the rent roll, not the GL.`,
    );
  } else {
    gaps.unshift(
      `Rent roll wrote 0 units${rr?.skipped ? ` — ${rr.skipped}` : ""}. Occupancy stays empty until the broker RR maps. GL $0 is expected until T12/P&L is mapped.`,
    );
  }

  const latest = applied.intake ?? (await getIntake(intake.id));
  if (latest && !latest.entity?.code) {
    gaps.push("SPE create finished without an entity code — refresh Deals and retry Create SPE.");
  }

  return {
    inferred: {
      speName,
      speCode: uniqueCode,
      targetPeriod: inferred.targetPeriod,
      address: inferred.address,
      city: inferred.city,
      state: inferred.state,
    },
    created: {
      entityId: latest?.entityId ?? created.entityId,
      entityCode: latest?.entity?.code ?? created.entity?.code ?? null,
      entityName: latest?.entity?.name ?? created.entity?.name ?? speName,
    },
    results: applied.results,
    gaps,
    intake: latest ? publicIntake(latest) : null,
  };
}
