import type { MacrsLifeHook, PpeBases } from "./types";

/**
 * IRS recovery-period hooks for CPA worksheets — not a full MACRS engine
 * (no mid-quarter test, bonus, §179, or placed-in-service month tables).
 */
export const MACRS_LIFE_HOOKS: MacrsLifeHook[] = [
  {
    assetClass: "land",
    label: "Land (non-depreciable)",
    accountCode: "1410",
    recoveryYears: null,
    convention: "NA",
    depreciable: false,
    notes: "Land is not depreciable for books or tax.",
  },
  {
    assetClass: "building_residential",
    label: "Residential rental real property",
    accountCode: "1420",
    recoveryYears: 27.5,
    convention: "MM",
    depreciable: true,
    notes: "MACRS 27.5-year, mid-month convention. Hook uses straight-line monthly = basis / 330.",
  },
  {
    assetClass: "building_improvements",
    label: "Building improvements (residential)",
    accountCode: "1430",
    recoveryYears: 27.5,
    convention: "MM",
    depreciable: true,
    notes: "Same 27.5-year residential life unless CPA reclassifies QIP / 15-year.",
  },
  {
    assetClass: "site_improvements",
    label: "Land / site improvements",
    accountCode: "1440",
    recoveryYears: 15,
    convention: "HY",
    depreciable: true,
    notes: "MACRS 15-year, half-year convention. Hook uses straight-line monthly = basis / 180.",
  },
  {
    assetClass: "personal_property",
    label: "Furniture, fixtures & equipment",
    accountCode: "1450",
    recoveryYears: 5,
    convention: "HY",
    depreciable: true,
    notes: "MACRS 5-year personal property. Hook uses straight-line monthly = basis / 60. No bonus.",
  },
  {
    assetClass: "cip",
    label: "Construction in progress",
    accountCode: "1460",
    recoveryYears: null,
    convention: "NA",
    depreciable: false,
    notes: "CIP is not depreciable until placed in service (books or tax).",
  },
];

export function macrsHookByAccount(code: string): MacrsLifeHook | undefined {
  return MACRS_LIFE_HOOKS.find((h) => h.accountCode === code);
}

/** Integer-cent monthly SL from whole-dollar-years or 27.5. Remainder stays in basis. */
export function monthlyStraightLineCents(basisCents: bigint, recoveryYears: number): bigint {
  if (basisCents <= 0n) return 0n;
  if (!(recoveryYears > 0)) {
    throw new Error(`MACRS recovery years must be positive, got ${recoveryYears}`);
  }
  const months = BigInt(Math.round(recoveryYears * 12));
  if (months <= 0n) throw new Error("MACRS month count must be positive");
  return basisCents / months;
}

export type MacrsColumn = {
  assetClass: string;
  label: string;
  accountCode: string | null;
  basisCents: bigint;
  recoveryYears: number | null;
  convention: MacrsLifeHook["convention"];
  booksDepCents: bigint | null;
  taxDepCents: bigint;
  notes: string;
};

export function estimateMonthlyMacrs(ppe: PpeBases): {
  columns: MacrsColumn[];
  taxDepreciation: bigint;
} {
  const basisByClass: Record<string, bigint> = {
    land: ppe.land,
    building_residential: ppe.building,
    building_improvements: ppe.improvements,
    site_improvements: ppe.site,
    personal_property: ppe.ffe,
    cip: ppe.cip,
  };
  const columns: MacrsColumn[] = MACRS_LIFE_HOOKS.map((hook) => {
    const basis = basisByClass[hook.assetClass] ?? 0n;
    const taxDep =
      hook.depreciable && hook.recoveryYears ? monthlyStraightLineCents(basis, hook.recoveryYears) : 0n;
    return {
      assetClass: hook.assetClass,
      label: hook.label,
      accountCode: hook.accountCode,
      basisCents: basis,
      recoveryYears: hook.recoveryYears,
      convention: hook.convention,
      booksDepCents: null,
      taxDepCents: taxDep,
      notes: hook.notes,
    };
  });
  const taxDepreciation = columns.reduce((acc, c) => acc + c.taxDepCents, 0n);
  return { columns, taxDepreciation };
}
