/**
 * Deal-level LP / GP distribution waterfall (LedgerForge).
 *
 * This is a **distribution** engine on distributable cash / equity proceeds the
 * app already defines (CFADS, cash-if-distributed). It does not invent AR,
 * delinquency, or a GAAP minority-interest consolidation.
 *
 * Integer USD cents. Truncating division; the last split receives the remainder
 * so LP + GP always equals the dollars taken on that step.
 *
 * Formulas (see WATERFALL_FORMULAS):
 * - ROC: pay unreturned capital pari passu (LP + GP co-invest).
 * - Pref (none): capital × prefRate × months / (10_000 × 12).
 * - Pref (annual): capital × ((1 + r)^years − 1) − pref already paid, years = floor(months/12) (min 1 when months ≥ 12).
 * - Catch-up (100%): GP receives min(remaining, LP_pref_paid × gpSplit / lpSplit) until GP has its promote share of profits above ROC.
 * - Residual / promote: remaining × (lpSplit : gpSplit). LP-class residual is then pari passu with GP co-invest.
 * - European: while the OpCo/portfolio capital+pref gate is closed, CATCH_UP and promote residual are 100% LP-class (no GP promote).
 * - Look-through 100%: entire pool is RCP/GP (legacy demo; no LP).
 * - Optional Co-GP: GP-side promote vs co-invest split RCP vs third-party Co-GP (0 = two-party).
 */

export const BPS_DENOMINATOR = 10_000;

export const WATERFALL_TEMPLATE_IDS = [
  "look_through_100",
  "simple_pref_promote",
  "institutional_catchup",
  "multi_hurdle_irr",
  "american_deal",
  "european_fund",
] as const;

export type WaterfallTemplateId = (typeof WATERFALL_TEMPLATE_IDS)[number];

export const WATERFALL_COMPOUNDING = ["NONE", "ANNUAL"] as const;
export type WaterfallCompounding = (typeof WATERFALL_COMPOUNDING)[number];

export const PROMOTE_BASES = ["DISTRIBUTABLE_CASH", "EQUITY_PROCEEDS"] as const;
export type PromoteBase = (typeof PROMOTE_BASES)[number];

export const TIER_KINDS = ["ROC", "PREF", "CATCH_UP", "PROMOTE"] as const;
export type WaterfallTierKind = (typeof TIER_KINDS)[number];

export type WaterfallTier = {
  id: string;
  kind: WaterfallTierKind;
  label: string;
  /** Dollar-pref proxy of an IRR hurdle (800 = 8.00%). Null on ROC / catch-up. */
  hurdleIrrBps: number | null;
  lpSplitBps: number;
  gpSplitBps: number;
};

export type WaterfallConfig = {
  templateId: WaterfallTemplateId;
  prefRateBps: number;
  compounding: WaterfallCompounding;
  catchUpEnabled: boolean;
  /** Share of each catch-up dollar to GP (10000 = 100% GP catch-up). */
  catchUpBps: number;
  /** GP co-invest as bps of the capital stack (500 = 5%). */
  gpCoInvestBps: number;
  /**
   * Optional third-party Co-GP name at this SPE. Empty = no named Co-GP
   * (share still applies if coGpOfPromoteBps / coGpCoInvestShareBps > 0).
   */
  coGpName: string;
  /** Co-GP share of GP-side promote / catch-up / residual promote (0 = all RCP). */
  coGpOfPromoteBps: number;
  /** Co-GP share of GP co-invest (ROC / pref / pari passu) (0 = all RCP). */
  coGpCoInvestShareBps: number;
  promoteBase: PromoteBase;
  lookbackClawback: boolean;
  notes: string;
  tiers: WaterfallTier[];
};

export type WaterfallCapitalState = {
  /** LP contributed equity (user-entered; $0 means residual-only — ROC/pref have no base). */
  lpContributedCents: bigint;
  /** Unreturned LP-class + GP co-invest capital. Defaults to contributed stack. */
  unreturnedCapitalCents: bigint;
  /** Pref already accrued and unpaid *before* this period's accrual. */
  unpaidPrefCents: bigint;
  /** Pref already paid in prior distributions (annual compounding). */
  prefPaidToDateCents: bigint;
  /** Months this run covers (1 = monthly close; 12 = one-year illustration). */
  periodMonths: number;
};

export type WaterfallRunInput = WaterfallCapitalState & {
  config: WaterfallConfig;
  distributableCents: bigint;
  /**
   * European / whole-fund: when false, this SPE pays no GP promote
   * (catch-up + residual promote) until portfolio capital+pref are satisfied.
   * Ignored for non-European templates.
   */
  europeanPromoteOpen?: boolean;
};

export type WaterfallStep = {
  tierId: string;
  kind: WaterfallTierKind;
  label: string;
  takenCents: bigint;
  lpCents: bigint;
  /** Deal GP side (RCP + Co-GP). */
  gpCents: bigint;
  /** RCP’s share of this step’s GP-side dollars. */
  rcpCents: bigint;
  /** Third-party Co-GP share of this step’s GP-side dollars. */
  coGpCents: bigint;
  note: string;
};

export type WaterfallRunResult = {
  templateId: WaterfallTemplateId;
  lookThrough: boolean;
  distributableCents: bigint;
  lpCents: bigint;
  /** Deal GP side (RCP + optional Co-GP). lpCents + gpCents = allocated. */
  gpCents: bigint;
  /** RCP platform share of the GP side. Equals gpCents when Co-GP share is 0. */
  rcpCents: bigint;
  /** Third-party Co-GP share of the GP side. 0 when no Co-GP. rcpCents + coGpCents = gpCents. */
  coGpCents: bigint;
  /** LP + GP; equals distributable (negative pools are treated as $0). */
  allocatedCents: bigint;
  unreturnedCapitalAfterCents: bigint;
  unpaidPrefAfterCents: bigint;
  prefAccruedThisRunCents: bigint;
  europeanPromoteBlocked: boolean;
  clawbackFlagged: boolean;
  steps: WaterfallStep[];
  notes: string[];
};

export const WATERFALL_FORMULAS = [
  "Pool = max(0, distributable cents). Negative CFADS does not create a distribution.",
  "Look-through 100%: GP/RCP = pool; LP = 0. Default until a template is saved.",
  "ROC: take min(pool, unreturned capital); split pari passu by LP vs GP co-invest capital.",
  "Pref accrual (NONE): (capital × prefRateBps × months) / (10_000 × 12), truncating.",
  "Pref accrual (ANNUAL): capital × ((1 + prefRate)^years − 1) − pref already paid; years = max(1, floor(months/12)) when months ≥ 12, else 1 if months > 0.",
  "Pref pay: take min(pool, unpaid pref including this run's accrual); pari passu LP / GP co-invest.",
  "Catch-up 100%: GP_target = LP_pref_paid × gpSplit / lpSplit; take min(pool, remaining target) × catchUpBps to GP.",
  "Promote / residual: remaining × (lpSplitBps : gpSplitBps). LP-class residual is pari passu with GP co-invest; GP promote is extra to GP/RCP.",
  "Multi-hurdle: after ROC, successive promote bands sized as Δhurdle × capital (8% then +4% then +3% on $ capital) then leftover at the last split.",
  "American: deal-level hurdles (same math as simple pref+promote unless edited) with clawback/lookback stored for later true-up — this run does not reverse prior promote.",
  "European: if portfolio capital+pref unpaid (or this SPE has $0 capital entered), residual promote and catch-up are 100% LP-class.",
  "RCP OpCo entitlement = RCP cents (GP-side co-invest + promote after optional Co-GP split). LP cents stay at the SPE / LP — they are not look-through to OpCo.",
  "Co-GP (optional, deal/SPE): GP-side promote/catch-up/residual × coGpOfPromoteBps to Co-GP, remainder to RCP. GP co-invest (ROC/pref/pari passu) × coGpCoInvestShareBps to Co-GP. Default 0 / blank name = prior two-party LP vs single GP/RCP.",
  "Proforma: same engine on a forward hold (annualized period CFADS × years, optional growth, user-entered exit proceeds on the last year). Not a budget and not historical books.",
].join("\n");

export function isWaterfallTemplateId(value: string): value is WaterfallTemplateId {
  return (WATERFALL_TEMPLATE_IDS as readonly string[]).includes(value);
}

export function isLookThroughTemplate(id: WaterfallTemplateId): boolean {
  return id === "look_through_100";
}

export function hasCoGp(config: Pick<WaterfallConfig, "coGpName" | "coGpOfPromoteBps" | "coGpCoInvestShareBps">): boolean {
  return config.coGpOfPromoteBps > 0 || config.coGpCoInvestShareBps > 0 || Boolean(config.coGpName.trim());
}

/** Split GP-side dollars: Co-GP takes `coGpBps` of the amount; RCP takes the remainder. */
export function splitGpSide(gpAmount: bigint, coGpBps: number): { rcp: bigint; coGp: bigint } {
  const amount = gpAmount > 0n ? gpAmount : 0n;
  const bps = clampBps(coGpBps);
  if (amount <= 0n || bps <= 0) return { rcp: amount, coGp: 0n };
  if (bps >= BPS_DENOMINATOR) return { rcp: 0n, coGp: amount };
  const coGp = (amount * BigInt(bps)) / BigInt(BPS_DENOMINATOR);
  return { rcp: amount - coGp, coGp };
}

/** Promote dollars use coGpOfPromoteBps; co-invest dollars use coGpCoInvestShareBps. */
export function gpParties(
  gpPromoteCents: bigint,
  gpCoInvestCents: bigint,
  config: Pick<WaterfallConfig, "coGpOfPromoteBps" | "coGpCoInvestShareBps">,
): { gpCents: bigint; rcpCents: bigint; coGpCents: bigint } {
  const promote = splitGpSide(gpPromoteCents, config.coGpOfPromoteBps);
  const coinvest = splitGpSide(gpCoInvestCents, config.coGpCoInvestShareBps);
  return {
    gpCents: gpPromoteCents + gpCoInvestCents,
    rcpCents: promote.rcp + coinvest.rcp,
    coGpCents: promote.coGp + coinvest.coGp,
  };
}

export function splitBps(amount: bigint, lpBps: number, gpBps: number): { lp: bigint; gp: bigint } {
  if (amount <= 0n) return { lp: 0n, gp: 0n };
  const lpSafe = Math.max(0, lpBps);
  const gpSafe = Math.max(0, gpBps);
  const total = lpSafe + gpSafe;
  if (total <= 0) return { lp: amount, gp: 0n };
  const lp = (amount * BigInt(lpSafe)) / BigInt(total);
  return { lp, gp: amount - lp };
}

export function pariPassu(amount: bigint, lpCapital: bigint, gpCapital: bigint): { lp: bigint; gp: bigint } {
  const lp = lpCapital < 0n ? 0n : lpCapital;
  const gp = gpCapital < 0n ? 0n : gpCapital;
  const total = lp + gp;
  if (amount <= 0n) return { lp: 0n, gp: 0n };
  if (total <= 0n) return { lp: amount, gp: 0n };
  const lpTake = (amount * lp) / total;
  return { lp: lpTake, gp: amount - lpTake };
}

export function gpCoInvestCapital(lpContributedCents: bigint, gpCoInvestBps: number): bigint {
  const bps = clampBps(gpCoInvestBps);
  if (lpContributedCents <= 0n || bps <= 0) return 0n;
  if (bps >= BPS_DENOMINATOR) return lpContributedCents;
  // GP% of total stack; LP entered is the LP piece: GP = LP × bps / (10000 − bps)
  return (lpContributedCents * BigInt(bps)) / BigInt(BPS_DENOMINATOR - bps);
}

export function simplePrefCents(capitalCents: bigint, prefRateBps: number, months: number): bigint {
  if (capitalCents <= 0n || prefRateBps <= 0 || months <= 0) return 0n;
  return (capitalCents * BigInt(prefRateBps) * BigInt(months)) / (BigInt(BPS_DENOMINATOR) * 12n);
}

export function annualCompoundPrefCents(capitalCents: bigint, prefRateBps: number, years: number): bigint {
  if (capitalCents <= 0n || prefRateBps <= 0 || years <= 0) return 0n;
  let acc = capitalCents;
  for (let i = 0; i < years; i += 1) {
    acc += (acc * BigInt(prefRateBps)) / BigInt(BPS_DENOMINATOR);
  }
  return acc - capitalCents;
}

export function prefAccrualCents(opts: {
  capitalCents: bigint;
  prefRateBps: number;
  compounding: WaterfallCompounding;
  periodMonths: number;
  prefPaidToDateCents: bigint;
}): bigint {
  const months = Math.max(0, Math.floor(opts.periodMonths));
  if (opts.compounding === "ANNUAL") {
    const years = months >= 12 ? Math.max(1, Math.floor(months / 12)) : months > 0 ? 1 : 0;
    const due = annualCompoundPrefCents(opts.capitalCents, opts.prefRateBps, years);
    const unpaid = due - opts.prefPaidToDateCents;
    return unpaid > 0n ? unpaid : 0n;
  }
  return simplePrefCents(opts.capitalCents, opts.prefRateBps, months);
}

function clampBps(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(BPS_DENOMINATOR, Math.max(0, Math.round(value)));
}

function take(remaining: bigint, want: bigint): { taken: bigint; remaining: bigint } {
  if (want <= 0n || remaining <= 0n) return { taken: 0n, remaining };
  const taken = want < remaining ? want : remaining;
  return { taken, remaining: remaining - taken };
}

export const WATERFALL_TEMPLATE_META: Record<
  WaterfallTemplateId,
  { label: string; short: string; practice: string }
> = {
  look_through_100: {
    label: "100% look-through (current default)",
    short: "RCP owns the SPE cash as if wholly owned — demo default until you pick a template.",
    practice: "Not a market waterfall. Preserves today’s OpCo stack until a deal-specific choice is saved.",
  },
  simple_pref_promote: {
    label: "Simple pref + promote (no catch-up)",
    short: "ROC → LP pref (8%) → residual 80% LP / 20% GP.",
    practice: "Straight promote above a preferred return; common on smaller / club CRE deals (WSP / Gower primers).",
  },
  institutional_catchup: {
    label: "Institutional pref + 100% catch-up + promote",
    short: "ROC → LP pref (8%) → 100% GP catch-up → 80/20 residual.",
    practice: "Institutional REPE promote: GP catches up to its 20% of profits, then 80/20 (Cambridge / JPMorgan-style).",
  },
  multi_hurdle_irr: {
    label: "Multi-hurdle IRR promote",
    short: "ROC → 8%→20% GP, 12%→30% GP, 15%→40% GP (dollar-pref proxies of IRR hurdles).",
    practice: "Rising promote above successive hurdles. This engine uses dollar-pref bands, not a true XIRR.",
  },
  american_deal: {
    label: "American / deal-by-deal",
    short: "Promote as this SPE’s hurdles are met. Clawback/lookback flagged for later true-up.",
    practice: "Deal-by-deal promote (American). Clawback is stored, not auto-trued in this run.",
  },
  european_fund: {
    label: "European / whole-fund style",
    short: "No GP promote from this SPE until OpCo/portfolio capital + pref are satisfied.",
    practice: "LP-protective whole-fund: promote waits on the portfolio gate (RealCap / REPE European).",
  },
};

function rocTier(): WaterfallTier {
  return { id: "roc", kind: "ROC", label: "Return of capital", hurdleIrrBps: null, lpSplitBps: 10_000, gpSplitBps: 0 };
}

function prefTier(rateBps: number): WaterfallTier {
  return {
    id: "pref",
    kind: "PREF",
    label: `LP preferred return (${(rateBps / 100).toFixed(2)}%)`,
    hurdleIrrBps: rateBps,
    lpSplitBps: 10_000,
    gpSplitBps: 0,
  };
}

function catchUpTier(): WaterfallTier {
  return {
    id: "catchup",
    kind: "CATCH_UP",
    label: "GP catch-up (100% until promote share)",
    hurdleIrrBps: null,
    lpSplitBps: 8_000,
    gpSplitBps: 2_000,
  };
}

function residualTier(id: string, label: string, lp: number, gp: number, hurdle: number | null): WaterfallTier {
  return { id, kind: "PROMOTE", label, hurdleIrrBps: hurdle, lpSplitBps: lp, gpSplitBps: gp };
}

const NO_CO_GP = { coGpName: "", coGpOfPromoteBps: 0, coGpCoInvestShareBps: 0 } as const;

export function lookThroughConfig(): WaterfallConfig {
  return {
    templateId: "look_through_100",
    prefRateBps: 800,
    compounding: "NONE",
    catchUpEnabled: false,
    catchUpBps: 10_000,
    gpCoInvestBps: 0,
    ...NO_CO_GP,
    promoteBase: "DISTRIBUTABLE_CASH",
    lookbackClawback: false,
    notes: "Default: 100% look-through to RCP/OpCo. Pick a template to apply a deal waterfall.",
    tiers: [residualTier("look_through", "100% look-through to RCP/GP", 0, 10_000, null)],
  };
}

export function applyWaterfallTemplate(id: WaterfallTemplateId): WaterfallConfig {
  switch (id) {
    case "look_through_100":
      return lookThroughConfig();
    case "simple_pref_promote":
      return {
        templateId: id,
        prefRateBps: 800,
        compounding: "NONE",
        catchUpEnabled: false,
        catchUpBps: 10_000,
        gpCoInvestBps: 0,
        ...NO_CO_GP,
        promoteBase: "DISTRIBUTABLE_CASH",
        lookbackClawback: false,
        notes: "Simple pref + straight promote. No GP catch-up.",
        tiers: [
          rocTier(),
          prefTier(800),
          residualTier("residual", "Residual 80% LP / 20% GP", 8_000, 2_000, 800),
        ],
      };
    case "institutional_catchup":
      return {
        templateId: id,
        prefRateBps: 800,
        compounding: "NONE",
        catchUpEnabled: true,
        catchUpBps: 10_000,
        gpCoInvestBps: 0,
        ...NO_CO_GP,
        promoteBase: "DISTRIBUTABLE_CASH",
        lookbackClawback: false,
        notes: "Institutional: 100% catch-up so GP reaches 20% of profits above ROC, then 80/20.",
        tiers: [
          rocTier(),
          prefTier(800),
          catchUpTier(),
          residualTier("residual", "Residual 80% LP / 20% GP", 8_000, 2_000, 800),
        ],
      };
    case "multi_hurdle_irr":
      return {
        templateId: id,
        prefRateBps: 800,
        compounding: "NONE",
        catchUpEnabled: false,
        catchUpBps: 10_000,
        gpCoInvestBps: 0,
        ...NO_CO_GP,
        promoteBase: "DISTRIBUTABLE_CASH",
        lookbackClawback: false,
        notes:
          "Multi-hurdle: dollar-pref proxies of 8% / 12% / 15% IRR (not XIRR). Bands are Δhurdle × capital after ROC.",
        tiers: [
          rocTier(),
          residualTier("hurdle_8", "To 8% hurdle · 80/20", 8_000, 2_000, 800),
          residualTier("hurdle_12", "8% → 12% hurdle · 70/30", 7_000, 3_000, 1_200),
          residualTier("hurdle_15", "12% → 15% hurdle · 60/40", 6_000, 4_000, 1_500),
        ],
      };
    case "american_deal":
      return {
        templateId: id,
        prefRateBps: 800,
        compounding: "NONE",
        catchUpEnabled: false,
        catchUpBps: 10_000,
        gpCoInvestBps: 0,
        ...NO_CO_GP,
        promoteBase: "DISTRIBUTABLE_CASH",
        lookbackClawback: true,
        notes:
          "American / deal-by-deal: this SPE’s hurdles earn promote as they are met. Clawback/lookback is flagged for a later true-up — this run does not reverse prior promote.",
        tiers: [
          rocTier(),
          prefTier(800),
          residualTier("residual", "Deal-level residual 80/20", 8_000, 2_000, 800),
        ],
      };
    case "european_fund":
      return {
        templateId: id,
        prefRateBps: 800,
        compounding: "NONE",
        catchUpEnabled: false,
        catchUpBps: 10_000,
        gpCoInvestBps: 0,
        ...NO_CO_GP,
        promoteBase: "DISTRIBUTABLE_CASH",
        lookbackClawback: false,
        notes:
          "European / whole-fund: no GP promote from this SPE until portfolio/OpCo capital + pref are satisfied (or until LP contributed capital is entered). Residual then 80/20.",
        tiers: [
          rocTier(),
          prefTier(800),
          residualTier("residual", "Residual 80/20 after portfolio gate", 8_000, 2_000, 800),
        ],
      };
  }
}

export function defaultWaterfallConfig(): WaterfallConfig {
  return lookThroughConfig();
}

function promoteBandCents(capital: bigint, priorHurdleBps: number, thisHurdleBps: number): bigint {
  const delta = Math.max(0, thisHurdleBps - priorHurdleBps);
  if (capital <= 0n || delta <= 0) return 0n;
  return (capital * BigInt(delta)) / BigInt(BPS_DENOMINATOR);
}

export function runWaterfall(input: WaterfallRunInput): WaterfallRunResult {
  const config = input.config;
  const pool = input.distributableCents > 0n ? input.distributableCents : 0n;
  const notes: string[] = [];
  if (config.notes) notes.push(config.notes);
  if (input.distributableCents < 0n) {
    notes.push("Distributable was negative; treated as $0 (no invented distribution).");
  }

  const lookThrough = isLookThroughTemplate(config.templateId);
  const gpCoInvest = gpCoInvestCapital(input.lpContributedCents, config.gpCoInvestBps);
  const lpCapital = input.lpContributedCents > 0n ? input.lpContributedCents : 0n;
  const stack = lpCapital + gpCoInvest;

  let unreturned = input.unreturnedCapitalCents > 0n ? input.unreturnedCapitalCents : 0n;
  if (unreturned > stack && stack > 0n) unreturned = stack;

  const european =
    config.templateId === "european_fund" &&
    (input.europeanPromoteOpen === false || lpCapital <= 0n);
  if (config.templateId === "european_fund") {
    if (lpCapital <= 0n) {
      notes.push("European gate closed: enter LP contributed capital so ROC/pref have a base (LP-protective).");
    } else if (input.europeanPromoteOpen === false) {
      notes.push("European gate closed: portfolio/OpCo capital + pref still unpaid — no GP promote this run.");
    } else {
      notes.push("European gate open: portfolio capital + pref satisfied — residual promote applies.");
    }
  }
  if (config.lookbackClawback) {
    notes.push("Clawback/lookback is flagged for later true-up; this run does not reverse prior promote.");
  }
  if (hasCoGp(config)) {
    const who = config.coGpName.trim() || "Co-GP";
    notes.push(
      `Co-GP ${who}: ${config.coGpOfPromoteBps / 100}% of GP promote/catch-up · ${config.coGpCoInvestShareBps / 100}% of GP co-invest. Remainder is RCP.`,
    );
  }

  if (lookThrough) {
    const parties = gpParties(pool, 0n, config);
    const steps: WaterfallStep[] = [
      {
        tierId: "look_through",
        kind: "PROMOTE",
        label: "100% look-through to RCP/GP",
        takenCents: pool,
        lpCents: 0n,
        gpCents: parties.gpCents,
        rcpCents: parties.rcpCents,
        coGpCents: parties.coGpCents,
        note: "No LP/GP waterfall selected. OpCo still stacks this SPE at 100% (Co-GP share of that GP-side if set).",
      },
    ];
    return {
      templateId: config.templateId,
      lookThrough: true,
      distributableCents: pool,
      lpCents: 0n,
      gpCents: parties.gpCents,
      rcpCents: parties.rcpCents,
      coGpCents: parties.coGpCents,
      allocatedCents: pool,
      unreturnedCapitalAfterCents: unreturned,
      unpaidPrefAfterCents: input.unpaidPrefCents > 0n ? input.unpaidPrefCents : 0n,
      prefAccruedThisRunCents: 0n,
      europeanPromoteBlocked: false,
      clawbackFlagged: false,
      steps,
      notes,
    };
  }

  const prefAccrued = prefAccrualCents({
    capitalCents: unreturned > 0n ? unreturned : 0n,
    prefRateBps: config.prefRateBps,
    compounding: config.compounding,
    periodMonths: input.periodMonths,
    prefPaidToDateCents: input.prefPaidToDateCents,
  });
  let unpaidPref = (input.unpaidPrefCents > 0n ? input.unpaidPrefCents : 0n) + prefAccrued;

  let remaining = pool;
  let lpTotal = 0n;
  let gpTotal = 0n;
  let lpPrefPaid = 0n;
  let gpPromoteSoFar = 0n;
  let lpUnreturned = stack > 0n ? (unreturned * lpCapital) / (stack === 0n ? 1n : stack) : unreturned;
  let gpUnreturned = unreturned - lpUnreturned;
  if (stack <= 0n) {
    lpUnreturned = unreturned;
    gpUnreturned = 0n;
  }

  const steps: WaterfallStep[] = [];
  const promoteTiers = config.tiers.filter((t) => t.kind === "PROMOTE");
  let priorHurdleBps = 0;
  let promoteIndex = 0;

  for (const tier of config.tiers) {
    if (remaining <= 0n) break;

    if (tier.kind === "ROC") {
      const { taken, remaining: next } = take(remaining, unreturned);
      remaining = next;
      const split = pariPassu(taken, lpUnreturned, gpUnreturned);
      lpUnreturned -= split.lp;
      gpUnreturned -= split.gp;
      unreturned -= taken;
      lpTotal += split.lp;
      gpTotal += split.gp;
      const rocParties = gpParties(0n, split.gp, config);
      steps.push({
        tierId: tier.id,
        kind: tier.kind,
        label: tier.label,
        takenCents: taken,
        lpCents: split.lp,
        gpCents: rocParties.gpCents,
        rcpCents: rocParties.rcpCents,
        coGpCents: rocParties.coGpCents,
        note: "Pari passu return of unreturned capital (LP + GP co-invest).",
      });
      continue;
    }

    if (tier.kind === "PREF") {
      const { taken, remaining: next } = take(remaining, unpaidPref);
      remaining = next;
      unpaidPref -= taken;
      const split = pariPassu(taken, lpCapital, gpCoInvest);
      lpTotal += split.lp;
      gpTotal += split.gp;
      lpPrefPaid += split.lp;
      const prefParties = gpParties(0n, split.gp, config);
      steps.push({
        tierId: tier.id,
        kind: tier.kind,
        label: tier.label,
        takenCents: taken,
        lpCents: split.lp,
        gpCents: prefParties.gpCents,
        rcpCents: prefParties.rcpCents,
        coGpCents: prefParties.coGpCents,
        note: `Pref accrual this run ${prefAccrued.toString()}¢ (${config.compounding}, ${input.periodMonths} mo). Pari passu with GP co-invest.`,
      });
      continue;
    }

    if (tier.kind === "CATCH_UP") {
      if (!config.catchUpEnabled || european) {
        steps.push({
          tierId: tier.id,
          kind: tier.kind,
          label: tier.label,
          takenCents: 0n,
          lpCents: 0n,
          gpCents: 0n,
          rcpCents: 0n,
          coGpCents: 0n,
          note: european ? "Catch-up skipped — European promote blocked." : "Catch-up off.",
        });
        continue;
      }
      const lpBps = tier.lpSplitBps > 0 ? tier.lpSplitBps : 8_000;
      const gpBps = tier.gpSplitBps > 0 ? tier.gpSplitBps : 2_000;
      const target = lpBps > 0 ? (lpPrefPaid * BigInt(gpBps)) / BigInt(lpBps) : 0n;
      const stillNeed = target > gpPromoteSoFar ? target - gpPromoteSoFar : 0n;
      const { taken, remaining: next } = take(remaining, stillNeed);
      remaining = next;
      const toGp = (taken * BigInt(clampBps(config.catchUpBps))) / BigInt(BPS_DENOMINATOR);
      const toLp = taken - toGp;
      const lpClass = pariPassu(toLp, lpCapital, gpCoInvest);
      lpTotal += lpClass.lp;
      gpTotal += lpClass.gp + toGp;
      gpPromoteSoFar += toGp;
      const catchParties = gpParties(toGp, lpClass.gp, config);
      steps.push({
        tierId: tier.id,
        kind: tier.kind,
        label: tier.label,
        takenCents: taken,
        lpCents: lpClass.lp,
        gpCents: catchParties.gpCents,
        rcpCents: catchParties.rcpCents,
        coGpCents: catchParties.coGpCents,
        note: `Catch-up target ${target.toString()}¢ = LP pref paid × GP/LP split. ${clampBps(config.catchUpBps) / 100}% of catch-up dollars to GP.`,
      });
      continue;
    }

    // PROMOTE / residual
    const lpBps = tier.lpSplitBps;
    const gpBps = tier.gpSplitBps;
    let capacity = remaining;
    const isBanded = config.templateId === "multi_hurdle_irr" && tier.hurdleIrrBps != null && promoteTiers.length > 1;
    if (isBanded) {
      const hurdle = tier.hurdleIrrBps ?? 0;
      const lastPromote = promoteIndex === promoteTiers.length - 1;
      if (!lastPromote) {
        capacity = promoteBandCents(stack > 0n ? stack : lpCapital, priorHurdleBps, hurdle);
      }
      priorHurdleBps = hurdle;
      promoteIndex += 1;
    }

    const { taken, remaining: next } = take(remaining, capacity);
    remaining = next;

    if (european) {
      const split = pariPassu(taken, lpCapital, gpCoInvest);
      lpTotal += split.lp;
      gpTotal += split.gp;
      const euroParties = gpParties(0n, split.gp, config);
      steps.push({
        tierId: tier.id,
        kind: tier.kind,
        label: `${tier.label} (European — LP-class only)`,
        takenCents: taken,
        lpCents: split.lp,
        gpCents: euroParties.gpCents,
        rcpCents: euroParties.rcpCents,
        coGpCents: euroParties.coGpCents,
        note: "Promote blocked. Residual stays LP-class (GP co-invest pari passu only).",
      });
      continue;
    }

    const promote = splitBps(taken, lpBps, gpBps);
    const lpClass = pariPassu(promote.lp, lpCapital, gpCoInvest);
    lpTotal += lpClass.lp;
    gpTotal += lpClass.gp + promote.gp;
    gpPromoteSoFar += promote.gp;
    const promoteParties = gpParties(promote.gp, lpClass.gp, config);
    steps.push({
      tierId: tier.id,
      kind: tier.kind,
      label: tier.label,
      takenCents: taken,
      lpCents: lpClass.lp,
      gpCents: promoteParties.gpCents,
      rcpCents: promoteParties.rcpCents,
      coGpCents: promoteParties.coGpCents,
      note: isBanded
        ? `Hurdle band ${tier.hurdleIrrBps ?? 0} bps · split ${lpBps}/${gpBps}. Dollar-pref proxy — not XIRR.`
        : `Residual split ${lpBps}/${gpBps} bps. GP promote is extra to the GP side; LP-class includes GP co-invest.`,
    });
  }

  if (remaining > 0n) {
    const last = config.tiers.filter((t) => t.kind === "PROMOTE").at(-1);
    const promote = splitBps(remaining, last?.lpSplitBps ?? 8_000, last?.gpSplitBps ?? 2_000);
    const lpClass = pariPassu(promote.lp, lpCapital, gpCoInvest);
    if (european) {
      const split = pariPassu(remaining, lpCapital, gpCoInvest);
      lpTotal += split.lp;
      gpTotal += split.gp;
      const overflowEuro = gpParties(0n, split.gp, config);
      steps.push({
        tierId: "overflow_lp",
        kind: "PROMOTE",
        label: "Unallocated residual (European LP-class)",
        takenCents: remaining,
        lpCents: split.lp,
        gpCents: overflowEuro.gpCents,
        rcpCents: overflowEuro.rcpCents,
        coGpCents: overflowEuro.coGpCents,
        note: "Leftover after listed tiers — LP-class because promote is blocked.",
      });
    } else {
      lpTotal += lpClass.lp;
      gpTotal += lpClass.gp + promote.gp;
      const overflowParties = gpParties(promote.gp, lpClass.gp, config);
      steps.push({
        tierId: "overflow",
        kind: "PROMOTE",
        label: "Unallocated residual",
        takenCents: remaining,
        lpCents: lpClass.lp,
        gpCents: overflowParties.gpCents,
        rcpCents: overflowParties.rcpCents,
        coGpCents: overflowParties.coGpCents,
        note: "Leftover after listed tiers, at last promote split.",
      });
    }
    remaining = 0n;
  }

  const allocated = lpTotal + gpTotal;
  const rcpTotal = steps.reduce((acc, s) => acc + s.rcpCents, 0n);
  const coGpTotal = steps.reduce((acc, s) => acc + s.coGpCents, 0n);
  return {
    templateId: config.templateId,
    lookThrough: false,
    distributableCents: pool,
    lpCents: lpTotal,
    gpCents: gpTotal,
    rcpCents: rcpTotal,
    coGpCents: coGpTotal,
    allocatedCents: allocated,
    unreturnedCapitalAfterCents: unreturned < 0n ? 0n : unreturned,
    unpaidPrefAfterCents: unpaidPref < 0n ? 0n : unpaidPref,
    prefAccruedThisRunCents: prefAccrued,
    europeanPromoteBlocked: european,
    clawbackFlagged: config.lookbackClawback,
    steps,
    notes,
  };
}

export type WaterfallTierTotals = {
  rocLpCents: bigint;
  rocGpCents: bigint;
  prefLpCents: bigint;
  prefGpCents: bigint;
  catchUpGpCents: bigint;
  promoteGpCents: bigint;
  residualLpCents: bigint;
};

export const EMPTY_WATERFALL_TOTALS: WaterfallTierTotals = {
  rocLpCents: 0n,
  rocGpCents: 0n,
  prefLpCents: 0n,
  prefGpCents: 0n,
  catchUpGpCents: 0n,
  promoteGpCents: 0n,
  residualLpCents: 0n,
};

/** ROC / pref / catch-up / residual promote from an auditable run. */
export function summarizeWaterfall(result: WaterfallRunResult): WaterfallTierTotals {
  const out: WaterfallTierTotals = { ...EMPTY_WATERFALL_TOTALS };
  for (const step of result.steps) {
    switch (step.kind) {
      case "ROC":
        out.rocLpCents += step.lpCents;
        out.rocGpCents += step.gpCents;
        break;
      case "PREF":
        out.prefLpCents += step.lpCents;
        out.prefGpCents += step.gpCents;
        break;
      case "CATCH_UP":
        out.catchUpGpCents += step.gpCents;
        break;
      case "PROMOTE":
        out.residualLpCents += step.lpCents;
        out.promoteGpCents += step.gpCents;
        break;
    }
  }
  return out;
}

export function gpShareBps(result: WaterfallRunResult): number {
  if (result.distributableCents <= 0n) {
    return result.lookThrough ? BPS_DENOMINATOR : 0;
  }
  return Number((result.gpCents * BigInt(BPS_DENOMINATOR)) / result.distributableCents);
}

export function applyGpShare(amountCents: bigint, result: WaterfallRunResult): bigint {
  if (amountCents <= 0n) return 0n;
  if (result.lookThrough && result.coGpCents === 0n) return amountCents;
  if (result.distributableCents <= 0n) return 0n;
  return (amountCents * result.gpCents) / result.distributableCents;
}

/** Scale an amount by RCP’s share of the pool (OpCo entitlement after Co-GP). */
export function applyRcpShare(amountCents: bigint, result: WaterfallRunResult): bigint {
  if (amountCents <= 0n) return 0n;
  if (result.lookThrough && result.coGpCents === 0n) return amountCents;
  if (result.distributableCents <= 0n) return 0n;
  return (amountCents * result.rcpCents) / result.distributableCents;
}

export function scaleByShare(amountCents: bigint, numerator: bigint, denominator: bigint): bigint {
  if (amountCents <= 0n || denominator <= 0n) return 0n;
  return (amountCents * numerator) / denominator;
}
