/**
 * Audience-facing LP/GP waterfall numbers from the shared period snapshot.
 * Same SpeWaterfall config that amends OpCo cash — packs must not reprint
 * 100% look-through CFADS as if it were the LP (or GP) distribution.
 */

import type { AudienceId, PeriodSnapshot } from "./snapshot-types";
import { formatUsd } from "./formatters";

export type AudienceMoney = {
  cents: bigint;
  label: string;
  hint: string;
};

function poolCfads(snap: PeriodSnapshot): bigint {
  return snap.cfadsLookThroughCents > 0n ? snap.cfadsLookThroughCents : snap.cfadsCents > 0n ? snap.cfadsCents : 0n;
}

function poolCash(snap: PeriodSnapshot): bigint {
  return snap.cashLookThroughCents > 0n ? snap.cashLookThroughCents : snap.cashTotalCents > 0n ? snap.cashTotalCents : 0n;
}

/** CFADS / distributions proxy the named audience should see. */
export function audienceCfads(snap: PeriodSnapshot, audience: AudienceId): AudienceMoney {
  const pool = poolCfads(snap);
  if (!snap.waterfallApplied) {
    return {
      cents: pool,
      label: "CFADS",
      hint: "Distributions proxy · NOI − PPE − reserve req. 100% look-through until a deal waterfall is saved.",
    };
  }
  switch (audience) {
    case "lp":
      return {
        cents: snap.lpShareOfDistributableCents,
        label: "LP share after waterfall",
        hint: `LP entitlement of the CFADS pool ${formatUsd(pool)} — not gross SPE cash as if wholly owned.`,
      };
    case "gp":
    case "mgmt":
      return {
        cents: snap.gpShareOfDistributableCents,
        label: "GP/RCP after waterfall",
        hint: `GP/RCP promote + co-invest of the CFADS pool ${formatUsd(pool)}.`,
      };
    case "ic":
      return {
        cents: pool,
        label: "CFADS pool after waterfall",
        hint: `Then LP share ${formatUsd(snap.lpShareOfDistributableCents)} vs GP/RCP ${formatUsd(snap.gpShareOfDistributableCents)}.`,
      };
    case "lender":
      return {
        cents: pool,
        label: "SPE CFADS (book pool)",
        hint: "Property CFADS before LP/GP split — collateral / coverage stack, not an LP distribution.",
      };
  }
}

/** Cash-if-distributed the named audience should see. Lender keeps SPE book cash. */
export function audienceCash(snap: PeriodSnapshot, audience: AudienceId): AudienceMoney {
  const pool = poolCash(snap);
  if (!snap.waterfallApplied) {
    return {
      cents: pool,
      label: "Cash",
      hint: "GL 1010–1040. 100% look-through until a deal waterfall is saved.",
    };
  }
  switch (audience) {
    case "lp":
      return {
        cents: snap.cashLpCents,
        label: "LP cash after waterfall",
        hint: `LP share of SPE cash-if-distributed ${formatUsd(pool)}.`,
      };
    case "gp":
    case "mgmt":
      return {
        cents: snap.cashGpCents,
        label: "GP/RCP cash after waterfall",
        hint: `RCP entitlement of SPE cash-if-distributed ${formatUsd(pool)}.`,
      };
    case "ic":
      return {
        cents: pool,
        label: "SPE book cash (pool)",
        hint: `Then LP ${formatUsd(snap.cashLpCents)} vs GP/RCP ${formatUsd(snap.cashGpCents)}.`,
      };
    case "lender":
      return {
        cents: pool,
        label: "SPE book cash",
        hint: "GL 1010–1040 at the SPE — collateral, not the LP/GP split.",
      };
  }
}

export function waterfallSplitSentence(snap: PeriodSnapshot): string {
  if (!snap.waterfallApplied) {
    return "No deal waterfall is saved — CFADS and cash are 100% look-through (demo default).";
  }
  const tmpl = snap.waterfallTemplateId ? ` Template ${snap.waterfallTemplateId.replaceAll("_", " ")}.` : "";
  return (
    `After waterfall: CFADS pool ${formatUsd(poolCfads(snap))} splits LP share ${formatUsd(snap.lpShareOfDistributableCents)} vs GP/RCP ${formatUsd(snap.gpShareOfDistributableCents)}` +
    ` (ROC to LP ${formatUsd(snap.waterfallRocLpCents)}, pref paid to LP ${formatUsd(snap.waterfallPrefPaidLpCents)}, catch-up GP ${formatUsd(snap.waterfallCatchUpGpCents)}, residual promote GP ${formatUsd(snap.waterfallPromoteGpCents)}, residual LP ${formatUsd(snap.waterfallResidualLpCents)}).` +
    ` LP pref unpaid ${formatUsd(snap.lpPrefUnpaidCents)}.` +
    tmpl
  );
}

export function lpDistributionParagraph(snap: PeriodSnapshot): string {
  const cfads = audienceCfads(snap, "lp");
  const cash = audienceCash(snap, "lp");
  if (!snap.waterfallApplied) {
    return `No investor distribution subledger and no capital-call notice are posted for ${snap.period}. The book distributions proxy is CFADS of ${formatUsd(cfads.cents)} (100% look-through until a deal waterfall is saved): period NOI ${formatUsd(snap.noiCents)} less period PPE additions ${formatUsd(snap.periodCapexCents)} and the monthly reserve requirement of ${formatUsd(snap.reserveRequirementCents)}. Ending SPE book cash is ${formatUsd(poolCash(snap))}, including replacement-reserve cash of ${formatUsd(snap.cashReserveCents)}.`;
  }
  return (
    `No investor distribution subledger and no capital-call notice are posted for ${snap.period}. ` +
    `The same SPE waterfall that amends OpCo cash flow splits this period’s CFADS pool of ${formatUsd(poolCfads(snap))} into ` +
    `**LP share after waterfall** ${formatUsd(cfads.cents)} versus **GP/RCP after waterfall** ${formatUsd(snap.gpShareOfDistributableCents)} ` +
    `(ROC to LP ${formatUsd(snap.waterfallRocLpCents)}, pref paid to LP ${formatUsd(snap.waterfallPrefPaidLpCents)}, GP catch-up ${formatUsd(snap.waterfallCatchUpGpCents)}, GP residual promote ${formatUsd(snap.waterfallPromoteGpCents)}, LP residual ${formatUsd(snap.waterfallResidualLpCents)}). ` +
    `LP pref unpaid ${formatUsd(snap.lpPrefUnpaidCents)}. ` +
    `LP cash-if-distributed ${formatUsd(cash.cents)} of SPE book cash ${formatUsd(poolCash(snap))}. ` +
    `This is not gross SPE cash as if the LP owned 100%.`
  );
}

export function gpDistributionSentence(snap: PeriodSnapshot): string {
  const cfads = audienceCfads(snap, "gp");
  if (!snap.waterfallApplied) {
    return `CFADS ${formatUsd(cfads.cents)} (100% look-through until a deal waterfall is saved).`;
  }
  return `GP/RCP after waterfall ${formatUsd(cfads.cents)} of CFADS pool ${formatUsd(poolCfads(snap))} (promote ${formatUsd(snap.waterfallPromoteGpCents + snap.waterfallCatchUpGpCents)}; LP share not upstreamed ${formatUsd(snap.lpShareOfDistributableCents)}).`;
}
