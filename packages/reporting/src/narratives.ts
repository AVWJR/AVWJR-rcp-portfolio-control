import { AUDIENCE_BRIEFS, type AudienceKpiId } from "./audience-briefs";
import type { ChartId } from "./charts";
import type { AudienceId, PeriodSnapshot } from "./snapshot-types";
import { AUDIENCE_LABELS, AUDIENCES } from "./snapshot-types";
import {
  formatBpsAsMultiple,
  formatBpsAsPercent,
  formatBpsAsYield,
  formatMonthsCoverage,
  formatUsd,
  formatUsdOrDash,
  passFail,
  periodLabel,
} from "./formatters";

export type IcAction = "GO" | "HOLD" | "FIX";

export type NarrativeCitation = {
  id: string;
  label: string;
  value: string;
  unit: string;
  source: string;
};

export type NarrativeSection = {
  heading: string;
  body: string;
};

export type AudienceNarrative = {
  audience: AudienceId;
  audienceLabel: string;
  title: string;
  dek: string;
  tone: string;
  entityCode: string;
  entityName: string;
  period: string;
  viewLabel: string;
  sections: NarrativeSection[];
  citations: NarrativeCitation[];
  chartIds: ChartId[];
  recommendation?: { action: IcAction; rationale: string };
};

export type NarrativeBundle = Record<AudienceId, AudienceNarrative>;

function cite(id: string, label: string, value: string, unit: string, source: string): NarrativeCitation {
  return { id, label, value, unit, source };
}

function citationCatalog(snap: PeriodSnapshot): Record<AudienceKpiId, NarrativeCitation> {
  const rec = icRecommendation(snap);
  const debtService = snap.interestCents + snap.principalCents;
  const watch =
    snap.watchlist.length === 0
      ? "None"
      : snap.watchlist.map((w) => `${w.entityCode} ${w.reason}`).join("; ");
  const conc =
    snap.concentration.length === 0
      ? `${snap.entityCode} 100%`
      : snap.concentration
          .slice(0, 3)
          .map((c) => `${c.entityCode} ${formatBpsAsPercent(c.shareBps)}`)
          .join("; ");
  const lookThrough = snap.lookThroughNoiCents ?? snap.noiCents;
  const fee = snap.feeIncomeCents ?? snap.amFeesCents;
  return {
    noi: cite(
      "noi",
      "Period NOI",
      formatUsd(snap.noiCents),
      "USD",
      snap.t12Complete
        ? "period NOI · T12 also complete · AM fees sit below"
        : "period NOI (not T12; T12 incomplete — not annualized) · AM fees sit below",
    ),
    noi_per_unit: cite("noi_per_unit", "NOI / unit", formatUsdOrDash(snap.noiPerUnitCents), "USD / unit", "Period NOI ÷ unit count"),
    opex_ratio: cite("opex_ratio", "OpEx ratio", formatBpsAsPercent(snap.opexRatioBps), "%", "In-NOI OpEx ÷ EGI"),
    occupancy: cite(
      "occupancy",
      "Physical occupancy",
      formatBpsAsPercent(snap.physicalOccupancyBps),
      "%",
      "Rent roll occupied ÷ rentable",
    ),
    occ_book: cite(
      "occ_book",
      "Book economic occupancy",
      formatBpsAsPercent(snap.bookEconomicOccupancyBps),
      "%",
      "EGI ÷ GPR",
    ),
    breakeven: cite("breakeven", "Breakeven occupancy", formatBpsAsPercent(snap.breakevenOccupancyBps), "%", "Phase D helper"),
    budget_variance: cite(
      "budget_variance",
      "NOI vs budget",
      snap.noiVarianceCents === null ? "No budget" : formatUsd(snap.noiVarianceCents),
      "USD",
      snap.budgetNoiCents === null ? "No monthly budget posted" : `${formatBpsAsPercent(snap.noiVarianceBps)} vs plan`,
    ),
    cash: cite("cash", "Cash", formatUsd(snap.cashTotalCents), "USD", "GL 1010–1040"),
    btcf: cite("btcf", "BTCF", formatUsd(snap.btcfCents), "USD", "Period NOI − interest − principal"),
    cfads: cite("cfads", "CFADS", formatUsd(snap.cfadsCents), "USD", "Distributions proxy · NOI − PPE − reserve req."),
    dscr: cite("dscr", "DSCR", formatBpsAsMultiple(snap.dscrBps), "x", `vs ${formatBpsAsMultiple(snap.dscrThresholdBps)} · ${passFail(snap.dscrPass)}`),
    debt_yield: cite(
      "debt_yield",
      "Debt yield",
      formatBpsAsYield(snap.debtYieldBps),
      "%",
      `vs ${formatBpsAsYield(snap.debtYieldThresholdBps)} · annualized period NOI ÷ UPB`,
    ),
    upb: cite("upb", "UPB", formatUsd(snap.upbCents), "USD", "Loan file"),
    debt_service: cite("debt_service", "Debt service", formatUsd(debtService), "USD", "Interest + principal this period"),
    reserves: cite("reserves", "Reserve cash", formatUsd(snap.cashReserveCents), "USD", "GL 1020 vs monthly requirement"),
    maturity: cite(
      "maturity",
      "Maturity",
      snap.maturityDate ?? "—",
      snap.monthsRemaining === null ? "—" : `${snap.monthsRemaining} mo`,
      "First-mortgage file",
    ),
    covenant_watch: cite("covenant_watch", "Covenant watch", watch, "—", "DSCR / debt-yield / maturity flags"),
    liquidity: cite("liquidity", "Liquidity", formatMonthsCoverage(snap.liquidityMonthsHundredths), "months", "Cash ÷ period OpEx"),
    fee_income: cite("fee_income", "Fee income", formatUsd(fee), "USD", "AM / OpCo fee line · below NOI on the SPE"),
    am_fees: cite("am_fees", "AM fees", formatUsd(snap.amFeesCents), "USD", "Sit below NOI"),
    look_through_noi: cite("look_through_noi", "Look-through NOI", formatUsd(lookThrough), "USD", "Property books · not a GAAP consolidation"),
    concentration: cite("concentration", "NOI concentration", conc, "%", "Look-through SPE share"),
    controllable_opex: cite(
      "controllable_opex",
      "Controllable OpEx",
      formatUsd(snap.controllableOpexCents),
      "USD",
      `${formatBpsAsPercent(snap.controllableOpexRatioBps)} of EGI`,
    ),
    ltl: cite("ltl", "Loss-to-lease", formatUsdOrDash(snap.lossToLeaseCents), "USD", "Rent roll mark-to-market gap"),
    capex: cite("capex", "Period CapEx", formatUsd(snap.periodCapexCents), "USD", "PPE additions · CIP stays off NOI"),
    recommendation: cite("recommendation", "IC call", rec.action, "—", rec.rationale),
  };
}

function citationsFor(snap: PeriodSnapshot, ids: AudienceKpiId[]): NarrativeCitation[] {
  const catalog = citationCatalog(snap);
  return ids.map((id) => catalog[id]);
}

function envelope(snap: PeriodSnapshot, audience: AudienceId, extras: Pick<AudienceNarrative, "sections" | "recommendation">): AudienceNarrative {
  const brief = AUDIENCE_BRIEFS[audience];
  return {
    audience,
    audienceLabel: brief.label,
    title: brief.title,
    dek: brief.dek,
    tone: brief.tone,
    entityCode: snap.entityCode,
    entityName: snap.entityName,
    period: snap.period,
    viewLabel: snap.viewLabel,
    citations: citationsFor(snap, brief.kpiIds),
    chartIds: brief.chartIds,
    ...extras,
  };
}

function scopeClause(snap: PeriodSnapshot): string {
  const units = snap.unitCount ? ` ${snap.unitCount} units` : "";
  const strategy = snap.strategy ? ` ${snap.strategy.replaceAll("_", " ")}` : "";
  const rollup = snap.rollupIsNotGaap
    ? " Figures are look-through property books unless labeled combined roll-up; the combined roll-up is not a GAAP consolidation."
    : " Standalone SPE books.";
  return `${snap.entityName} (${snap.entityCode})${units}${strategy} for ${periodLabel(snap.period)}.${rollup}`;
}

function t12Sentence(snap: PeriodSnapshot): string {
  if (snap.t12Complete) {
    return `T12 NOI is ${formatUsd(snap.t12NoiCents)}.`;
  }
  return `T12 NOI is incomplete at ${formatUsd(snap.t12NoiCents)} across ${snap.t12MonthsAvailable} of 12 months and is not annualized or labeled ready T12.`;
}

function varianceSentence(snap: PeriodSnapshot): string {
  if (snap.budgetNoiCents === null || snap.noiVarianceCents === null) {
    return `No monthly budget is posted for ${snap.period}.`;
  }
  const direction = snap.noiVarianceCents >= 0n ? "above" : "below";
  return `Period NOI is ${formatUsd(snap.noiCents)} versus budget ${formatUsd(snap.budgetNoiCents)}, ${formatUsd(snap.noiVarianceCents)} ${direction} plan (${formatBpsAsPercent(snap.noiVarianceBps)}).`;
}

function occupancyFacts(snap: PeriodSnapshot): string {
  const phys =
    snap.physicalOccupancyBps === null
      ? "Physical occupancy is not computed (no rent roll)."
      : `Physical occupancy is ${formatBpsAsPercent(snap.physicalOccupancyBps)} (${snap.occupiedCount ?? 0} occupied / ${snap.rentableCount ?? 0} rentable; ${snap.downCount ?? 0} down).`;
  const book = `Book economic occupancy is ${formatBpsAsPercent(snap.bookEconomicOccupancyBps)} (EGI ${formatUsd(snap.egiCents)} / GPR ${formatUsd(snap.gprCents)}).`;
  const be =
    snap.breakevenOccupancyBps === null
      ? "Breakeven occupancy is not computed."
      : `Breakeven occupancy is ${formatBpsAsPercent(snap.breakevenOccupancyBps)}.`;
  return `${phys} ${book} ${be}`;
}

function covenantFacts(snap: PeriodSnapshot): string {
  if (snap.dscrBps === null && snap.loans.length === 0) {
    return "No loan file is posted; DSCR and debt yield are not computed.";
  }
  const dscr = `DSCR is ${formatBpsAsMultiple(snap.dscrBps)} versus a ${formatBpsAsMultiple(snap.dscrThresholdBps)} threshold (${passFail(snap.dscrPass)}).`;
  const dy = `Debt yield is ${formatBpsAsYield(snap.debtYieldBps)} versus ${formatBpsAsYield(snap.debtYieldThresholdBps)} (${passFail(snap.debtYieldPass)}), using annualized period NOI — not T12.`;
  return `${dscr} ${dy}`;
}

function largestVariances(snap: PeriodSnapshot, n = 3): string {
  const rows = [...snap.opexLines, ...snap.incomeBridgeLines]
    .filter((l) => l.budgetCents !== null)
    .map((l) => {
      const variance = l.actualCents - (l.budgetCents ?? 0n);
      return { ...l, variance };
    })
    .sort((a, b) => {
      const av = a.variance < 0n ? -a.variance : a.variance;
      const bv = b.variance < 0n ? -b.variance : b.variance;
      return av === bv ? 0 : av > bv ? -1 : 1;
    })
    .slice(0, n);
  if (!rows.length) return "No account-level budget lines are available to assign variance owners.";
  return rows
    .map((r) => `${r.label} (${r.code ?? r.key}) actual ${formatUsd(r.actualCents)} vs budget ${formatUsdOrDash(r.budgetCents)} (${formatUsd(r.variance)})`)
    .join("; ");
}

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

  if (lookThroughFail || (snap.entityType !== "OPCO" && (subjectDscrFail || occBelow))) {
    const reasons = [
      subjectDscrFail ? `DSCR ${formatBpsAsMultiple(snap.dscrBps)} vs ${formatBpsAsMultiple(snap.dscrThresholdBps)}` : null,
      occBelow
        ? `physical occupancy ${formatBpsAsPercent(snap.physicalOccupancyBps)} below breakeven ${formatBpsAsPercent(snap.breakevenOccupancyBps)}`
        : null,
    ]
      .filter(Boolean)
      .join("; ");
    return { action: "FIX", rationale: `${reasons || "Coverage or occupancy shortfall"}. Value-add monthly DSCR below 1.25x is a control result, not a data error.` };
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
    rationale: `Go / monitor: DSCR ${formatBpsAsMultiple(snap.dscrBps)} ${passFail(snap.dscrPass)}, period NOI ${formatUsd(snap.noiCents)}, physical occupancy ${formatBpsAsPercent(snap.physicalOccupancyBps)}.`,
  };
}

function lpNarrative(snap: PeriodSnapshot): AudienceNarrative {
  const opcoNote =
    snap.entityType === "OPCO" && snap.concentration.length
      ? ` At OpCo, NOI concentration is ${snap.concentration
          .map((c) => `${c.entityCode} ${formatUsd(c.noiCents)} (${formatBpsAsPercent(c.shareBps)})`)
          .join("; ")}.`
      : "";
  return envelope(snap, "lp", {
    sections: [
      {
        heading: "Period NOI and NOI per unit",
        body: `${scopeClause(snap)} Period NOI is ${formatUsd(snap.noiCents)} on EGI of ${formatUsd(snap.egiCents)} after GPR of ${formatUsd(snap.gprCents)}, vacancy of ${formatUsd(snap.vacancyCents)}, and concessions of ${formatUsd(snap.concessionsCents)}. NOI per unit is ${formatUsdOrDash(snap.noiPerUnitCents)} across ${snap.unitCount || "—"} units. Asset-management fees of ${formatUsd(snap.amFeesCents)} sit below NOI and are not in this operating line. ${t12Sentence(snap)}`,
      },
      {
        heading: "Occupancy, book economic occupancy, and loss-to-lease",
        body: `${occupancyFacts(snap)} Loss-to-lease is ${formatUsdOrDash(snap.lossToLeaseCents)} on the current rent roll — the mark-to-market rent gap, not a valuation. Physical and book economic occupancy are labeled separately; do not blend them. Strategy on this file is ${snap.strategy ? snap.strategy.replaceAll("_", " ") : "unlabeled"}; this update tracks in-place operations, not a promote waterfall.`,
      },
      {
        heading: "Capital at risk",
        body: `${varianceSentence(snap)} In-NOI OpEx is ${formatUsd(snap.opexCents)} (${formatBpsAsPercent(snap.opexRatioBps)} of EGI). Liquidity is ${formatMonthsCoverage(snap.liquidityMonthsHundredths)} of period OpEx. ${
          snap.entityType === "OPCO" && snap.concentration.length
            ? `NOI concentration: ${snap.concentration.map((c) => `${c.entityCode} ${formatBpsAsPercent(c.shareBps)}`).join("; ")}.`
            : "This SPE is a single-asset file — concentration is 100% here, not a diversification claim."
        } ${
          snap.dscrPass === false || snap.debtYieldPass === false || snap.watchlist.length
            ? `Covenant stress (fails only): ${covenantFacts(snap)} ${snap.watchlist.map((w) => w.reason).join("; ")}.`
            : "No covenant fails are on the watchlist this period."
        } Look-through UPB is ${formatUsd(snap.upbCents)}; LTV is gated and is not shown as a live ratio.`,
      },
      {
        heading: "Cash, BTCF, and distributions proxy",
        body: `No investor distribution subledger is posted. The book distributions proxy is CFADS of ${formatUsd(snap.cfadsCents)} (period NOI ${formatUsd(snap.noiCents)} less period PPE additions ${formatUsd(snap.periodCapexCents)} and the monthly reserve requirement of ${formatUsd(snap.reserveRequirementCents)}). Before-tax cash flow after debt service is BTCF of ${formatUsd(snap.btcfCents)}. Ending cash is ${formatUsd(snap.cashTotalCents)}, including replacement-reserve cash of ${formatUsd(snap.cashReserveCents)}.${opcoNote}`,
      },
    ],
  });
}

function gpNarrative(snap: PeriodSnapshot): AudienceNarrative {
  const fee =
    snap.feeIncomeCents !== null
      ? ` OpCo standalone AM fee income is ${formatUsd(snap.feeIncomeCents)}; G&A ratio is ${formatBpsAsPercent(snap.gaRatioBps)} of that fee line.`
      : ` SPE asset-management fees of ${formatUsd(snap.amFeesCents)} sit below NOI — they are fee income to the sponsor, not an in-NOI cost.`;
  const lookThrough =
    snap.lookThroughNoiCents !== null
      ? `Look-through property NOI is ${formatUsd(snap.lookThroughNoiCents)}.`
      : `This SPE’s period NOI is ${formatUsd(snap.noiCents)} on a standalone book.`;
  const combined =
    snap.combinedRollupNoiCents !== null
      ? ` Combined roll-up NOI is ${formatUsd(snap.combinedRollupNoiCents)} after IC/AM elimination — not a GAAP consolidation.`
      : "";
  const conc = snap.concentration.length
    ? snap.concentration.map((c) => `${c.entityCode} ${formatUsd(c.noiCents)} (${formatBpsAsPercent(c.shareBps)})`).join("; ")
    : `${snap.entityCode} ${formatUsd(snap.noiCents)} (100.00%)`;
  return envelope(snap, "gp", {
    sections: [
      {
        heading: "Fee income below NOI",
        body: `${scopeClause(snap)}${fee} Do not net those fees against property NOI when talking about operating performance.`,
      },
      {
        heading: "Look-through NOI and SPE contribution",
        body: `${lookThrough}${combined} NOI concentration: ${conc}. Liquidity on the books is ${formatUsd(snap.cashTotalCents)}.`,
      },
      {
        heading: "Liquidity runway",
        body: `Cash covers ${formatMonthsCoverage(snap.liquidityMonthsHundredths)} of period OpEx (${formatUsd(snap.opexCents)}). Operating cash is ${formatUsd(snap.cashOperatingCents)}; reserve cash is ${formatUsd(snap.cashReserveCents)}. CFADS after PPE and the reserve requirement is ${formatUsd(snap.cfadsCents)}.`,
      },
      {
        heading: "Execution versus plan",
        body: `${varianceSentence(snap)} Controllable OpEx is ${formatUsd(snap.controllableOpexCents)} (${formatBpsAsPercent(snap.controllableOpexRatioBps)} of EGI). Largest budget variances: ${largestVariances(snap)}. Period PPE additions are ${formatUsd(snap.periodCapexCents)}. Capital-account posture is not posted on this flash — use /tax/k1 for the CPA rollforward, not a filed K-1.`,
      },
    ],
  });
}

function icNarrative(snap: PeriodSnapshot): AudienceNarrative {
  const rec = icRecommendation(snap);
  const combined =
    snap.combinedNote ??
    (snap.lookThroughNoiCents !== null && snap.combinedRollupNoiCents !== null
      ? `Look-through property NOI ${formatUsd(snap.lookThroughNoiCents)}; combined roll-up NOI ${formatUsd(snap.combinedRollupNoiCents)} after IC/AM elimination — not a GAAP consolidation.`
      : "");
  const conc = snap.concentration.length
    ? snap.concentration.map((c) => `${c.entityCode} ${formatUsd(c.noiCents)} (${formatBpsAsPercent(c.shareBps)})`).join("; ")
    : `${snap.entityCode} ${formatUsd(snap.noiCents)} (100.00%)`;
  const capex = snap.capexProjects.length
    ? snap.capexProjects
        .map((p) => `${p.name} (${p.entityCode}, ${p.classification} / ${p.status}) spent ${formatUsd(p.spentCents)} of ${formatUsd(p.budgetCents)}`)
        .join("; ")
    : `Period PPE additions ${formatUsd(snap.periodCapexCents)} with no open CapEx register rows on this entity.`;
  return envelope(snap, "ic", {
    recommendation: rec,
    sections: [
      {
        heading: "Go / hold / fix",
        body: `${rec.action}: ${rec.rationale} Support figures: NOI ${formatUsd(snap.noiCents)}, DSCR ${formatBpsAsMultiple(snap.dscrBps)}, physical occupancy ${formatBpsAsPercent(snap.physicalOccupancyBps)}, CFADS ${formatUsd(snap.cfadsCents)}.`,
      },
      {
        heading: "Thesis versus actuals",
        body: `${scopeClause(snap)} Figures below are period NOI unless labeled T12 or annualized (debt yield only). ${varianceSentence(snap)} Period NOI ${formatUsd(snap.noiCents)} / unit ${formatUsdOrDash(snap.noiPerUnitCents)}. ${occupancyFacts(snap)} ${combined} ${t12Sentence(snap)}`,
      },
      {
        heading: "Key risks",
        body: `Coverage: ${covenantFacts(snap)} NOI concentration: ${conc}. Concentration above 50% of look-through NOI is a single-asset dependency, not a diversification claim. ${t12Sentence(snap)} LTV is gated and is not computed from book cost. ${snap.ltvReason} Delinquency is stubbed. ${snap.delinquencyReason}`,
      },
      {
        heading: "CapEx and CIP status",
        body: `${capex} CIP remains on 1460 until placed in service. Reserve cash is ${formatUsd(snap.cashReserveCents)} against a ${formatUsd(snap.reserveRequirementCents)} monthly requirement.`,
      },
      {
        heading: "What would change the call",
        body: `A DSCR print below ${formatBpsAsMultiple(snap.dscrThresholdBps)}, physical occupancy below breakeven ${formatBpsAsPercent(snap.breakevenOccupancyBps)}, or a material NOI miss versus budget would move this file toward HOLD or FIX. Restoring coverage and occupancy above those marks, with CapEx staying on CIP until placed in service, would support GO / monitor.`,
      },
    ],
  });
}

function lenderNarrative(snap: PeriodSnapshot): AudienceNarrative {
  const debtService = snap.interestCents + snap.principalCents;
  return envelope(snap, "lender", {
    sections: [
      {
        heading: "DSCR and debt yield versus threshold",
        body: `${covenantFacts(snap)} This is a credit memo on coverage, not an investor update. Period NOI of ${formatUsd(snap.noiCents)} is the numerator for DSCR; debt yield uses annualized period NOI against UPB of ${formatUsd(snap.upbCents)}. ${t12Sentence(snap)}`,
      },
      {
        heading: "Debt service, UPB, and maturity",
        body: `Reported UPB is ${formatUsd(snap.upbCents)} across ${snap.loans.length || 0} first-mortgage file${snap.loans.length === 1 ? "" : "s"}. Period debt service is ${formatUsd(debtService)} (interest ${formatUsd(snap.interestCents)} + principal ${formatUsd(snap.principalCents)}). Maturity ${snap.maturityDate ?? "—"} (${snap.monthsRemaining ?? "—"} months remaining). LTV is not stated: ${snap.ltvReason}`,
      },
      {
        heading: "NOI available for debt service",
        body: `${scopeClause(snap)} Period NOI ${formatUsd(snap.noiCents)} covers the ${formatUsd(debtService)} debt-service stack. CFADS of ${formatUsd(snap.cfadsCents)} is NOI after PPE additions and the reserve requirement — useful as residual cash after collateral-preserving uses, not as an LP distribution. CFADS / debt service is ${formatBpsAsMultiple(snap.cfadsDscrBps)}.`,
      },
      {
        heading: "Occupancy, breakeven, and covenant watch",
        body: `${occupancyFacts(snap)} DSCR ${passFail(snap.dscrPass)}; debt yield ${passFail(snap.debtYieldPass)}. ${
          snap.watchlist.length
            ? `Flags: ${snap.watchlist.map((w) => `${w.entityCode} ${w.reason}`).join("; ")}.`
            : "No maturity-inside-12-months or covenant-fail flags beyond the ratios above."
        } Delinquency is not available from GL 1110. ${snap.delinquencyReason}`,
      },
      {
        heading: "Reserves and CapEx as collateral",
        body: `Replacement-reserve cash (GL 1020) is ${formatUsd(snap.cashReserveCents)} against a monthly requirement of ${formatUsd(snap.reserveRequirementCents)}. Period PPE additions are ${formatUsd(snap.periodCapexCents)} — cited only as they affect collateral and reserves, not as an LP CapEx story. Escrow / impound cash is ${formatUsd(snap.cashEscrowCents)}; security-deposit cash is ${formatUsd(snap.cashDepositsCents)}. Total cash ${formatUsd(snap.cashTotalCents)} is a GL position, not a bank reconciliation.`,
      },
    ],
  });
}

function mgmtNarrative(snap: PeriodSnapshot): AudienceNarrative {
  const occGap =
    snap.physicalOccupancyBps !== null && snap.breakevenOccupancyBps !== null
      ? snap.physicalOccupancyBps - snap.breakevenOccupancyBps
      : null;
  const occAction =
    occGap === null
      ? "Post a rent roll so occupancy versus breakeven can be assigned this week."
      : occGap >= 0
        ? `Defend in-place rent and limit new concessions — physical occupancy is ${formatBpsAsPercent(occGap)} above breakeven.`
        : `Priority is leased occupancy and concession discipline — physical occupancy is ${formatBpsAsPercent(-occGap)} below breakeven.`;
  const capexPriority = snap.capexProjects.length
    ? snap.capexProjects
        .slice()
        .sort((a, b) => (a.spentCents === b.spentCents ? 0 : a.spentCents > b.spentCents ? -1 : 1))
        .map((p) => `${p.name} (${p.classification}, ${p.status}) ${formatUsd(p.spentCents)} spent / ${formatUsd(p.budgetCents)} budget`)
        .join("; ")
    : `Period PPE additions ${formatUsd(snap.periodCapexCents)} with reserve cash ${formatUsd(snap.cashReserveCents)}`;
  return envelope(snap, "mgmt", {
    sections: [
      {
        heading: "What to do this week",
        body: `${scopeClause(snap)} ${occAction} Assigned variance owners: ${largestVariances(snap, 4)}. Period NOI ${formatUsd(snap.noiCents)}; BTCF ${formatUsd(snap.btcfCents)}.`,
      },
      {
        heading: "Occupancy and loss-to-lease",
        body: `${occupancyFacts(snap)} Vacancy loss is ${formatUsd(snap.vacancyCents)} and concessions are ${formatUsd(snap.concessionsCents)} on GPR ${formatUsd(snap.gprCents)}. Loss-to-lease is ${formatUsdOrDash(snap.lossToLeaseCents)}.`,
      },
      {
        heading: "Controllable OpEx and variance drivers",
        body: `${varianceSentence(snap)} Controllable OpEx ${formatUsd(snap.controllableOpexCents)} (${formatBpsAsPercent(snap.controllableOpexRatioBps)} of EGI) is the site-manageable bucket (payroll, R&M, utilities, contracts, marketing, admin, other). Insurance and real-estate taxes stay non-controllable. In-NOI OpEx is ${formatUsd(snap.opexCents)}.`,
      },
      {
        heading: "CapEx versus R&M",
        body: `${capexPriority}. Fund the ${formatUsd(snap.reserveRequirementCents)} monthly reserve requirement from operations when CFADS of ${formatUsd(snap.cfadsCents)} allows; reserve cash on the books is ${formatUsd(snap.cashReserveCents)}. R&M inside OpEx is the 5210 line. CIP remains on 1460 until placed in service — do not expense value-add interiors through NOI.`,
      },
      {
        heading: "Period-close follow-through",
        body: `Close the books on /close for ${snap.entityCode} ${snap.period} before anything ships externally. AM fees of ${formatUsd(snap.amFeesCents)} sit below NOI — if a pack ever shows them inside NOI, do not circulate it. ${
          snap.rollupIsNotGaap
            ? "OpCo presentation is a combined roll-up with IC/AM elimination, not a GAAP consolidation."
            : "Standalone SPE presentation."
        } Intercompany mismatches and close locks are controller items, not marketing copy. No tax filing is implied.`,
      },
    ],
  });
}

const BUILDERS: Record<AudienceId, (snap: PeriodSnapshot) => AudienceNarrative> = {
  lp: lpNarrative,
  gp: gpNarrative,
  ic: icNarrative,
  lender: lenderNarrative,
  mgmt: mgmtNarrative,
};

export function buildNarrative(snap: PeriodSnapshot, audience: AudienceId): AudienceNarrative {
  return BUILDERS[audience](snap);
}

export function buildAllNarratives(snap: PeriodSnapshot): NarrativeBundle {
  return {
    lp: lpNarrative(snap),
    gp: gpNarrative(snap),
    ic: icNarrative(snap),
    lender: lenderNarrative(snap),
    mgmt: mgmtNarrative(snap),
  };
}

export function isAudienceId(value: string): value is AudienceId {
  return (AUDIENCES as readonly string[]).includes(value);
}

export { AUDIENCES, AUDIENCE_LABELS };
