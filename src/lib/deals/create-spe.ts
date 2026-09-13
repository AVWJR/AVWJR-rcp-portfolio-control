import { createEntityWithCoa } from "@/lib/entities";
import { prisma } from "@/lib/prisma";
import { isValidSpeCode, normalizeSpeCode, suggestSpeCode } from "./codes";
import { openDealPeriods } from "./periods";
import { DEFAULT_OPCO_CODE, defaultOpCoCode, goalToStrategy, isDealGoal, type DealGoal } from "./types";
import { isUntitledDealName } from "./upload-client";

export class DealValidationError extends Error {
  readonly field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.name = "DealValidationError";
    this.field = field;
  }
}

export type CreateSpeInput = {
  name: string;
  code: string;
  parentOpCoCode?: string;
  unitCount?: number | null;
  strategy?: "VALUE_ADD_GARDEN" | "STABILIZED" | "LIGHT_REHAB" | null;
  goal?: DealGoal | null;
  targetPeriod?: string | null;
};

export async function validateCreateSpe(input: CreateSpeInput) {
  const name = input.name?.trim();
  if (!name || isUntitledDealName(name)) {
    throw new DealValidationError("Enter the SPE legal name (for example Harbor Court Residences LLC).", "speName");
  }

  const code = normalizeSpeCode(input.code);
  if (!isValidSpeCode(code)) {
    throw new DealValidationError(
      "SPE code must look like SPE-XXX (letters and numbers after SPE-). Use the suggested code or adjust it.",
      "speCode",
    );
  }

  const existing = await prisma.entity.findUnique({ where: { code } });
  if (existing) {
    throw new DealValidationError(
      `Code ${code} is already used by ${existing.name}. Pick a different SPE code.`,
      "speCode",
    );
  }

  const parentCode = (input.parentOpCoCode?.trim() || defaultOpCoCode() || DEFAULT_OPCO_CODE).toUpperCase();
  const parent = await prisma.entity.findUnique({ where: { code: parentCode } });
  if (!parent) {
    throw new DealValidationError(
      `Parent OpCo ${parentCode} was not found. Confirm the entity tree is seeded (HoldCo → OpCo).`,
      "parentOpCoCode",
    );
  }
  if (parent.type !== "OPCO") {
    throw new DealValidationError("New deals must sit under an OpCo (usually RCP-OPCO), not HoldCo or another SPE.", "parentOpCoCode");
  }

  if (input.unitCount != null && (!Number.isInteger(input.unitCount) || input.unitCount < 0)) {
    throw new DealValidationError("Unit count must be a whole number (0 or more).", "unitCount");
  }

  const strategy =
    input.strategy ??
    (input.goal && isDealGoal(input.goal) ? goalToStrategy(input.goal) : null);

  return { name, code, parent, unitCount: input.unitCount ?? null, strategy, targetPeriod: input.targetPeriod ?? "2026-08" };
}

export async function createSpeDeal(input: CreateSpeInput) {
  const valid = await validateCreateSpe(input);
  const entity = await createEntityWithCoa({
    code: valid.code,
    name: valid.name,
    type: "SPE",
    parentId: valid.parent.id,
    ownershipBps: 10_000,
    unitCount: valid.unitCount ?? undefined,
    strategy: valid.strategy ?? undefined,
  });
  await openDealPeriods(entity.id, valid.targetPeriod);
  return { entity, parent: valid.parent };
}

export async function suggestCodeForName(name: string) {
  const existing = await prisma.entity.findMany({ select: { code: true } });
  return suggestSpeCode(name, existing.map((row) => row.code));
}

const MONTH_NOISE =
  /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|life|the|at|llc|lp|park|resi)$/;

export function dealNameMatchKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(\d+\)/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !MONTH_NOISE.test(word) && !/^\d+$/.test(word))
    .join("");
}

export async function findReusableSpe(speName: string) {
  const want = dealNameMatchKey(speName);
  if (want.length < 4) return null;
  const spes = await prisma.entity.findMany({
    where: { type: "SPE" },
    select: { id: true, code: true, name: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return spes.find((row) => dealNameMatchKey(row.name) === want) ?? null;
}

export async function listSpeDeals() {
  return prisma.entity.findMany({
    where: { type: "SPE" },
    include: { parent: true, _count: { select: { units: true, loans: true, vaultDocuments: true } } },
    orderBy: { code: "asc" },
  });
}
