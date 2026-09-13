import {
  formatBpsAsMultiple,
  formatBpsAsPercent,
  formatBpsAsYield,
  formatUsd,
  passFail,
} from "./formatters";
import type { PeriodSnapshot } from "./snapshot-types";

export type IcAction = "GO" | "HOLD" | "KILL";

export function icRecommendation(snap: PeriodSnapshot): { action: IcAction; rationale: string } {
  const occBelow =
    snap.physicalOccupancyBps !== null &&
    snap.breakevenOccupancyBps !== null &&
    snap.physicalOccupancyBps < snap.breakevenOccupancyBps;
  const subjectDscrFail = snap.dscrPass === false;
  const failingSpes = snap.concentration.filter((c) => c.dscrPass === false).map((c) => c.entityCode);
  const lookThroughFail = snap.entityType === "OPCO" && subjectDscrFail;
  const materialVar = snap.noiVarianceBps !== null && Math.abs(snap.noiVarianceBps) >= 1_000;
  const nearMaturity = snap.monthsRemaining !== null && snap.monthsRemaining <= 12;
  const watch = snap.watchlist.length > 0 || snap.debtYieldPass === false;
  const valueAddNoPath = snap.strategy === "VALUE_ADD_GARDEN" || snap.strategy === "value_add";

  if (lookThroughFail || (snap.entityType !== "OPCO" && (subjectDscrFail || occBelow))) {
    const reasons = [
      subjectDscrFail ? `DSCR ${formatBpsAsMultiple(snap.dscrBps)} vs ${formatBpsAsMultiple(snap.dscrThresholdBps)}` : null,
      occBelow
        ? `physical occupancy ${formatBpsAsPercent(snap.physicalOccupancyBps)} below breakeven ${formatBpsAsPercent(snap.breakevenOccupancyBps)}`
        : null,
    ]
      .filter(Boolean)
      .join("; ");
    const path =
      valueAddNoPath && subjectDscrFail ? " Value-add DSCR fail has no lease-up path posted — kill unless a path is written." : "";
    return {
      action: "KILL",
      rationale: `${reasons || "Coverage or occupancy shortfall"}. Value-add monthly DSCR below 1.25x is a control result, not a data error.${path}`,
    };
  }

  if (snap.entityType === "OPCO" && failingSpes.length) {
    return {
      action: "HOLD",
      rationale: `Hold the portfolio and fix ${failingSpes.join(", ")} (SPE DSCR fail). Look-through DSCR is ${formatBpsAsMultiple(snap.dscrBps)}.`,
    };
  }

  if (watch || materialVar || nearMaturity || occBelow) {
    const bits = [
      snap.debtYieldPass === false ? `debt yield ${formatBpsAsYield(snap.debtYieldBps)}` : null,
      materialVar ? `NOI variance ${formatBpsAsPercent(snap.noiVarianceBps)}` : null,
      nearMaturity ? `maturity in ${snap.monthsRemaining} months` : null,
      snap.watchlist.length ? `watchlist ${snap.watchlist.map((w) => w.entityCode).join(", ")}` : null,
      occBelow ? "occupancy below breakeven" : null,
    ]
      .filter(Boolean)
      .join("; ");
    return { action: "HOLD", rationale: `Hold: ${bits}.` };
  }

  return {
    action: "GO",
    rationale: `Go / monitor: DSCR ${formatBpsAsMultiple(snap.dscrBps)} ${passFail(snap.dscrPass)}, period NOI ${formatUsd(snap.noiCents)}, physical occupancy ${formatBpsAsPercent(snap.physicalOccupancyBps)}. Conditions: T12 stays unlabeled until 12/12; LTV stays gated.`,
  };
}
