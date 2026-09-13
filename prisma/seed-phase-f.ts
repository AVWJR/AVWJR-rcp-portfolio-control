import { dollars } from "@rcp/ledger";
import { DEFAULT_SCHEDULED_JOBS } from "@rcp/documents";
import { MACRS_LIFE_HOOKS } from "@rcp/tax-bridge";
import type { PrismaClient } from "@prisma/client";
import { putStoredFile } from "../src/lib/file-store";

async function vaultText(entityCode: string, filename: string, body: string): Promise<{ storagePath: string; byteSize: number }> {
  const bytes = Buffer.from(body, "utf8");
  const storagePath = await putStoredFile(`${entityCode}/${filename}`, bytes, "text/plain");
  return { storagePath, byteSize: bytes.length };
}

export async function seedPhaseF(prisma: PrismaClient, byCode: Record<string, string>) {
  await prisma.reportJobRun.deleteMany();
  await prisma.reportJob.deleteMany();
  await prisma.dealIntakeFile.deleteMany();
  await prisma.dealIntake.deleteMany();
  await prisma.vaultDocument.deleteMany();
  await prisma.storedBlob.deleteMany();
  await prisma.vendorPayment.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.partnerCapitalActivity.deleteMany();
  await prisma.partner.deleteMany();
  await prisma.taxAdjustment.deleteMany();
  await prisma.macrsLifeHook.deleteMany();

  for (const hook of MACRS_LIFE_HOOKS) {
    await prisma.macrsLifeHook.create({
      data: {
        assetClass: hook.assetClass,
        label: hook.label,
        accountCode: hook.accountCode,
        recoveryYears: hook.recoveryYears,
        convention: hook.convention,
        depreciable: hook.depreciable,
        notes: hook.notes,
      },
    });
  }

  const wbg = byCode["SPE-WBG"];
  const opco = byCode["RCP-OPCO"];
  const hold = byCode["RCP-HOLD"];
  if (!wbg || !opco || !hold) throw new Error("Phase F seed missing entity ids");

  await prisma.taxAdjustment.createMany({
    data: [
      {
        entityId: wbg,
        year: 2026,
        month: 8,
        lineCode: "wbg_prepaid_insurance",
        label: "Prepaid insurance — books vs tax timing",
        basis: "BRIDGE",
        booksCents: 0n,
        taxCents: -dollars(1_200),
        notes: "Sample temporary difference: extra tax deduction (−) in 2026-08 for prepaid 5710. Signed effect on taxable income.",
        source: "seed",
      },
      {
        entityId: wbg,
        year: 2026,
        month: 8,
        lineCode: "wbg_meals_addback",
        label: "Nondeductible meals / entertainment addback",
        basis: "BRIDGE",
        booksCents: 0n,
        taxCents: dollars(350),
        notes: "Sample permanent addback (+). Seeded for SPE-WBG CPA worksheet demo.",
        source: "seed",
      },
      {
        entityId: opco,
        year: 2026,
        month: 8,
        lineCode: "opco_meals_addback",
        label: "Nondeductible meals / entertainment addback",
        basis: "BRIDGE",
        booksCents: 0n,
        taxCents: dollars(400),
        notes: "Sample permanent addback (+) on OpCo G&A. Does not file.",
        source: "seed",
      },
      {
        entityId: opco,
        year: 2026,
        month: 8,
        lineCode: "opco_fee_character",
        label: "AM fee income character (ordinary) — hook",
        basis: "TAX",
        booksCents: 0n,
        taxCents: 0n,
        notes: "7010 is ordinary fee income on the books. No amount change; CPA character hook only.",
        source: "seed",
      },
    ],
  });

  const wbgMember = await prisma.partner.create({
    data: {
      entityId: wbg,
      code: "P-OPCO",
      name: "RCP Operating Company LLC",
      role: "MEMBER",
      ownershipBps: 10_000,
      tinLast4: "8821",
      notes: "100% SPE member. Seed SPEs stay wholly owned.",
    },
  });
  const opcoMember = await prisma.partner.create({
    data: {
      entityId: opco,
      code: "P-HOLD",
      name: "Roche Capital Partners HoldCo",
      role: "MEMBER",
      ownershipBps: 10_000,
      tinLast4: "4402",
      notes: "100% OpCo member.",
    },
  });

  // Opening 3010 / period NI are applied live in src/lib/capital.ts; seed rows
  // store the August identity so exports have a persisted snapshot.
  await prisma.partnerCapitalActivity.createMany({
    data: [
      {
        partnerId: wbgMember.id,
        year: 2026,
        month: 8,
        beginningCents: dollars(9_002_000),
        contributionsCents: 0n,
        distributionsCents: 0n,
        bookNiAllocCents: dollars(-30_500),
        endingCents: dollars(8_971_500),
        notes: "Identity: 9,002,000 + 0 − 0 + (−30,500) = 8,971,500. Live builder recomputes from GL.",
      },
      {
        partnerId: opcoMember.id,
        year: 2026,
        month: 8,
        beginningCents: dollars(120_000),
        contributionsCents: 0n,
        distributionsCents: 0n,
        bookNiAllocCents: dollars(-16_410),
        endingCents: dollars(103_590),
        notes: "OpCo NI = 7010 10,090 − opex 26,500 = (16,410).",
      },
    ],
  });

  const greenway = await prisma.vendor.create({
    data: {
      code: "V-GREEN",
      name: "Greenway Landscape LLC",
      form1099: "NEC",
      tinLast4: "3317",
      addressLine: "410 Willow Park Dr",
      city: "Richmond",
      state: "VA",
      zip: "23225",
      notes: "Contract services. 1099-NEC hook.",
    },
  });
  const watts = await prisma.vendor.create({
    data: {
      code: "V-WATTS",
      name: "Watts Electric Co",
      form1099: "NEC",
      tinLast4: "7742",
      city: "Norfolk",
      state: "VA",
      notes: "R&M electrician. 1099-NEC hook.",
    },
  });
  const legal = await prisma.vendor.create({
    data: {
      code: "V-LEGAL",
      name: "Harbor & Pike LLP",
      form1099: "NEC",
      tinLast4: "1190",
      city: "Richmond",
      state: "VA",
      notes: "Legal / admin. 1099-NEC hook.",
    },
  });
  await prisma.vendor.create({
    data: {
      code: "V-INS",
      name: "Mid-Atlantic Insurance Agency",
      form1099: "NONE",
      tinLast4: "5508",
      notes: "Corporate insurance broker — typically not 1099 reportable.",
    },
  });

  await prisma.vendorPayment.createMany({
    data: [
      {
        vendorId: greenway.id,
        entityId: wbg,
        year: 2026,
        month: 8,
        amountCents: dollars(6_400),
        accountCode: "5410",
        memo: "August landscape contract (overlay on 5410, not a full AP invoice)",
        reportable: true,
        source: "seed",
      },
      {
        vendorId: watts.id,
        entityId: wbg,
        year: 2026,
        month: 8,
        amountCents: dollars(3_250),
        accountCode: "5210",
        memo: "Unit turn electrical (overlay on 5210)",
        reportable: true,
        source: "seed",
      },
      {
        vendorId: legal.id,
        entityId: wbg,
        year: 2026,
        month: 8,
        amountCents: dollars(1_800),
        accountCode: "5610",
        memo: "Lease / vendor contract review",
        reportable: true,
        source: "seed",
      },
    ],
  });

  const lease = await vaultText(
    "SPE-WBG",
    "wbg-form-lease-abstract.txt",
    "Willow Bend Gardens — form lease abstract (demo).\nNot a live PMS attachment.\n",
  );
  const loan = await vaultText(
    "SPE-WBG",
    "wbg-first-mortgage-note.txt",
    "Willow Bend Gardens — first mortgage note abstract (demo).\nSee /debt for the loan file. Not a bank feed.\n",
  );
  const k1 = await vaultText(
    "SPE-WBG",
    "wbg-k1-placeholder.txt",
    "K-1 packet placeholder. Use /tax/k1 for the CPA capital export. Not a filed K-1.\n",
  );
  const draw = await vaultText(
    "SPE-WBG",
    "wbg-capex-draw-memo.txt",
    "Value-add interior draw memo (demo). CIP stays on 1460 until placed in service.\n",
  );
  const ins = await vaultText(
    "SPE-WBG",
    "wbg-insurance-binder.txt",
    "Property insurance binder placeholder. Premiums are book 5710.\n",
  );
  const opcoK1 = await vaultText(
    "RCP-OPCO",
    "opco-k1-placeholder.txt",
    "OpCo K-1 packet placeholder. Capital rollforward at /tax/k1. Not a filed K-1.\n",
  );

  await prisma.vaultDocument.createMany({
    data: [
      { entityId: wbg, kind: "lease", title: "WBG form lease abstract", filename: "wbg-form-lease-abstract.txt", mimeType: "text/plain", ...lease, notes: "Seed" },
      { entityId: wbg, kind: "loan", title: "WBG first mortgage note", filename: "wbg-first-mortgage-note.txt", mimeType: "text/plain", ...loan, notes: "Seed" },
      { entityId: wbg, kind: "k1", title: "WBG K-1 packet placeholder", filename: "wbg-k1-placeholder.txt", mimeType: "text/plain", ...k1, notes: "Not a filed K-1" },
      { entityId: wbg, kind: "draw", title: "WBG CapEx draw memo", filename: "wbg-capex-draw-memo.txt", mimeType: "text/plain", ...draw, notes: "Seed" },
      { entityId: wbg, kind: "insurance", title: "WBG insurance binder", filename: "wbg-insurance-binder.txt", mimeType: "text/plain", ...ins, notes: "Seed" },
      { entityId: opco, kind: "k1", title: "OpCo K-1 packet placeholder", filename: "opco-k1-placeholder.txt", mimeType: "text/plain", ...opcoK1, notes: "Not a filed K-1" },
    ],
  });

  for (const job of DEFAULT_SCHEDULED_JOBS) {
    await prisma.reportJob.create({
      data: {
        code: job.code,
        packId: job.packId,
        title: job.title,
        cadence: job.cadence,
        entityCode: job.entityCode,
        periodLabel: job.periodLabel,
        enabled: true,
        lastStatus: "IDLE",
        notes: job.notes,
        entityId: byCode[job.entityCode] ?? null,
      },
    });
  }
}
