import type { DistributionChartModel } from "@/components/deals/distribution-charts";
import type { DistributionBoard } from "@/lib/distribution-ledger";
import { capitalBackCents, formatUsd } from "@rcp/ledger";
import { formatBpsAsMultiple, shortPeriodLabel } from "@rcp/reporting";

const TIER_LABEL = {
  ROC: "Return of capital",
  PREF: "Preferred return",
  CATCH_UP: "Catch-up",
  PROMOTE: "Promote",
} as const;

export function chartModelFromBoard(board: DistributionBoard): DistributionChartModel {
  const order = ["ROC", "PREF", "CATCH_UP", "PROMOTE"] as const;
  const index = order.indexOf(board.position);
  const contributed = board.current.capitalContributedCents;
  const back = capitalBackCents(contributed, board.current.unreturnedCapitalCents, board.current.capitalReturnedCents);
  const returned = back.returnedCents;
  const beforeLedger = back.beforeLedgerCents;
  const unpaid = board.current.prefUnpaidCents;
  const beforeNote = beforeLedger > 0n ? `, including ${formatUsd(beforeLedger)} returned before this ledger` : "";
  return {
    contributedCents: contributed,
    returnedCents: returned,
    unreturnedCents: board.current.unreturnedCapitalCents,
    dpiBps: board.dpiBps,
    position: board.position,
    tiers: order.map((id, i) => ({
      id,
      label: TIER_LABEL[id],
      state: i < index ? "done" : i === index ? "current" : "ahead",
    })),
    points: board.events
      .filter((event) => !event.reversesEventId && !event.reversed)
      .map((event) => ({
        period: shortPeriodLabel(event.periodLabel),
        accruedCents: event.state.prefAccruedCents,
        paidCents: event.state.prefPaidCents,
        unpaidCents: event.state.prefUnpaidCents,
        lpCents: event.state.cumulativeLpCents,
        rcpCents: event.state.cumulativeRcpCents,
        coGpCents: event.state.cumulativeCoGpCents,
      })),
    soWhat: {
      capital:
        contributed <= 0n
          ? "No LP capital is entered yet, so the bar stays empty until a contribution is saved on the waterfall."
          : `${formatUsd(returned)} of ${formatUsd(contributed)} contributed capital is back${beforeNote}.`,
      pref:
        unpaid > 0n
          ? `${formatUsd(unpaid)} of preferred return is still unpaid after what has actually been distributed.`
          : "Preferred return accrued so far has been paid. The unpaid line is the balance still owed.",
      parties: `Deal LPs have received ${formatUsd(board.current.cumulativeLpCents)}; RCP has received ${formatUsd(board.current.cumulativeRcpCents)}.`,
      tier: `The deal is in ${TIER_LABEL[board.position]}. Later tiers wait until this one is satisfied.`,
      dpi: `LP multiple to date is ${formatBpsAsMultiple(board.dpiBps)} — distributions divided by capital contributed. ${formatUsd(returned)} of capital is back${beforeNote}.`,
    },
  };
}
