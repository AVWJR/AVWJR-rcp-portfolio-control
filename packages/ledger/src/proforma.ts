/**
 * Forward-looking deal / OpCo proforma on the same SpeWaterfall engine.
 *
 * Scenario cash + returns — not historical books and not a budget.
 * Year 1 CFADS is an honest annualization of the selected period (×12) unless overridden.
 * Exit equity proceeds (user-entered) are added to the last year’s distributable pool
 * and run through the same waterfall + Co-GP terms.
 */

import {
  applyWaterfallTemplate,
  hasCoGp,
  runWaterfall,
  type WaterfallConfig,
  type WaterfallRunResult,
} from "./waterfall";

export const PROFORMA_FORMULAS = [
  "Deal proforma uses the currently selected SPE waterfall (and Co-GP shares) — same runWaterfall as live OpCo rollup and LP packs.",
  "Year 1 CFADS default = this period’s CFADS × 12 (annualization of the current month). Optional growth compounds annually (truncating).",
  "Each hold year runs the waterfall with periodMonths = 12. Unreturned capital and unpaid pref roll forward (explicit $0 stays $0 — capital already returned is not re-ROC’d). Pref accrues on remaining unreturned capital.",
  "Exit: user-entered equity proceeds are added to the last year’s distributable pool (not a separate tax/sale waterfall).",
  "Deal LPs = lpCents. Deal GPs = gpCents split RCP vs Co-GP (rcpCents / coGpCents). Co-GP = 0 matches the two-party model.",
  "OpCo proforma aggregates each live SPE’s deal waterfall. OpCo LPs = Σ Deal LP. OpCo GPs (RCP platform) = Σ RCP cents. Co-GP stays at the deal.",
  "Optional OpCo-level pref: if OpCo LP capital and pref rate are entered, RCP cash that year is run through a simple ROC → pref → residual on the platform. Otherwise OpCo GP = Σ RCP (not modeled).",
].join("\n");

export type DealProformaScenario = {
  holdYears: number;
  year1CfadsCents: bigint;
  cfadsGrowthBps: number;
  exitEquityProceedsCents: bigint;
};

export type DealProformaInput = DealProformaScenario & {
  config: WaterfallConfig;
  lpContributedCents: bigint;
  unreturnedCapitalCents: bigint;
  unpaidPrefCents: bigint;
  prefPaidToDateCents: bigint;
  europeanPromoteOpen?: boolean;
  entityCode?: string;
  entityName?: string;
};

export type ProformaYearRow = {
  year: number;
  label: string;
  isExit: boolean;
  distributableCents: bigint;
  operationsCents: bigint;
  exitCents: bigint;
  lpCents: bigint;
  gpCents: bigint;
  rcpCents: bigint;
  coGpCents: bigint;
  unpaidPrefAfterCents: bigint;
  unreturnedCapitalAfterCents: bigint;
};

export type DealProformaResult = {
  level: "deal";
  entityCode: string;
  entityName: string;
  holdYears: number;
  templateId: WaterfallConfig["templateId"];
  hasCoGp: boolean;
  coGpName: string;
  years: ProformaYearRow[];
  totals: {
    poolCents: bigint;
    lpCents: bigint;
    gpCents: bigint;
    rcpCents: bigint;
    coGpCents: bigint;
  };
  notes: string[];
};

export type OpCoPlatformPrefs = {
  /** 0 = not modeled. */
  prefRateBps: number;
  lpContributedCents: bigint;
  lpSplitBps: number;
  gpSplitBps: number;
};

export type OpCoProformaInput = {
  deals: DealProformaInput[];
  platform?: OpCoPlatformPrefs;
};

export type OpCoProformaYear = {
  year: number;
  label: string;
  isExit: boolean;
  poolCents: bigint;
  dealLpCents: bigint;
  dealGpCents: bigint;
  dealRcpCents: bigint;
  dealCoGpCents: bigint;
  /** After optional OpCo platform pref on RCP cash. Equals dealRcpCents when not modeled. */
  opcoLpCents: bigint;
  opcoGpCents: bigint;
};

export type OpCoProformaDeal = DealProformaResult;

export type OpCoProformaResult = {
  level: "opco";
  holdYears: number;
  platformModeled: boolean;
  deals: OpCoProformaDeal[];
  years: OpCoProformaYear[];
  totals: {
    poolCents: bigint;
    dealLpCents: bigint;
    dealGpCents: bigint;
    dealRcpCents: bigint;
    dealCoGpCents: bigint;
    opcoLpCents: bigint;
    opcoGpCents: bigint;
  };
  notes: string[];
};

export function clampHoldYears(value: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.min(15, Math.max(1, Math.round(value)));
}

export function annualizeMonthlyCfads(periodCfadsCents: bigint): bigint {
  const m = periodCfadsCents > 0n ? periodCfadsCents : 0n;
  return m * 12n;
}

export function growCents(base: bigint, growthBps: number, yearsElapsed: number): bigint {
  const bps = Number.isFinite(growthBps) ? Math.max(0, Math.round(growthBps)) : 0;
  let v = base > 0n ? base : 0n;
  const steps = Math.max(0, Math.floor(yearsElapsed));
  for (let i = 0; i < steps; i += 1) {
    v += (v * BigInt(bps)) / 10_000n;
  }
  return v;
}

function prefPaidThisRun(inputUnpaid: bigint, result: WaterfallRunResult): bigint {
  const due = (inputUnpaid > 0n ? inputUnpaid : 0n) + result.prefAccruedThisRunCents;
  const paid = due - result.unpaidPrefAfterCents;
  return paid > 0n ? paid : 0n;
}

export function defaultDealProformaScenario(periodCfadsCents: bigint): DealProformaScenario {
  return {
    holdYears: 5,
    year1CfadsCents: annualizeMonthlyCfads(periodCfadsCents),
    cfadsGrowthBps: 0,
    exitEquityProceedsCents: 0n,
  };
}

export function runDealProforma(input: DealProformaInput): DealProformaResult {
  const holdYears = clampHoldYears(input.holdYears);
  const notes: string[] = [
    "Deal-level proforma (forward-looking). Same waterfall + Co-GP as live rollup / LP packs. Not historical books.",
    "Year 1 CFADS is the scenario input (default = this period × 12). Growth is simple annual on that base. Exit proceeds are user-entered.",
  ];
  if (input.config.notes) notes.push(input.config.notes);

  let unreturned = input.unreturnedCapitalCents > 0n ? input.unreturnedCapitalCents : input.lpContributedCents;
  let unpaidPref = input.unpaidPrefCents > 0n ? input.unpaidPrefCents : 0n;
  let prefPaid = input.prefPaidToDateCents > 0n ? input.prefPaidToDateCents : 0n;

  const years: ProformaYearRow[] = [];
  let totPool = 0n;
  let totLp = 0n;
  let totGp = 0n;
  let totRcp = 0n;
  let totCoGp = 0n;

  for (let y = 1; y <= holdYears; y += 1) {
    const isExit = y === holdYears;
    const operations = growCents(input.year1CfadsCents, input.cfadsGrowthBps, y - 1);
    const exit = isExit && input.exitEquityProceedsCents > 0n ? input.exitEquityProceedsCents : 0n;
    const pool = operations + exit;
    const run = runWaterfall({
      config: input.config,
      distributableCents: pool,
      lpContributedCents: input.lpContributedCents,
      unreturnedCapitalCents: unreturned,
      unpaidPrefCents: unpaidPref,
      prefPaidToDateCents: prefPaid,
      periodMonths: 12,
      europeanPromoteOpen: input.europeanPromoteOpen,
    });
    prefPaid += prefPaidThisRun(unpaidPref, run);
    unreturned = run.unreturnedCapitalAfterCents;
    unpaidPref = run.unpaidPrefAfterCents;
    totPool += pool;
    totLp += run.lpCents;
    totGp += run.gpCents;
    totRcp += run.rcpCents;
    totCoGp += run.coGpCents;
    years.push({
      year: y,
      label: isExit ? `Year ${y} (ops + exit)` : `Year ${y}`,
      isExit,
      distributableCents: pool,
      operationsCents: operations,
      exitCents: exit,
      lpCents: run.lpCents,
      gpCents: run.gpCents,
      rcpCents: run.rcpCents,
      coGpCents: run.coGpCents,
      unpaidPrefAfterCents: unpaidPref,
      unreturnedCapitalAfterCents: unreturned,
    });
    if (y === 1) notes.push(...run.notes.filter((n) => !notes.includes(n)));
  }

  return {
    level: "deal",
    entityCode: input.entityCode ?? "",
    entityName: input.entityName ?? "",
    holdYears,
    templateId: input.config.templateId,
    hasCoGp: hasCoGp(input.config),
    coGpName: input.config.coGpName.trim(),
    years,
    totals: {
      poolCents: totPool,
      lpCents: totLp,
      gpCents: totGp,
      rcpCents: totRcp,
      coGpCents: totCoGp,
    },
    notes,
  };
}

export function opcoPlatformConfig(prefs: OpCoPlatformPrefs): WaterfallConfig {
  const gp = prefs.gpSplitBps > 0 ? prefs.gpSplitBps : 2_000;
  const lp = prefs.lpSplitBps > 0 ? prefs.lpSplitBps : 8_000;
  const base = applyWaterfallTemplate("simple_pref_promote");
  return {
    ...base,
    prefRateBps: prefs.prefRateBps,
    notes: "Optional OpCo platform pref on RCP cash after each SPE waterfall.",
    tiers: [
      { id: "roc", kind: "ROC", label: "OpCo return of capital", hurdleIrrBps: null, lpSplitBps: 10_000, gpSplitBps: 0 },
      {
        id: "pref",
        kind: "PREF",
        label: `OpCo LP pref (${(prefs.prefRateBps / 100).toFixed(2)}%)`,
        hurdleIrrBps: prefs.prefRateBps,
        lpSplitBps: 10_000,
        gpSplitBps: 0,
      },
      { id: "residual", kind: "PROMOTE", label: "OpCo residual", hurdleIrrBps: prefs.prefRateBps, lpSplitBps: lp, gpSplitBps: gp },
    ],
  };
}

export function platformPrefsModeled(prefs?: OpCoPlatformPrefs): boolean {
  if (!prefs) return false;
  return prefs.prefRateBps > 0 && prefs.lpContributedCents > 0n;
}

export function runOpCoProforma(input: OpCoProformaInput): OpCoProformaResult {
  const deals = input.deals.map((d) => runDealProforma(d));
  const holdYears = deals.reduce((m, d) => Math.max(m, d.holdYears), 1);
  const modeled = platformPrefsModeled(input.platform);
  const notes: string[] = [
    "OpCo-level proforma: each live SPE’s deal waterfall (and Co-GP) first, then RCP cash is the OpCo GP (platform) stack.",
    "OpCo LPs here are aggregated Deal LPs (not upstreamed). OpCo GPs are RCP after Co-GP. Co-GP stays at the deal.",
  ];
  if (modeled) {
    notes.push("OpCo-level pref is modeled: RCP cash each year is run through a simple ROC → pref → residual at the platform.");
  } else {
    notes.push("OpCo-level pref is not modeled — OpCo GP (RCP platform) = Σ deal RCP cents.");
  }

  let platUnreturned = modeled && input.platform ? input.platform.lpContributedCents : 0n;
  let platUnpaid = 0n;
  let platPrefPaid = 0n;
  const platConfig = modeled && input.platform ? opcoPlatformConfig(input.platform) : null;

  const years: OpCoProformaYear[] = [];
  let totPool = 0n;
  let totDealLp = 0n;
  let totDealGp = 0n;
  let totDealRcp = 0n;
  let totDealCoGp = 0n;
  let totOpcoLp = 0n;
  let totOpcoGp = 0n;

  for (let y = 1; y <= holdYears; y += 1) {
    let pool = 0n;
    let dealLp = 0n;
    let dealGp = 0n;
    let dealRcp = 0n;
    let dealCoGp = 0n;
    let isExit = false;
    for (const deal of deals) {
      const row = deal.years.find((r) => r.year === y);
      if (!row) continue;
      pool += row.distributableCents;
      dealLp += row.lpCents;
      dealGp += row.gpCents;
      dealRcp += row.rcpCents;
      dealCoGp += row.coGpCents;
      if (row.isExit) isExit = true;
    }

    let opcoLp = 0n;
    let opcoGp = dealRcp;
    if (platConfig && input.platform) {
      const run = runWaterfall({
        config: platConfig,
        distributableCents: dealRcp,
        lpContributedCents: input.platform.lpContributedCents,
        unreturnedCapitalCents: platUnreturned,
        unpaidPrefCents: platUnpaid,
        prefPaidToDateCents: platPrefPaid,
        periodMonths: 12,
      });
      platPrefPaid += prefPaidThisRun(platUnpaid, run);
      platUnreturned = run.unreturnedCapitalAfterCents;
      platUnpaid = run.unpaidPrefAfterCents;
      opcoLp = run.lpCents;
      opcoGp = run.gpCents;
    }

    totPool += pool;
    totDealLp += dealLp;
    totDealGp += dealGp;
    totDealRcp += dealRcp;
    totDealCoGp += dealCoGp;
    totOpcoLp += opcoLp;
    totOpcoGp += opcoGp;

    years.push({
      year: y,
      label: isExit ? `Year ${y} (ops + exit)` : `Year ${y}`,
      isExit,
      poolCents: pool,
      dealLpCents: dealLp,
      dealGpCents: dealGp,
      dealRcpCents: dealRcp,
      dealCoGpCents: dealCoGp,
      opcoLpCents: opcoLp,
      opcoGpCents: opcoGp,
    });
  }

  return {
    level: "opco",
    holdYears,
    platformModeled: modeled,
    deals,
    years,
    totals: {
      poolCents: totPool,
      dealLpCents: totDealLp,
      dealGpCents: totDealGp,
      dealRcpCents: totDealRcp,
      dealCoGpCents: totDealCoGp,
      opcoLpCents: totOpcoLp,
      opcoGpCents: totOpcoGp,
    },
    notes,
  };
}
