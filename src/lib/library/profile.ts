import { dollarsToCents, percentToRateBps } from "@/lib/deals/money";
import { rememberMetro, addPickItem, PICK_PROPERTY_TYPE, PICK_STATE } from "@/lib/library/pick-lists";
import { prisma } from "@/lib/prisma";

function optionalText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function optionalInt(value: unknown, label: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n)) throw new Error(`${label} must be a whole number.`);
  return n;
}

function optionalCents(value: unknown): bigint | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return dollarsToCents(value as string | number);
}

function optionalPercentBps(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return percentToRateBps(value as string | number);
}

export async function updateDealLibrary(code: string, body: Record<string, unknown>) {
  const entity = await prisma.entity.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!entity || entity.type !== "SPE") throw new Error(`No property SPE found for ${code}.`);

  const state = optionalText(body.state);
  const metro = optionalText(body.metro);
  const propertyType = optionalText(body.propertyType);
  if (state) await addPickItem(PICK_STATE, state);
  if (metro) await rememberMetro(metro);
  if (propertyType) await addPickItem(PICK_PROPERTY_TYPE, propertyType);

  const vintageYear = optionalInt(body.vintageYear, "Vintage");
  if (vintageYear != null && (vintageYear < 1800 || vintageYear > 2100)) {
    throw new Error("Vintage must be a year, or blank.");
  }
  const holdPeriodYears = optionalInt(body.holdPeriodYears, "Hold period");
  if (holdPeriodYears != null && (holdPeriodYears < 0 || holdPeriodYears > 40)) {
    throw new Error("Hold period must be between 0 and 40 years, or blank.");
  }
  const unitCountOverride = optionalInt(body.unitCountOverride, "Unit count");
  if (unitCountOverride != null && unitCountOverride < 0) throw new Error("Unit count cannot be negative.");

  const data = {
    ...(state !== undefined ? { state: state ? state.toUpperCase() : null } : {}),
    ...(metro !== undefined ? { metro } : {}),
    ...(propertyType !== undefined ? { propertyType } : {}),
    ...(optionalText(body.streetAddress) !== undefined ? { streetAddress: optionalText(body.streetAddress) } : {}),
    ...(optionalText(body.city) !== undefined ? { city: optionalText(body.city) } : {}),
    ...(optionalText(body.msa) !== undefined ? { msa: optionalText(body.msa) } : {}),
    ...(optionalText(body.submarket) !== undefined ? { submarket: optionalText(body.submarket) } : {}),
    ...(optionalText(body.assetClass) !== undefined ? { assetClass: optionalText(body.assetClass) } : {}),
    ...(optionalText(body.businessPlan) !== undefined ? { businessPlan: optionalText(body.businessPlan) } : {}),
    ...(optionalText(body.otherLpFeeNote) !== undefined ? { otherLpFeeNote: optionalText(body.otherLpFeeNote) } : {}),
    ...(vintageYear !== undefined ? { vintageYear } : {}),
    ...(holdPeriodYears !== undefined ? { holdPeriodYears } : {}),
    ...(unitCountOverride !== undefined ? { unitCountOverride } : {}),
    ...(optionalCents(body.purchasePriceUsd) !== undefined ? { purchasePriceCents: optionalCents(body.purchasePriceUsd) } : {}),
    ...(optionalCents(body.appraisedValueUsd) !== undefined ? { appraisedValueCents: optionalCents(body.appraisedValueUsd) } : {}),
    ...(optionalCents(body.renovationBudgetUsd) !== undefined
      ? { renovationBudgetCents: optionalCents(body.renovationBudgetUsd) }
      : {}),
    ...(optionalCents(body.otherLpFeeUsd) !== undefined ? { otherLpFeeCents: optionalCents(body.otherLpFeeUsd) } : {}),
    ...(optionalPercentBps(body.amFeePercent) !== undefined ? { amFeeBps: optionalPercentBps(body.amFeePercent) } : {}),
  };

  return prisma.entity.update({ where: { id: entity.id }, data });
}

export async function updateOpcoGaBudget(body: Record<string, unknown>) {
  const opco = await prisma.entity.findFirst({ where: { type: "OPCO" }, orderBy: { code: "asc" } });
  if (!opco) throw new Error("No OpCo is on file.");
  const cents = optionalCents(body.gaBudgetUsd);
  if (cents === undefined) throw new Error("Enter an OpCo G&A budget, or leave it blank.");
  return prisma.entity.update({ where: { id: opco.id }, data: { gaBudgetCents: cents } });
}

export async function loadOpcoGaBudgetCents(): Promise<bigint | null> {
  const opco = await prisma.entity.findFirst({
    where: { type: "OPCO" },
    orderBy: { code: "asc" },
    select: { gaBudgetCents: true },
  });
  return opco?.gaBudgetCents ?? null;
}
