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
  entityCode: string;
  entityName: string;
  period: string;
  viewLabel: string;
  sections: NarrativeSection[];
  citations: NarrativeCitation[];
  recommendation?: { action: IcAction; rationale: string };
};

export type NarrativeBundle = Record<AudienceId, AudienceNarrative>;

function cite(id: string, label: string, value: string, unit: string, source: string): NarrativeCitation {
  return { id, label, value, unit, source };
}

function commonCitations(snap: PeriodSnapshot): NarrativeCitation[] {
  return [
    cite("noi", "Period NOI", formatUsd(snap.noiCents), "USD", "GL EGI − in-NOI OpEx"),
    cite("egi", "EGI", formatUsd(snap.egiCents), "USD", "GPR − vacancy − concessions + other income"),
    cite("gpr", "GPR", formatUsd(snap.gprCents), "USD", "GL 4010"),
    cite("opex", "OpEx", formatUsd(snap.opexCents), "USD", "In-NOI operating expenses"),
    cite("opex_ratio", "OpEx ratio", formatBpsAsPercent(snap.opexRatioBps), "%", "OpEx ÷ EGI"),
    cite("btcf", "BTCF", formatUsd(snap.btcfCents), "USD", "Period NOI − interest − principal"),
    cite("cfads", "CFADS", formatUsd(snap.cfadsCents), "USD", "Period NOI − PPE additions − reserve requirement"),
    cite("dscr", "DSCR", formatBpsAsMultiple(snap.dscrBps), "x", "Period NOI ÷ (interest + principal)"),
    cite("debt_yield", "Debt yield", formatBpsAsYield(snap.debtYieldBps), "%", "Annualized period NOI ÷ UPB"),
    cite("occ_phys", "Physical occupancy", formatBpsAsPercent(snap.physicalOccupancyBps), "%", "Rent roll occupied ÷ rentable"),
    cite("occ_book", "Book economic occupancy", formatBpsAsPercent(snap.bookEconomicOccupancyBps), "%", "EGI ÷ GPR"),
    cite("breakeven", "Breakeven occupancy", formatBpsAsPercent(snap.breakevenOccupancyBps), "%", "Phase D helper"),
    cite("cash", "Cash", formatUsd(snap.cashTotalCents), "USD", "GL 1010–1040"),
    cite("upb", "UPB", formatUsd(snap.upbCents), "USD", "Loan file"),
    cite("t12", "T12 NOI", `${formatUsd(snap.t12NoiCents)} · ${snap.t12MonthsAvailable}/12 mo`, "USD", snap.t12Label),
    cite("ltv", "LTV", "Gated", "—", snap.ltvReason),
    cite("delq", "Delinquency", "Not available", "—", snap.delinquencyReason),
  ];
}

function scopeSentence(snap: PeriodSnapshot): string {
  const units = snap.unitCount ? ` ${snap.unitCount} units` : "";
  const strategy = snap.strategy ? ` ${snap.strategy.replaceAll("_", " ")}` : "";
  const rollup = snap.rollupIsNotGaap
    ? ` Figures are look-through property books unless labeled combined roll-up; the combined roll-up is not a GAAP consolidation.`
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

function occupancySentence(snap: PeriodSnapshot): string {
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

function covenantSentence(snap: PeriodSnapshot): string {
  if (snap.dscrBps === null && snap.loans.length === 0) {
    return "No loan file is posted; DSCR and debt yield are not computed.";
  }
  const dscr = `DSCR is ${formatBpsAsMultiple(snap.dscrBps)} versus a ${formatBpsAsMultiple(snap.dscrThresholdBps)} threshold (${passFail(snap.dscrPass)}).`;
  const dy = `Debt yield is ${formatBpsAsYield(snap.debtYieldBps)} versus ${formatBpsAsYield(snap.debtYieldThresholdBps)} (${passFail(snap.debtYieldPass)}), using annualized period NOI — not T12.`;
  const mat = snap.maturityDate
    ? ` First-mortgage UPB is ${formatUsd(snap.upbCents)}, maturing ${snap.maturityDate} (${snap.monthsRemaining ?? "—"} months remaining).`
    : "";
  return `${dscr} ${dy}${mat}`;
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
    return { action: "FIX", rationale: `Fix: ${reasons || "coverage or occupancy shortfall"}. Value-add monthly DSCR below 1.25x is a control result, not a data error.` };
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
  const rec = icRecommendation(snap);
  return {
    audience: "lp",
    audienceLabel: AUDIENCE_LABELS.lp,
    title: "Limited Partner report",
    dek: "Period performance, cash available as a distributions proxy, risk, and operating health.",
    entityCode: snap.entityCode,
    entityName: snap.entityName,
    period: snap.period,
    viewLabel: snap.viewLabel,
    citations: commonCitations(snap),
    sections: [
      {
        heading: "Performance",
        body: `${scopeSentence(snap)} Period NOI is ${formatUsd(snap.noiCents)} on EGI of ${formatUsd(snap.egiCents)} after GPR of ${formatUsd(snap.gprCents)}, vacancy of ${formatUsd(snap.vacancyCents)}, and concessions of ${formatUsd(snap.concessionsCents)}. ${varianceSentence(snap)} NOI per unit is ${formatUsdOrDash(snap.noiPerUnitCents)}. Asset-management fees of ${formatUsd(snap.amFeesCents)} sit below NOI. ${t12Sentence(snap)}`,
      },
      {
        heading: "Distributions proxy",
        body: `No investor distribution subledger is posted. The book distributions proxy is CFADS of ${formatUsd(snap.cfadsCents)} (period NOI ${formatUsd(snap.noiCents)} less period PPE additions ${formatUsd(snap.periodCapexCents)} and the monthly reserve requirement of ${formatUsd(snap.reserveRequirementCents)}). Before-tax cash flow after debt service is BTCF of ${formatUsd(snap.btcfCents)} (NOI less interest ${formatUsd(snap.interestCents)} and principal ${formatUsd(snap.principalCents)}). Ending cash is ${formatUsd(snap.cashTotalCents)}, including replacement-reserve cash of ${formatUsd(snap.cashReserveCents)}.`,
      },
      {
        heading: "Risk",
        body: `${covenantSentence(snap)} ${snap.watchlist.length ? `Covenant watchlist: ${snap.watchlist.map((w) => `${w.entityCode} ${w.reason}`).join("; ")}.` : "No additional covenant watch items."} LTV remains gated — ${snap.ltvReason} Delinquency is not available — ${snap.delinquencyReason} IC posture on this file is ${rec.action}.`,
      },
      {
        heading: "Operating health",
        body: `${occupancySentence(snap)} In-NOI OpEx is ${formatUsd(snap.opexCents)} (${formatBpsAsPercent(snap.opexRatioBps)} of EGI). Controllable OpEx is ${formatUsd(snap.controllableOpexCents)} (${formatBpsAsPercent(snap.controllableOpexRatioBps)} of EGI). Loss-to-lease is ${formatUsdOrDash(snap.lossToLeaseCents)} on the current rent roll.`,
      },
    ],
  };
}

function gpNarrative(snap: PeriodSnapshot): AudienceNarrative {
  const fee =
    snap.feeIncomeCents !== null
      ? ` OpCo standalone AM fee income is ${formatUsd(snap.feeIncomeCents)}; G&A ratio is ${formatBpsAsPercent(snap.gaRatioBps)} of that fee line.`
      : "";
  return {
    audience: "gp",
    audienceLabel: AUDIENCE_LABELS.gp,
    title: "General Partner report",
    dek: "Value creation, operator accountability, and capital allocation.",
    entityCode: snap.entityCode,
    entityName: snap.entityName,
    period: snap.period,
    viewLabel: snap.viewLabel,
    citations: commonCitations(snap),
    sections: [
      {
        heading: "Value creation",
        body: `${scopeSentence(snap)} Period NOI ${formatUsd(snap.noiCents)} and BTCF ${formatUsd(snap.btcfCents)} are the current-period value engines. ${occupancySentence(snap)} Loss-to-lease of ${formatUsdOrDash(snap.lossToLeaseCents)} is the mark-to-market rent gap on occupied units — not LTV. ${varianceSentence(snap)} ${t12Sentence(snap)}`,
      },
      {
        heading: "Operator accountability",
        body: `Controllable OpEx is ${formatUsd(snap.controllableOpexCents)} (${formatBpsAsPercent(snap.controllableOpexRatioBps)} of EGI ${formatUsd(snap.egiCents)}). Total in-NOI OpEx is ${formatUsd(snap.opexCents)} (${formatBpsAsPercent(snap.opexRatioBps)} of EGI). Largest budget variances: ${largestVariances(snap)}.${fee} AM fees of ${formatUsd(snap.amFeesCents)} remain below NOI.`,
      },
      {
        heading: "Capital allocation",
        body: `Period PPE additions are ${formatUsd(snap.periodCapexCents)} against replacement-reserve cash of ${formatUsd(snap.cashReserveCents)} and a monthly reserve requirement of ${formatUsd(snap.reserveRequirementCents)}. CFADS available after those uses is ${formatUsd(snap.cfadsCents)}. CapEx register: ${
          snap.capexProjects.length
            ? snap.capexProjects
                .map((p) => `${p.name} (${p.entityCode}, ${p.classification} / ${p.status}) spent ${formatUsd(p.spentCents)} of ${formatUsd(p.budgetCents)}`)
                .join("; ")
            : "no open projects on this entity"
        }. Liquidity coverage is ${formatMonthsCoverage(snap.liquidityMonthsHundredths)} of period OpEx.`,
      },
    ],
  };
}

function icNarrative(snap: PeriodSnapshot): AudienceNarrative {
  const rec = icRecommendation(snap);
  const combined =
    snap.combinedNote ??
    (snap.lookThroughNoiCents !== null && snap.combinedRollupNoiCents !== null
      ? `Look-through property NOI ${formatUsd(snap.lookThroughNoiCents)}; combined roll-up NOI ${formatUsd(snap.combinedRollupNoiCents)} after IC/AM elimination — not a GAAP consolidation.`
      : "");
  const conc = snap.concentration.length
    ? snap.concentration
        .map((c) => `${c.entityCode} ${formatUsd(c.noiCents)} (${formatBpsAsPercent(c.shareBps)})`)
        .join("; ")
    : `${snap.entityCode} ${formatUsd(snap.noiCents)} (100.00%)`;
  return {
    audience: "ic",
    audienceLabel: AUDIENCE_LABELS.ic,
    title: "Investment Committee memo",
    dek: "Thesis tracking, risks, covenants, and go / hold / fix support.",
    entityCode: snap.entityCode,
    entityName: snap.entityName,
    period: snap.period,
    viewLabel: snap.viewLabel,
    citations: commonCitations(snap),
    recommendation: rec,
    sections: [
      {
        heading: "Thesis tracking",
        body: `${scopeSentence(snap)} ${varianceSentence(snap)} Period NOI ${formatUsd(snap.noiCents)} / unit ${formatUsdOrDash(snap.noiPerUnitCents)}. ${occupancySentence(snap)} ${combined} NOI concentration: ${conc}.`,
      },
      {
        heading: "Risks",
        body: `${t12Sentence(snap)} LTV is gated and is not computed from book cost. ${snap.ltvReason} Delinquency is stubbed. ${snap.delinquencyReason} Concentration above 50% of look-through NOI is a single-asset dependency, not a diversification claim.`,
      },
      {
        heading: "Covenants",
        body: `${covenantSentence(snap)} Watchlist: ${
          snap.watchlist.length
            ? snap.watchlist.map((w) => `${w.entityCode} / ${w.lenderName}: ${w.reason} (DSCR ${w.dscrDisplay}, debt yield ${w.debtYieldDisplay})`).join("; ")
            : "none"
        }. CFADS / DSCR is ${formatBpsAsMultiple(snap.cfadsDscrBps)} on CFADS ${formatUsd(snap.cfadsCents)}.`,
      },
      {
        heading: "Go / hold / fix",
        body: `${rec.action}: ${rec.rationale} Support figures: NOI ${formatUsd(snap.noiCents)}, DSCR ${formatBpsAsMultiple(snap.dscrBps)}, debt yield ${formatBpsAsYield(snap.debtYieldBps)}, physical occupancy ${formatBpsAsPercent(snap.physicalOccupancyBps)}, CFADS ${formatUsd(snap.cfadsCents)}.`,
      },
    ],
  };
}

function lenderNarrative(snap: PeriodSnapshot): AudienceNarrative {
  return {
    audience: "lender",
    audienceLabel: AUDIENCE_LABELS.lender,
    title: "Lender report",
    dek: "Collateral, DSCR / debt yield, reserves, and covenant compliance.",
    entityCode: snap.entityCode,
    entityName: snap.entityName,
    period: snap.period,
    viewLabel: snap.viewLabel,
    citations: commonCitations(snap),
    sections: [
      {
        heading: "Collateral",
        body: `${scopeSentence(snap)} Reported UPB is ${formatUsd(snap.upbCents)} across ${snap.loans.length || 0} first-mortgage file${snap.loans.length === 1 ? "" : "s"}. Maturity ${snap.maturityDate ?? "—"} (${snap.monthsRemaining ?? "—"} months). LTV is not stated: ${snap.ltvReason} Collateral discussion is limited to units, occupancy, and book cash — not an appraisal.`,
      },
      {
        heading: "DSCR and debt yield",
        body: `${covenantSentence(snap)} Period NOI of ${formatUsd(snap.noiCents)} covers interest ${formatUsd(snap.interestCents)} and principal ${formatUsd(snap.principalCents)}. CFADS is ${formatUsd(snap.cfadsCents)}; CFADS / debt service is ${formatBpsAsMultiple(snap.cfadsDscrBps)}. ${t12Sentence(snap)}`,
      },
      {
        heading: "Reserves",
        body: `Replacement-reserve cash (GL 1020) is ${formatUsd(snap.cashReserveCents)} against a monthly requirement of ${formatUsd(snap.reserveRequirementCents)}. Period PPE additions are ${formatUsd(snap.periodCapexCents)}. Escrow / impound cash is ${formatUsd(snap.cashEscrowCents)}; security-deposit cash is ${formatUsd(snap.cashDepositsCents)}. Total cash ${formatUsd(snap.cashTotalCents)} is a GL position, not a bank reconciliation.`,
      },
      {
        heading: "Covenant compliance",
        body: `DSCR ${passFail(snap.dscrPass)}; debt yield ${passFail(snap.debtYieldPass)}. ${occupancySentence(snap)} ${
          snap.watchlist.length
            ? `Flags: ${snap.watchlist.map((w) => `${w.entityCode} ${w.reason}`).join("; ")}.`
            : "No maturity-inside-12-months or covenant-fail flags beyond the ratios above."
        } ${snap.rollupIsNotGaap ? "OpCo presentation is a combined roll-up, not a GAAP consolidation." : ""} Delinquency is not available from GL 1110.`,
      },
    ],
  };
}

function mgmtNarrative(snap: PeriodSnapshot): AudienceNarrative {
  const occGap =
    snap.physicalOccupancyBps !== null && snap.breakevenOccupancyBps !== null
      ? snap.physicalOccupancyBps - snap.breakevenOccupancyBps
      : null;
  const capexPriority = snap.capexProjects.length
    ? snap.capexProjects
        .slice()
        .sort((a, b) => (a.spentCents === b.spentCents ? 0 : a.spentCents > b.spentCents ? -1 : 1))
        .map((p) => `${p.name} (${p.classification}, ${p.status}) ${formatUsd(p.spentCents)} spent / ${formatUsd(p.budgetCents)} budget`)
        .join("; ")
    : `Period PPE additions ${formatUsd(snap.periodCapexCents)} with reserve cash ${formatUsd(snap.cashReserveCents)}`;
  return {
    audience: "mgmt",
    audienceLabel: AUDIENCE_LABELS.mgmt,
    title: "Management flash",
    dek: "Operating actions, variance owners, and maintenance / CapEx priorities.",
    entityCode: snap.entityCode,
    entityName: snap.entityName,
    period: snap.period,
    viewLabel: snap.viewLabel,
    citations: commonCitations(snap),
    sections: [
      {
        heading: "Operating actions",
        body: `${scopeSentence(snap)} ${occupancySentence(snap)} Vacancy loss is ${formatUsd(snap.vacancyCents)} and concessions are ${formatUsd(snap.concessionsCents)} on GPR ${formatUsd(snap.gprCents)}. ${
          occGap === null
            ? "Hold occupancy at or above breakeven once both figures are available."
            : occGap >= 0
              ? `Physical occupancy is ${formatBpsAsPercent(occGap)} above breakeven; defend in-place rent and limit new concessions.`
              : `Physical occupancy is ${formatBpsAsPercent(-occGap)} below breakeven; priority is leased occupancy and concession discipline.`
        } Period NOI ${formatUsd(snap.noiCents)}; BTCF ${formatUsd(snap.btcfCents)}.`,
      },
      {
        heading: "Variance owners",
        body: `${varianceSentence(snap)} Assigned variance owners this period: ${largestVariances(snap, 4)}. Controllable OpEx ${formatUsd(snap.controllableOpexCents)} is the site-manageable bucket (payroll, R&M, utilities, contracts, marketing, admin, other). Insurance and real-estate taxes stay non-controllable.`,
      },
      {
        heading: "Maintenance and CapEx priorities",
        body: `${capexPriority}. Fund the ${formatUsd(snap.reserveRequirementCents)} monthly reserve requirement from operations when CFADS of ${formatUsd(snap.cfadsCents)} allows; reserve cash on the books is ${formatUsd(snap.cashReserveCents)}. R&M inside OpEx is the 5210 line. CIP remains on 1460 until placed in service — do not expense value-add interiors through NOI.`,
      },
    ],
  };
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
