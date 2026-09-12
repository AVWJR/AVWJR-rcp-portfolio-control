import type { PrismaClient } from "@prisma/client";
import {
  currentPortionRollAmount,
  currentPortionRollLines,
  placeInServiceLines,
  splitCurrentLt,
} from "@rcp/debt";
import { CLOSE_CHECKLIST, dollars, type JournalDraftLine } from "@rcp/ledger";

type PostFn = (
  entityId: string,
  periodId: string,
  date: Date,
  memo: string,
  lines: JournalDraftLine[],
) => Promise<unknown>;

function ny(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, 16, 0, 0));
}

export const SEED_LOANS = [
  {
    speCode: "SPE-WBG",
    name: "First mortgage",
    lenderName: "First National Bank of the Carolinas",
    originalPrincipalCents: dollars(17_000_000),
    interestRateBps: 568,
    paymentCents: dollars(100_500),
    originationDate: ny(2024, 7, 1),
    maturityDate: ny(2031, 7, 1),
    reserveRequirementCents: dollars(6_600),
    dscrThresholdBps: 12_500,
    debtYieldThresholdBps: 800,
    augInterestCents: dollars(80_500),
    augPrincipalCents: dollars(20_000),
    notes: "Matches opening 2110+2210 $17.0m and August book interest/principal. Forward schedule uses 5.68%.",
  },
  {
    speCode: "SPE-CVC",
    name: "First mortgage",
    lenderName: "Nationwide Life Insurance Company",
    originalPrincipalCents: dollars(13_800_000),
    interestRateBps: 567,
    paymentCents: dollars(81_700),
    originationDate: ny(2023, 11, 1),
    maturityDate: ny(2030, 11, 1),
    reserveRequirementCents: dollars(4_800),
    dscrThresholdBps: 12_500,
    debtYieldThresholdBps: 850,
    augInterestCents: dollars(65_200),
    augPrincipalCents: dollars(16_500),
    notes: "Stabilized community. Opening UPB $13.8m.",
  },
  {
    speCode: "SPE-HCR",
    name: "First mortgage",
    lenderName: "Regional Community Bank",
    originalPrincipalCents: dollars(4_800_000),
    interestRateBps: 566,
    paymentCents: dollars(28_650),
    originationDate: ny(2025, 3, 1),
    maturityDate: ny(2030, 3, 1),
    reserveRequirementCents: dollars(2_100),
    dscrThresholdBps: 12_000,
    debtYieldThresholdBps: 750,
    augInterestCents: dollars(22_650),
    augPrincipalCents: dollars(6_000),
    notes: "Light-rehab five-year term. Opening UPB $4.8m.",
  },
] as const;

async function periodId(prisma: PrismaClient, entityId: string, year: number, month: number) {
  const row = await prisma.period.findUnique({
    where: { entityId_year_month: { entityId, year, month } },
  });
  if (!row) throw new Error(`Missing period ${year}-${month} for ${entityId}`);
  return row;
}

export async function seedLoansAndRolls(
  prisma: PrismaClient,
  byCode: Record<string, string>,
  post: PostFn,
) {
  for (const spec of SEED_LOANS) {
    const entityId = byCode[spec.speCode];
    const aug = await periodId(prisma, entityId, 2026, 8);
    const endingUpb = spec.originalPrincipalCents - spec.augPrincipalCents;
    const split = splitCurrentLt({
      upbCents: endingUpb,
      annualRateBps: spec.interestRateBps,
      paymentCents: spec.paymentCents,
      startYear: 2026,
      startMonth: 9,
    });
    const openingCurrent =
      spec.speCode === "SPE-WBG" ? dollars(245_000) : spec.speCode === "SPE-CVC" ? dollars(198_000) : dollars(72_000);
    const openingLt =
      spec.speCode === "SPE-WBG"
        ? dollars(16_755_000)
        : spec.speCode === "SPE-CVC"
          ? dollars(13_602_000)
          : dollars(4_728_000);
    const glCurrent = openingCurrent - spec.augPrincipalCents;
    const roll = currentPortionRollAmount({
      glCurrentCents: glCurrent,
      glLtCents: openingLt,
      targetCurrentCents: split.currentPortionCents,
    });

    let journalId: string | undefined;
    if (roll > 0n) {
      const journal = (await post(
        entityId,
        aug.id,
        ny(2026, 8, 31),
        "Reclass current portion of long-term mortgage",
        currentPortionRollLines(roll),
      )) as { id: string };
      journalId = journal.id;
    }

    const currentAfter = glCurrent + roll;
    const ltAfter = openingLt - roll;
    const loan = await prisma.loan.create({
      data: {
        entityId,
        name: spec.name,
        lenderName: spec.lenderName,
        originalPrincipalCents: spec.originalPrincipalCents,
        currentUpbCents: endingUpb,
        interestRateBps: spec.interestRateBps,
        paymentCents: spec.paymentCents,
        originationDate: spec.originationDate,
        maturityDate: spec.maturityDate,
        reserveRequirementCents: spec.reserveRequirementCents,
        dscrThresholdBps: spec.dscrThresholdBps,
        debtYieldThresholdBps: spec.debtYieldThresholdBps,
        notes: spec.notes,
      },
    });
    await prisma.loanPayment.create({
      data: {
        loanId: loan.id,
        year: 2026,
        month: 8,
        dueDate: ny(2026, 8, 31),
        interestCents: spec.augInterestCents,
        principalCents: spec.augPrincipalCents,
        reserveCents: 0n,
        endingUpbCents: endingUpb,
        currentPortionCents: currentAfter,
        longTermPortionCents: ltAfter,
        posted: true,
        journalId,
        source: "seed",
      },
    });
  }
}

export async function seedCapexProjects(
  prisma: PrismaClient,
  byCode: Record<string, string>,
  post: PostFn,
) {
  const wbg = byCode["SPE-WBG"];
  const hcr = byCode["SPE-HCR"];
  const aug = await periodId(prisma, wbg, 2026, 8);

  const interiors = await prisma.capexProject.create({
    data: {
      entityId: wbg,
      name: "Building A unit interiors (value-add)",
      classification: "CAPEX",
      status: "OPEN",
      budgetCents: dollars(180_000),
      fixedAssetAccountCode: "1430",
      notes: "Value-add interiors. August spend in 1460 CIP; $12k placed in service to 1430. Monthly dep (6210/1490) unchanged.",
    },
  });

  const spendLines = [
    { accountCode: "1460", debit: dollars(45_000), credit: 0n, memo: "Capitalize to CIP" },
    { accountCode: "1010", debit: 0n, credit: dollars(30_000), memo: "CIP cash" },
    { accountCode: "2010", debit: 0n, credit: dollars(15_000), memo: "CIP payable" },
  ];
  const spendJournal = (await post(
    wbg,
    aug.id,
    ny(2026, 8, 31),
    "CIP — Building A unit interiors",
    spendLines,
  )) as { id: string };
  await prisma.capexCost.create({
    data: {
      projectId: interiors.id,
      date: ny(2026, 8, 31),
      amountCents: dollars(45_000),
      kind: "CIP_SPEND",
      accountCode: "1460",
      memo: "CIP — Building A unit interiors",
      journalId: spendJournal.id,
    },
  });

  const pisLines = placeInServiceLines({
    amountCents: dollars(12_000),
    fixedAssetAccountCode: "1430",
  });
  const pisJournal = (await post(
    wbg,
    aug.id,
    ny(2026, 8, 31),
    "Place in service — Building A interiors (partial)",
    pisLines,
  )) as { id: string };
  await prisma.capexCost.create({
    data: {
      projectId: interiors.id,
      date: ny(2026, 8, 31),
      amountCents: dollars(12_000),
      kind: "PLACE_IN_SERVICE",
      accountCode: "1430",
      memo: "Place in service — Building A interiors (partial)",
      journalId: pisJournal.id,
    },
  });
  await prisma.capexProject.update({
    where: { id: interiors.id },
    data: {
      spentCents: dollars(45_000),
      cipCents: dollars(33_000),
      placedInServiceCents: dollars(12_000),
      status: "CIP",
    },
  });

  await prisma.capexProject.create({
    data: {
      entityId: wbg,
      name: "Make-ready / unit turns",
      classification: "REPAIRS_MAINTENANCE",
      status: "CLOSED",
      budgetCents: dollars(28_500),
      spentCents: dollars(28_500),
      notes: "Tracked against August 5210 R&M. Stays in NOI — not CIP.",
    },
  });

  await prisma.capexProject.create({
    data: {
      entityId: hcr,
      name: "Light-rehab interiors",
      classification: "CAPEX",
      status: "PLACED_IN_SERVICE",
      budgetCents: dollars(40_000),
      spentCents: dollars(40_000),
      placedInServiceCents: dollars(40_000),
      placedInServiceAt: ny(2026, 8, 31),
      fixedAssetAccountCode: "1430",
      notes: "Seed posted directly to 1430 (legacy path). New value-add work uses CIP on WBG.",
    },
  });
}

async function writeChecklist(
  prisma: PrismaClient,
  periodId: string,
  status: "DONE" | "NA",
) {
  await prisma.closeChecklistItem.createMany({
    data: CLOSE_CHECKLIST.map((item) => ({
      periodId,
      code: item.code,
      label: item.label,
      sortOrder: item.sortOrder,
      status,
      reviewedAt: ny(2026, 8, 31),
    })),
  });
}

export async function seedCloseDemo(prisma: PrismaClient, byCode: Record<string, string>) {
  const entities = await prisma.entity.findMany({ include: { periods: true } });
  for (const entity of entities) {
    for (const period of entity.periods) {
      const exists = await prisma.closeChecklistItem.count({ where: { periodId: period.id } });
      if (exists === 0) {
        await prisma.closeChecklistItem.createMany({
          data: CLOSE_CHECKLIST.map((item) => ({
            periodId: period.id,
            code: item.code,
            label: item.label,
            sortOrder: item.sortOrder,
            status: "PENDING",
          })),
        });
      }
    }
  }

  const wbgJul = await periodId(prisma, byCode["SPE-WBG"], 2026, 7);
  await prisma.closeChecklistItem.deleteMany({ where: { periodId: wbgJul.id } });
  await writeChecklist(prisma, wbgJul.id, "DONE");
  await prisma.period.update({
    where: { id: wbgJul.id },
    data: { status: "SOFT_CLOSED", softClosedAt: ny(2026, 8, 5) },
  });
  await prisma.periodCloseEvent.create({
    data: { periodId: wbgJul.id, action: "SOFT_CLOSE" },
  });
  await prisma.period.update({
    where: { id: wbgJul.id },
    data: { status: "CLOSED", lockedAt: ny(2026, 8, 6) },
  });
  await prisma.periodCloseEvent.create({
    data: { periodId: wbgJul.id, action: "HARD_LOCK" },
  });

  const cvcJul = await periodId(prisma, byCode["SPE-CVC"], 2026, 7);
  await prisma.closeChecklistItem.deleteMany({ where: { periodId: cvcJul.id } });
  await writeChecklist(prisma, cvcJul.id, "NA");
  await prisma.period.update({
    where: { id: cvcJul.id },
    data: { status: "SOFT_CLOSED", softClosedAt: ny(2026, 8, 8) },
  });
  await prisma.periodCloseEvent.create({
    data: { periodId: cvcJul.id, action: "SOFT_CLOSE" },
  });
}
