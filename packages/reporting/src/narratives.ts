import { AUDIENCE_BRIEFS, partitionAudienceKpis, type AudienceKpiId } from "./audience-briefs";
import type { ChartId } from "./charts";
import { icRecommendation, type IcAction } from "./ic-recommendation";
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

export type { IcAction };
export { icRecommendation };

export type NarrativeNoiDefinition = "period" | "t12 incomplete" | "annualized_period";

export type NarrativeCitation = {
  id: string;
  label: string;
  value: string;
  unit: string;
  source: string;
  noiDefinition?: NarrativeNoiDefinition;
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
  sharedCitations: NarrativeCitation[];
  specificCitations: NarrativeCitation[];
  chartIds: ChartId[];
  seedDisclaimer: string;
  recommendation?: { action: IcAction; rationale: string };
};

export type NarrativeBundle = Record<AudienceId, AudienceNarrative>;

function cite(
  id: string,
  label: string,
  value: string,
  unit: string,
  source: string,
  noiDefinition?: NarrativeNoiDefinition,
): NarrativeCitation {
  return { id, label, value, unit, source, noiDefinition };
}

function beCushionBps(snap: PeriodSnapshot): number | null {
  if (snap.physicalOccupancyBps === null || snap.breakevenOccupancyBps === null) return null;
  return snap.physicalOccupancyBps - snap.breakevenOccupancyBps;
}

function seedDisclaimer(snap: PeriodSnapshot): string {
  const bits: string[] = [];
  if (snap.entityCode === "SPE-WBG" || snap.entityCode === "RCP-OPCO" || snap.entityCode.startsWith("SPE-")) {
    bits.push("Seed / demo books (SPE-WBG and the two-month demo) are not a live close.");
  }
  if (!snap.t12Complete) {
    bits.push(
      `T12 is incomplete (${snap.t12MonthsAvailable}/12 months, ${formatUsd(snap.t12NoiCents)}) and is not annualized or labeled ready T12.`,
    );
  }
  bits.push("AM 6310 sits below NOI. Combined OpCo roll-up is not a GAAP consolidation. CPA tax export is not a filing.");
  return bits.join(" ");
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
  const cushion = beCushionBps(snap);
  const annualized = snap.noiCents * 12n;
  const t12Def: NarrativeNoiDefinition | undefined = snap.t12Complete ? undefined : "t12 incomplete";
  const lease =
    snap.leaseRollover12mCount === null
      ? "Missing — rent-roll lease-end dates not posted"
      : `${snap.leaseRollover12mCount} units`;
  const mom =
    snap.priorNoiCents === null
      ? "No prior month"
      : formatUsd(snap.noiCents - snap.priorNoiCents);
  return {
    noi: cite(
      "noi",
      "Period NOI",
      formatUsd(snap.noiCents),
      "USD",
      snap.t12Complete
        ? "period NOI · T12 also complete · AM fees sit below"
        : "period NOI (not T12; T12 incomplete — not annualized) · AM fees sit below",
      "period",
    ),
    noi_per_unit: cite(
      "noi_per_unit",
      "NOI / unit",
      formatUsdOrDash(snap.noiPerUnitCents),
      "USD / unit",
      "Period NOI ÷ unit count",
      "period",
    ),
    opex_ratio: cite("opex_ratio", "OpEx ratio", formatBpsAsPercent(snap.opexRatioBps), "%", "In-NOI OpEx ÷ EGI"),
    occupancy: cite(
      "occupancy",
      "Physical occupancy",
      formatBpsAsPercent(snap.physicalOccupancyBps),
      "%",
      "Rent roll occupied ÷ rentable · labeled separately from book economic occupancy",
    ),
    occ_book: cite(
      "occ_book",
      "Book economic occupancy",
      formatBpsAsPercent(snap.bookEconomicOccupancyBps),
      "%",
      "EGI ÷ GPR · labeled separately from physical occupancy",
    ),
    breakeven: cite("breakeven", "Breakeven occupancy", formatBpsAsPercent(snap.breakevenOccupancyBps), "%", "Phase D helper"),
    be_cushion: cite(
      "be_cushion",
      "BE vs physical cushion",
      cushion === null ? "—" : formatBpsAsPercent(cushion),
      "pp",
      cushion === null
        ? "Needs physical occupancy and breakeven"
        : cushion >= 0
          ? "Physical occupancy minus breakeven (cushion)"
          : "Physical occupancy is below breakeven",
    ),
    budget_variance: cite(
      "budget_variance",
      "NOI vs budget",
      snap.noiVarianceCents === null ? "No budget" : formatUsd(snap.noiVarianceCents),
      "USD",
      snap.budgetNoiCents === null ? "No monthly budget posted" : `${formatBpsAsPercent(snap.noiVarianceBps)} vs plan`,
      "period",
    ),
    cash: cite("cash", "Cash", formatUsd(snap.cashTotalCents), "USD", "GL 1010–1040"),
    btcf: cite("btcf", "BTCF", formatUsd(snap.btcfCents), "USD", "Period NOI − interest − principal"),
    cfads: cite("cfads", "CFADS", formatUsd(snap.cfadsCents), "USD", "Distributions proxy · NOI − PPE − reserve req."),
    cfads_dscr: cite(
      "cfads_dscr",
      "CFADS-DSCR",
      formatBpsAsMultiple(snap.cfadsDscrBps),
      "x",
      "CFADS ÷ (interest + principal)",
    ),
    dscr: cite(
      "dscr",
      "DSCR",
      formatBpsAsMultiple(snap.dscrBps),
      "x",
      `period NOI ÷ (interest + principal) vs ${formatBpsAsMultiple(snap.dscrThresholdBps)} · ${passFail(snap.dscrPass)}`,
      "period",
    ),
    debt_yield: cite(
      "debt_yield",
      "Debt yield",
      formatBpsAsYield(snap.debtYieldBps),
      "%",
      `vs ${formatBpsAsYield(snap.debtYieldThresholdBps)} · annualized period NOI ÷ UPB — not T12`,
      "annualized_period",
    ),
    upb: cite("upb", "Look-through UPB", formatUsd(snap.upbCents), "USD", "Loan file · not LTV"),
    debt_service: cite("debt_service", "Debt service", formatUsd(debtService), "USD", "Interest + principal this period"),
    reserves: cite("reserves", "Reserve cash", formatUsd(snap.cashReserveCents), "USD", "GL 1020 vs monthly requirement"),
    maturity: cite(
      "maturity",
      "Maturity",
      snap.maturityDate ?? "—",
      snap.monthsRemaining === null ? "—" : `${snap.monthsRemaining} mo`,
      "First-mortgage file",
    ),
    covenant_watch: cite("covenant_watch", "Covenant watchlist", watch, "—", "Fails only · DSCR / debt-yield / maturity"),
    liquidity: cite("liquidity", "Liquidity", formatMonthsCoverage(snap.liquidityMonthsHundredths), "months", "Cash ÷ period OpEx"),
    fee_income: cite("fee_income", "Fee income 7010", formatUsd(fee), "USD", "AM / OpCo fee line · below NOI on the SPE"),
    am_fees: cite("am_fees", "AM fees 6310", formatUsd(snap.amFeesCents), "USD", "Sit below NOI — proof tile"),
    ga_ratio: cite("ga_ratio", "G&A %", formatBpsAsPercent(snap.gaRatioBps), "%", "OpCo G&A ÷ fee income · not an SPE OpEx ratio"),
    look_through_noi: cite(
      "look_through_noi",
      "Look-through period NOI",
      formatUsd(lookThrough),
      "USD",
      "Property books · not a GAAP consolidation",
      "period",
    ),
    concentration: cite("concentration", "NOI concentration", conc, "%", "Look-through SPE share of period NOI"),
    controllable_opex: cite(
      "controllable_opex",
      "Controllable OpEx",
      formatUsd(snap.controllableOpexCents),
      "USD",
      `${formatBpsAsPercent(snap.controllableOpexRatioBps)} of EGI`,
    ),
    ltl: cite("ltl", "Loss-to-lease", formatUsdOrDash(snap.lossToLeaseCents), "USD", "Rent roll mark-to-market gap · not a valuation"),
    capex: cite("capex", "Period CapEx", formatUsd(snap.periodCapexCents), "USD", "PPE additions · CIP stays off NOI"),
    recommendation: cite("recommendation", "IC call", rec.action, "—", rec.rationale),
    t12_status: cite(
      "t12_status",
      "T12 status",
      snap.t12Complete ? formatUsd(snap.t12NoiCents) : `${snap.t12MonthsAvailable}/12 incomplete`,
      snap.t12Complete ? "USD" : "months",
      snap.t12Label,
      t12Def,
    ),
    annualized_noi: cite(
      "annualized_noi",
      "Annualized period NOI",
      formatUsd(annualized),
      "USD",
      "12 × period NOI — used only for debt yield. Not T12.",
      "annualized_period",
    ),
    lease_rollover: cite("lease_rollover", "Lease rollover (12m)", lease, "count", "Rent-roll lease-end dates · flagged missing when absent"),
    close_status: cite("close_status", "Period close", snap.closeStatus.replaceAll("_", " "), "—", "Period status on /close"),
    mom: cite("mom", "NOI MoM", mom, "USD", "Period NOI minus prior month · period definition", "period"),
    units: cite("units", "Units", String(snap.unitCount || "—"), "count", "Look-through unit count"),
    properties: cite("properties", "Properties", String(snap.propertyCount), "count", "SPE count in this view"),
  };
}

function citationsFor(snap: PeriodSnapshot, ids: AudienceKpiId[]): NarrativeCitation[] {
  const catalog = citationCatalog(snap);
  return ids.map((id) => catalog[id]);
}

function envelope(snap: PeriodSnapshot, audience: AudienceId, extras: Pick<AudienceNarrative, "sections" | "recommendation">): AudienceNarrative {
  const brief = AUDIENCE_BRIEFS[audience];
  const parts = partitionAudienceKpis(audience);
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
    sharedCitations: citationsFor(snap, parts.shared),
    specificCitations: citationsFor(snap, parts.specific),
    chartIds: brief.chartIds,
    seedDisclaimer: seedDisclaimer(snap),
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
    return `T12 NOI is ${formatUsd(snap.t12NoiCents)} (12/12).`;
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
  const cushion = beCushionBps(snap);
  const cushionTxt =
    cushion === null
      ? ""
      : cushion >= 0
        ? ` Physical-versus-breakeven cushion is ${formatBpsAsPercent(cushion)}.`
        : ` Physical occupancy is ${formatBpsAsPercent(-cushion)} below breakeven — a red flag.`;
  return `${phys} ${book} ${be}${cushionTxt}`;
}

function covenantFacts(snap: PeriodSnapshot): string {
  if (snap.dscrBps === null && snap.loans.length === 0) {
    return "No loan file is posted; DSCR and debt yield are not computed.";
  }
  const dscr = `DSCR is ${formatBpsAsMultiple(snap.dscrBps)} versus a ${formatBpsAsMultiple(snap.dscrThresholdBps)} threshold (${passFail(snap.dscrPass)}) — period NOI ÷ (interest + principal).`;
  const dy = `Debt yield is ${formatBpsAsYield(snap.debtYieldBps)} versus ${formatBpsAsYield(snap.debtYieldThresholdBps)} (${passFail(snap.debtYieldPass)}), using annualized period NOI — not T12.`;
  return `${dscr} ${dy}`;
}

function failsOnlyWatch(snap: PeriodSnapshot): string {
  const fails: string[] = [];
  if (snap.dscrPass === false) {
    fails.push(`DSCR ${formatBpsAsMultiple(snap.dscrBps)} vs ${formatBpsAsMultiple(snap.dscrThresholdBps)}`);
  }
  if (snap.debtYieldPass === false) {
    fails.push(`debt yield ${formatBpsAsYield(snap.debtYieldBps)} vs ${formatBpsAsYield(snap.debtYieldThresholdBps)}`);
  }
  if (snap.monthsRemaining !== null && snap.monthsRemaining < 12) {
    fails.push(`maturity in ${snap.monthsRemaining} months unaddressed`);
  }
  for (const w of snap.watchlist) fails.push(`${w.entityCode}: ${w.reason}`);
  return fails.length ? fails.join("; ") : "No covenant fails on the watchlist this period.";
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

function concentrationSentence(snap: PeriodSnapshot): string {
  if (snap.entityType === "OPCO" && snap.concentration.length) {
    const hot = snap.concentration.filter((c) => (c.shareBps ?? 0) > 4_000);
    const list = snap.concentration.map((c) => `${c.entityCode} ${formatUsd(c.noiCents)} (${formatBpsAsPercent(c.shareBps)})`).join("; ");
    const flag = hot.length ? ` Red flag: ${hot.map((c) => c.entityCode).join(", ")} above ~40% of look-through NOI.` : "";
    return `NOI concentration by SPE: ${list}.${flag}`;
  }
  return "This SPE is a single-asset file — concentration is 100% here, not a diversification claim.";
}

function problemChild(snap: PeriodSnapshot): string {
  const ranked = [...snap.concentration].sort((a, b) => {
    const aFail = a.dscrPass === false ? 1 : 0;
    const bFail = b.dscrPass === false ? 1 : 0;
    if (aFail !== bFail) return bFail - aFail;
    return (a.physicalOccupancyBps ?? 10_000) - (b.physicalOccupancyBps ?? 10_000);
  });
  const child = ranked[0];
  if (!child || snap.concentration.length <= 1) {
    return `Problem-child screen is this file (${snap.entityCode}): period NOI ${formatUsd(snap.noiCents)}, physical occupancy ${formatBpsAsPercent(snap.physicalOccupancyBps)}, controllable OpEx ${formatUsd(snap.controllableOpexCents)}, CapEx ${formatUsd(snap.periodCapexCents)} vs reserve cash ${formatUsd(snap.cashReserveCents)}.`;
  }
  return `Problem-child SPE is ${child.entityCode} (${child.entityName}): period NOI ${formatUsd(child.noiCents)}, physical occupancy ${formatBpsAsPercent(child.physicalOccupancyBps)}, DSCR ${formatBpsAsMultiple(child.dscrBps)} (${passFail(child.dscrPass)}).`;
}

function lpNarrative(snap: PeriodSnapshot): AudienceNarrative {
  const concHot = snap.concentration.some((c) => (c.shareBps ?? 0) > 4_000 && snap.entityType === "OPCO");
  return envelope(snap, "lp", {
    sections: [
      {
        heading: "NOI / NOI-unit versus plan",
        body: `${scopeClause(snap)} Look-through period NOI is ${formatUsd(snap.lookThroughNoiCents ?? snap.noiCents)} on EGI of ${formatUsd(snap.egiCents)} after GPR of ${formatUsd(snap.gprCents)}, vacancy of ${formatUsd(snap.vacancyCents)}, and concessions of ${formatUsd(snap.concessionsCents)}. NOI per unit is ${formatUsdOrDash(snap.noiPerUnitCents)} across ${snap.unitCount || "—"} units. OpEx ratio is ${formatBpsAsPercent(snap.opexRatioBps)} of EGI. ${varianceSentence(snap)} Asset-management fees of ${formatUsd(snap.amFeesCents)} sit below NOI and are not in this operating line. ${t12Sentence(snap)} ${occupancyFacts(snap)} Loss-to-lease is ${formatUsdOrDash(snap.lossToLeaseCents)}. Physical and book economic occupancy are labeled separately; do not blend them.`,
      },
      {
        heading: "Capital at risk",
        body: `${concentrationSentence(snap)}${concHot ? " Concentration above ~40% in one SPE is a red flag." : ""} Liquidity is ${formatMonthsCoverage(snap.liquidityMonthsHundredths)} of period OpEx. Look-through UPB is ${formatUsd(snap.upbCents)}; LTV is gated and is not shown as a live ratio. ${snap.ltvReason} Covenant stress (fails only): ${failsOnlyWatch(snap)}${
          snap.dscrPass === false ? " DSCR fail has no cure path on this LP page — escalate." : ""
        }${
          snap.opexRatioBps !== null && snap.noiVarianceBps !== null && snap.noiVarianceBps < -500
            ? " Unexplained OpEx pressure is in the budget variance — this update does not dump the full CoA."
            : ""
        } LTL is ${formatUsdOrDash(snap.lossToLeaseCents)}; a rising LTL without lease-up is a red flag. Delinquency is stubbed, not live. ${snap.delinquencyReason}`,
      },
      {
        heading: "Ask / next capital event",
        body: `No investor distribution subledger and no capital-call notice are posted for ${snap.period}. The book distributions proxy is CFADS of ${formatUsd(snap.cfadsCents)}${snap.waterfallApplied ? " after waterfall (RCP/GP share)" : ""} (period NOI ${formatUsd(snap.noiCents)} less period PPE additions ${formatUsd(snap.periodCapexCents)} and the monthly reserve requirement of ${formatUsd(snap.reserveRequirementCents)}). Before-tax cash flow after debt service is BTCF of ${formatUsd(snap.btcfCents)}. Ending cash is ${formatUsd(snap.cashTotalCents)}${snap.waterfallApplied ? " after waterfall" : ""}, including replacement-reserve cash of ${formatUsd(snap.cashReserveCents)}. ${snap.waterfallApplied && snap.lpPrefUnpaidCents > 0n ? `LP pref unpaid ${formatUsd(snap.lpPrefUnpaidCents)}. ` : ""}Next capital event: none scheduled on this seed — do not invent a call or refinance. This is a stewardship update, not a K-1 or tax bridge.`,
      },
    ],
  });
}

function gpNarrative(snap: PeriodSnapshot): AudienceNarrative {
  const fee =
    snap.feeIncomeCents !== null
      ? ` OpCo standalone AM fee income (7010) is ${formatUsd(snap.feeIncomeCents)}; G&A ratio is ${formatBpsAsPercent(snap.gaRatioBps)} of that fee line — not an SPE OpEx deep dive.`
      : ` SPE asset-management fees of ${formatUsd(snap.amFeesCents)} sit below NOI — they are fee income to the sponsor, not an in-NOI cost.`;
  const mismatch =
    snap.feeIncomeCents !== null && snap.feeIncomeCents > snap.noiCents
      ? " Red flag: IC/AM fee income exceeds this SPE’s period NOI."
      : "";
  const lease =
    snap.leaseRollover12mCount === null
      ? " Lease rollover is missing — rent-roll lease-end dates are not posted; flag it."
      : ` ${snap.leaseRollover12mCount} units roll in the next 12 months.`;
  const capexGap = snap.periodCapexCents - snap.cashReserveCents;
  const capexFlag =
    snap.periodCapexCents > snap.cashReserveCents
      ? ` Red flag: period CapEx ${formatUsd(snap.periodCapexCents)} exceeds reserve cash ${formatUsd(snap.cashReserveCents)} by ${formatUsd(capexGap)}.`
      : ` CapEx ${formatUsd(snap.periodCapexCents)} is inside reserve cash ${formatUsd(snap.cashReserveCents)}.`;
  return envelope(snap, "gp", {
    sections: [
      {
        heading: "Intervene this month",
        body: `${scopeClause(snap)} ${problemChild(snap)} ${varianceSentence(snap)} Controllable OpEx is ${formatUsd(snap.controllableOpexCents)} (${formatBpsAsPercent(snap.controllableOpexRatioBps)} of EGI) — a spike here is the site lever, not a lender memo. ${occupancyFacts(snap)} LTL ${formatUsdOrDash(snap.lossToLeaseCents)}.${lease} ${capexFlag} CFADS ${formatUsd(snap.cfadsCents)}. Do not lead with DSCR/maturity jargon; those are watchlist reason codes only: ${failsOnlyWatch(snap)}`,
      },
      {
        heading: "Fee income / OpCo burn versus property",
        body: `${fee}${mismatch} Property period NOI is ${formatUsd(snap.noiCents)}; liquidity on the books is ${formatUsd(snap.cashTotalCents)} (${formatMonthsCoverage(snap.liquidityMonthsHundredths)} of OpEx). ${
          snap.lookThroughNoiCents !== null
            ? `Look-through property NOI is ${formatUsd(snap.lookThroughNoiCents)}.`
            : "This is a standalone SPE book."
        }${
          snap.combinedRollupNoiCents !== null
            ? ` Combined roll-up NOI is ${formatUsd(snap.combinedRollupNoiCents)} after IC/AM elimination — not a GAAP consolidation.`
            : ""
        } Fee income is not property cash.`,
      },
      {
        heading: "Problem-child SPE",
        body: `${problemChild(snap)} Per-SPE scorecard: ${
          snap.concentration.length
            ? snap.concentration
                .map(
                  (c) =>
                    `${c.entityCode} NOI ${formatUsd(c.noiCents)}, occ ${formatBpsAsPercent(c.physicalOccupancyBps)}, OpEx ${formatBpsAsPercent(c.opexRatioBps)}`,
                )
                .join("; ")
            : `${snap.entityCode} NOI ${formatUsd(snap.noiCents)}, occ ${formatBpsAsPercent(snap.physicalOccupancyBps)}, OpEx ${formatBpsAsPercent(snap.opexRatioBps)}`
        }. Watchlist reason codes (fails only): ${failsOnlyWatch(snap)} No tax M-1 and no invented delinquency. ${snap.delinquencyReason}`,
      },
    ],
  });
}

function icNarrative(snap: PeriodSnapshot): AudienceNarrative {
  const rec = icRecommendation(snap);
  const annualized = snap.noiCents * 12n;
  const conc = concentrationSentence(snap);
  return envelope(snap, "ic", {
    recommendation: rec,
    sections: [
      {
        heading: "Go / hold / kill",
        body: `${rec.action}: ${rec.rationale} Decision box — GO / HOLD / KILL. Conditions: keep period, T12, and annualized labels unmixed; do not underwrite on silent annualization; LTV stays gated without appraisal. Support: period NOI ${formatUsd(snap.noiCents)}, DSCR ${formatBpsAsMultiple(snap.dscrBps)}, debt yield ${formatBpsAsYield(snap.debtYieldBps)}, physical occupancy ${formatBpsAsPercent(snap.physicalOccupancyBps)}, BE cushion ${formatBpsAsPercent(beCushionBps(snap))}, LTL ${formatUsdOrDash(snap.lossToLeaseCents)}, maturity ${snap.monthsRemaining ?? "—"} months, strategy ${snap.strategy ? snap.strategy.replaceAll("_", " ") : "unlabeled"}.`,
      },
      {
        heading: "Period versus T12 versus annualized",
        body: `${scopeClause(snap)} Definitions are locked: (1) period NOI ${formatUsd(snap.noiCents)} for this month; (2) ${t12Sentence(snap)}; (3) annualized period NOI ${formatUsd(annualized)} is used only as the debt-yield numerator — it is not T12. ${varianceSentence(snap)} ${occupancyFacts(snap)} ${conc} Look-through UPB ${formatUsd(snap.upbCents)} is a stack, not an LTV. ${snap.ltvReason}`,
      },
      {
        heading: "Falsifiers",
        body: `What kills or holds the thesis: silent T12 annualization; covenant breach with no mitigation (${failsOnlyWatch(snap)}); concentration plus weak occupancy; definition drift (calling annualized period NOI a T12). A DSCR print below ${formatBpsAsMultiple(snap.dscrThresholdBps)}, physical occupancy below breakeven ${formatBpsAsPercent(snap.breakevenOccupancyBps)}, or an unlabeled T12 would move this file toward HOLD or KILL. Path-dependency: the two-month demo cannot become a T12 by multiplying. Delinquency is stubbed. ${snap.delinquencyReason} No marketing fluff.`,
      },
    ],
  });
}

function lenderNarrative(snap: PeriodSnapshot): AudienceNarrative {
  const debtService = snap.interestCents + snap.principalCents;
  const glDebt = snap.glDebtCents;
  const upbMismatch =
    glDebt !== null && glDebt !== snap.upbCents
      ? ` Red flag: loan-file UPB ${formatUsd(snap.upbCents)} ≠ GL 2110+2210 ${formatUsd(glDebt)}.`
      : glDebt !== null
        ? ` Loan-file UPB ties to GL 2110+2210 ${formatUsd(glDebt)}.`
        : "";
  const reserveUnder =
    snap.cashReserveCents < snap.reserveRequirementCents
      ? ` Red flag: reserve cash ${formatUsd(snap.cashReserveCents)} underfunds the ${formatUsd(snap.reserveRequirementCents)} monthly requirement.`
      : ` Reserve cash ${formatUsd(snap.cashReserveCents)} covers the ${formatUsd(snap.reserveRequirementCents)} monthly requirement.`;
  const occBelow =
    snap.physicalOccupancyBps !== null &&
    snap.breakevenOccupancyBps !== null &&
    snap.physicalOccupancyBps < snap.breakevenOccupancyBps;
  return envelope(snap, "lender", {
    sections: [
      {
        heading: "In covenant?",
        body: `${covenantFacts(snap)} Covenant watchlist is the primary exhibit (fails only): ${failsOnlyWatch(snap)} Period NOI of ${formatUsd(snap.noiCents)} is the DSCR numerator; debt yield uses annualized period NOI against UPB of ${formatUsd(snap.upbCents)}. ${t12Sentence(snap)} This is a credit memo, not an LP update. OpCo fee income is not property cash and is not in this coverage stack.`,
      },
      {
        heading: "Cure path",
        body: `${
          snap.dscrPass === false
            ? `DSCR is below threshold — there is no posted cure (equity, rate relief, or principal paydown) on this file. State a cure or treat as uncured.`
            : snap.debtYieldPass === false
              ? `Debt yield is below threshold. No cure is posted.`
              : `No coverage fail this period; no cure is required.`
        } Reported UPB is ${formatUsd(snap.upbCents)} across ${snap.loans.length || 0} first-mortgage file${snap.loans.length === 1 ? "" : "s"}.${upbMismatch} Period debt service is ${formatUsd(debtService)} (interest ${formatUsd(snap.interestCents)} + principal ${formatUsd(snap.principalCents)}). Maturity ${snap.maturityDate ?? "—"} (${snap.monthsRemaining ?? "—"} months remaining).${
          snap.monthsRemaining !== null && snap.monthsRemaining < 12 ? " Red flag: maturity inside 12 months is unaddressed." : ""
        } LTV is not stated: ${snap.ltvReason} ${reserveUnder} Period PPE additions ${formatUsd(snap.periodCapexCents)} versus reserve cash — collateral-preserving uses only.`,
      },
      {
        heading: "Collateral operations",
        body: `${occupancyFacts(snap)}${occBelow ? " Red flag: breakeven exceeds physical occupancy." : ""} Cash ${formatUsd(snap.cashTotalCents)} (operating ${formatUsd(snap.cashOperatingCents)}, reserve 1020 ${formatUsd(snap.cashReserveCents)}, escrow ${formatUsd(snap.cashEscrowCents)}). CFADS ${formatUsd(snap.cfadsCents)}; CFADS-DSCR ${formatBpsAsMultiple(snap.cfadsDscrBps)}. Delinquency is not available from GL 1110. ${snap.delinquencyReason} No tax / K-1 language.`,
      },
    ],
  });
}

function mgmtNarrative(snap: PeriodSnapshot): AudienceNarrative {
  const icNote =
    snap.combinedNote ??
    (snap.rollupIsNotGaap
      ? "OpCo presentation is a combined roll-up with IC/AM elimination, not a GAAP consolidation."
      : "Standalone SPE — no IC eliminate on this book.");
  const vault =
    snap.vaultDocCount === null
      ? "Vault status is not on this snapshot."
      : `${snap.vaultDocCount} vault document${snap.vaultDocCount === 1 ? "" : "s"} on file.`;
  const jobs =
    snap.schedulerJobCount === null
      ? "Scheduler status is not on this snapshot."
      : `${snap.schedulerJobCount} scheduler job${snap.schedulerJobCount === 1 ? "" : "s"} attached.`;
  const mom =
    snap.priorNoiCents === null
      ? "No prior-month NOI is posted for a MoM bridge."
      : `MoM period NOI change is ${formatUsd(snap.noiCents - snap.priorNoiCents)} (prior ${formatUsd(snap.priorNoiCents)}).`;
  return envelope(snap, "mgmt", {
    sections: [
      {
        heading: "Books close clean?",
        body: `${scopeClause(snap)} Period close status is ${snap.closeStatus.replaceAll("_", " ")}. Close the books on /close for ${snap.entityCode} ${snap.period} before anything ships. AM fees of ${formatUsd(snap.amFeesCents)} sit below NOI — if a pack ever shows them inside NOI, do not circulate it (AM-above-NOI is a close breach). ${icNote} ${vault} ${jobs} ${failsOnlyWatch(snap)} Gated LTV/delinquency stay stubbed — do not show them as live KPIs.`,
      },
      {
        heading: "Combined coherent?",
        body: `${
          snap.rollupIsNotGaap
            ? `Look-through NOI ${formatUsd(snap.lookThroughNoiCents ?? snap.noiCents)}; combined roll-up NOI ${formatUsd(snap.combinedRollupNoiCents ?? 0n)} after IC eliminate. Label it combined, never consol.`
            : `Standalone SPE period NOI ${formatUsd(snap.noiCents)}. No combined roll-up on this view.`
        } ${varianceSentence(snap)} ${mom} Assigned variance owners: ${largestVariances(snap, 4)}. ${concentrationSentence(snap)} Portfolio scoreboard: ${snap.propertyCount} propert${snap.propertyCount === 1 ? "y" : "ies"}, ${snap.unitCount || "—"} units, physical occupancy ${formatBpsAsPercent(snap.physicalOccupancyBps)}. Intercompany mismatches and close locks are controller items.`,
      },
      {
        heading: "What ships externally?",
        body: `External ship list this period: LP stewardship pack (not a CoA dump), lender covenant memo (not an LP letter), IC go/hold/kill memo. Do not ship marketing copy, a GAAP consolidation claim, or tax-filing language. CPA tax export is not a filing. ${t12Sentence(snap)} Watchlist that would block a ship: ${failsOnlyWatch(snap)}`,
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
