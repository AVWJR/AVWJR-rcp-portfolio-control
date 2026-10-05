import {
  concessionNote,
  describePlan,
  exposureNote,
  floorPlanRows,
  leaseLadder,
  observationNote,
  vacancyRows,
  type PlanFacts,
} from "./analyze";
import {
  NOT_AVAILABLE,
  observationIsStale,
  paybackMonths,
  presentBps,
  presentCents,
  whatChanged,
  type ChangeRow,
  type ScoreSnapshot,
} from "./formulas";
import { PMS_NOTE, TARGET_NOTE } from "./policy";
import type { loadStoredPlan } from "./load";

type Stored = Awaited<ReturnType<typeof loadStoredPlan>>;

export type BudgetRow = { label: string; code: string | null; actual: bigint | null; budget: bigint | null };

function money(cents: bigint | null | undefined, zeroNote?: string): string {
  if (cents == null) return NOT_AVAILABLE;
  if (cents === 0n && zeroNote) return `${presentCents(cents)} — ${zeroNote}`;
  return presentCents(cents);
}

function snapshotsFrom(events: Stored["events"]): ScoreSnapshot[] {
  const rows: ScoreSnapshot[] = [];
  for (const event of events) {
    if (event.kind !== "PLAN_ANALYZED" || !event.afterJson) continue;
    try {
      rows.push(JSON.parse(event.afterJson) as ScoreSnapshot);
    } catch {
      continue;
    }
  }
  return rows;
}

export function buildPageModel(opts: {
  name: string;
  code: string;
  owned: boolean;
  canEdit: boolean;
  facts: PlanFacts;
  stored: Stored;
  dealUnitCountLabel: string;
  budgetRows: BudgetRow[];
}) {
  const analysis = describePlan(opts.facts);
  const plans = floorPlanRows(opts.facts);
  const vacant = vacancyRows(opts.facts);
  const ladder = leaseLadder(opts.facts);
  const saved = snapshotsFrom(opts.stored.events);
  const previous = saved.length >= 2 ? saved[saved.length - 2] ?? null : null;
  const latest = saved.at(-1) ?? null;
  const changed: ChangeRow[] = latest ? whatChanged(previous, latest) : [];
  const turns = vacant.filter((row) => row.turnDays != null);

  return {
    name: opts.name,
    code: opts.code,
    owned: opts.owned,
    canEdit: opts.canEdit && opts.owned,
    periodLabel: opts.facts.periodLabel,
    status: opts.stored.status === "ANALYZED" ? "Analyzed" : "Not saved yet",
    lastAnalyzed: opts.stored.lastAnalyzedAt ? opts.stored.lastAnalyzedAt.toISOString().slice(0, 10) : "No saved score yet",
    blendVersion: opts.stored.blendMethodVersion ?? analysis.blend.version,
    blendStatement: analysis.blend.statement,
    unitCount: opts.dealUnitCountLabel,
    rentable: analysis.rentableCount == null ? NOT_AVAILABLE : String(analysis.rentableCount),
    summary: `This plan looks at four levers for ${opts.name}: occupancy, rent versus the rent-roll market, other income, and payroll or controllable expenses. It ranks by dollars, then by RevPAU. It does not change rents or the books.`,
    targetNote: TARGET_NOTE,
    businessPlan: opts.facts.businessPlanNote,
    pmsNote: PMS_NOTE,
    revpau: presentCents(analysis.revpau),
    revpauSource: analysis.revenueSource,
    noiMargin: presentBps(analysis.margin),
    noiMarginSource: opts.facts.booksActive ? "Period NOI ÷ period EGI." : "No income-statement activity this period.",
    illustrative: presentCents(analysis.illustrative.cents),
    illustrativeNote: analysis.illustrative.note,
    levers: [
      { title: "Occupancy", dollars: presentCents(analysis.vacancy), source: analysis.roll ? `Vacancy loss on the rent roll as of ${opts.facts.rentRollAsOf ?? "date not on file"}` : "Rent roll not on file", detail: analysis.occupancyBps == null ? NOT_AVAILABLE : `Physical occupancy ${presentBps(analysis.occupancyBps)}` },
      { title: "Rent versus market", dollars: presentCents(analysis.ltl), source: analysis.roll ? `Floored loss-to-lease on the rent roll as of ${opts.facts.rentRollAsOf ?? "date not on file"}` : "Rent roll not on file", detail: `Signed ${presentCents(analysis.signed)}` },
      { title: "Other income", dollars: presentCents(analysis.otherPerOccupied), source: opts.facts.booksActive ? `Other income per occupied unit · ${opts.facts.periodLabel}` : "No income-statement activity this period", detail: "Per occupied unit" },
      { title: "Payroll and controllable expenses", dollars: presentCents(analysis.payrollPer), source: opts.facts.booksActive ? `Payroll per unit · ${opts.facts.periodLabel}` : "No income-statement activity this period", detail: `Controllable opex per unit ${presentCents(analysis.opexPer)}` },
    ],
    recommendations: analysis.recommendations.map((row) => ({
      title: row.title,
      reason: row.reason,
      impact: presentCents(row.impactCents),
      revpau: presentCents(row.revpauDeltaCents),
      confidence: row.confidence === "COMPLETE" ? "Figures complete" : row.confidence === "PARTIAL" ? "Partial — some inputs are missing" : "Missing data",
      source: row.sourceLabel,
      status: row.status,
    })),
    changed,
    changedNote: latest ? "What changed compares saved scores. The baseline above is live for the selected period." : "No saved score yet. Enter a weekly update to log what changed.",
    observationNote: observationNote(opts.facts.observations.length),
    observations: opts.facts.observations.map((row) => ({
      id: row.id,
      source: row.sourceName,
      type: row.sourceType,
      geography: row.geography,
      floorplan: row.floorplan ?? "Property",
      value: presentCents(row.valueCents),
      range: row.rangeLowCents == null && row.rangeHighCents == null ? NOT_AVAILABLE : `${presentCents(row.rangeLowCents)} to ${presentCents(row.rangeHighCents)}`,
      trend: row.trendNote ?? NOT_AVAILABLE,
      specials: row.specialsNote ?? NOT_AVAILABLE,
      asOf: row.asOfDate || NOT_AVAILABLE,
      vintage: row.vintageDate ?? "Release date not supplied",
      retrieved: row.retrievedAt || NOT_AVAILABLE,
      terms: row.termsNote,
      stale: observationIsStale(row.asOfDate, opts.facts.periodEnd),
    })),
    floorplans: plans.map((row) => ({
      floorplan: row.floorplan,
      units: String(row.units),
      occupied: String(row.occupied),
      vacant: String(row.vacant),
      inPlace: presentCents(row.inPlaceAverageCents),
      market: presentCents(row.rentRollMarketAverageCents),
      concession: presentCents(row.concessionCents),
      lossToLease: presentCents(row.lossToLeaseCents),
      lease: row.leaseEnd ? `Through ${row.leaseEnd}` : "No lease-end date",
      recommendation: row.recommendation,
    })),
    exposure: exposureNote(),
    concessionNote: concessionNote(),
    vacant: vacant.map((row) => ({
      unitCode: row.unitCode,
      floorplan: row.floorplan,
      status: row.status === "DOWN" ? "Down" : "Vacant",
      days: row.daysVacant == null ? NOT_AVAILABLE : String(row.daysVacant),
      ready: row.readyDate ?? NOT_AVAILABLE,
      lostPerDay: presentCents(row.lostRentPerDayCents),
      fix: row.fix,
      evidence: row.evidence,
    })),
    ladder,
    turns: turns.length
      ? `${turns.length} unit${turns.length === 1 ? "" : "s"} with a move-out and a later move-in on the snapshot.`
      : "Move-out and ready dates are not both on file, so turn time is not calculated.",
    makeReady: money(opts.facts.makeReadyCents, "nothing posted to 5220 this period"),
    makeReadySource: opts.facts.booksActive ? "Account 5220 this period. Not split by unit." : "No income-statement activity this period.",
    badDebt: money(opts.facts.badDebtCents, "nothing posted to 4050 this period"),
    arControl: opts.facts.arControlCents == null ? NOT_AVAILABLE : `${presentCents(opts.facts.arControlCents)} — balance-sheet control total 1110. Not a delinquency rate and not a unit list.`,
    collectionsNote: "Aging buckets are not on file. Unit balances are not shown.",
    incomeLines: (opts.facts.otherIncomeLines ?? []).map((row) => ({
      code: row.code,
      label: row.label,
      amount: money(row.cents, "nothing posted to this account this period"),
    })),
    utilityLines: (opts.facts.utilityLines ?? []).map((row) => ({
      code: row.code,
      label: row.label,
      amount: money(row.cents, "nothing posted to this account this period"),
    })),
    recovery: presentBps(analysis.recovery),
    booksNote: opts.facts.booksActive ? null : "No income-statement activity this period. Account lines are not shown as zero.",
    opportunities: opts.facts.opportunities.map((row) => {
      const gap = row.currentCaptureCents != null && row.fullRolloutCents != null ? row.fullRolloutCents - row.currentCaptureCents : null;
      return {
        id: row.id,
        category: row.category,
        title: row.title,
        current: presentCents(row.currentCaptureCents),
        full: presentCents(row.fullRolloutCents),
        setup: presentCents(row.setupCostCents),
        payback: paybackMonths(row.setupCostCents, gap) == null ? NOT_AVAILABLE : `${paybackMonths(row.setupCostCents, gap)} months`,
        owner: row.ownerName ?? "Owner not named",
        steps: row.steps ?? "Steps not entered",
        legal: row.legalNote ?? "Lease review note not entered",
        status: row.status,
        needs: row.currentCaptureCents == null || row.fullRolloutCents == null || row.setupCostCents == null ? "Needs data for any blank dollar field." : "Dollar assumptions were entered.",
      };
    }),
    payrollPerUnit: presentCents(analysis.payrollPer),
    payrollPerOccupied: presentCents(analysis.payrollPerOccupied),
    opexPerUnit: presentCents(analysis.opexPer),
    pmFee: presentBps(analysis.pmFeeBps),
    peers: analysis.peers.map((row) => ({
      code: row.code,
      payroll: presentCents(row.payrollPerUnitCents),
      opex: presentCents(row.controllablePerUnitCents),
      pmFee: presentBps(row.pmFeeBps),
    })),
    peerNote: analysis.peers.length ? "Compared with other Owned RCP deals that have books and a rent roll for this period." : "No other Owned deal has a comparable payroll figure for this period.",
    budgetRows: opts.budgetRows.map((row) => ({
      label: row.label,
      code: row.code ?? "",
      actual: row.actual == null ? NOT_AVAILABLE : presentCents(row.actual),
      budget: row.budget == null ? "No budget supplied for this period." : presentCents(row.budget),
      variance: row.actual == null || row.budget == null ? NOT_AVAILABLE : presentCents(row.actual - row.budget),
    })),
    loan: opts.facts.loan
      ? {
          name: `${opts.facts.loan.name} · ${opts.facts.loan.lenderName}`,
          reserveRequirement: `${presentCents(opts.facts.loan.reserveRequirementCents)} — ${opts.facts.loan.reserveRequirementNote}`,
          reserveCash: `${presentCents(opts.facts.reserveCashCents)} on account ${opts.facts.loan.reserveAccountCode}`,
          dscr: formatMultiple(opts.facts.loan.dscrBps),
          dscrThreshold: `${(opts.facts.loan.dscrThresholdBps / 10_000).toFixed(2)}x — ${opts.facts.loan.dscrThresholdNote}`,
          debtYield: presentBps(opts.facts.loan.debtYieldBps),
          debtYieldThreshold: `${(opts.facts.loan.debtYieldThresholdBps / 100).toFixed(2)}% — ${opts.facts.loan.debtYieldThresholdNote}`,
          note: "A schema default is labeled loan file default – confirm. A different stored number is from the loan file. This page does not invent a covenant. Debt yield uses annualized period NOI, not a trailing twelve.",
        }
      : null,
    loanMissing: "No loan on file. Threshold not supplied.",
    underwriting: opts.facts.underwriting
      ? {
          period: opts.facts.underwriting.periodLabel,
          recorded: opts.facts.underwriting.recordedAt,
          basis: opts.facts.underwriting.noiBasisLabel,
          snapshotNoi: presentCents(opts.facts.underwriting.noiCents),
          annualized: presentCents(opts.facts.underwriting.annualizedNoiCents),
          actual: presentCents(opts.facts.noiCents),
          variance:
            opts.facts.booksActive && opts.facts.noiCents != null && opts.facts.underwriting.noiCents != null
              ? presentCents(opts.facts.noiCents - opts.facts.underwriting.noiCents)
              : NOT_AVAILABLE,
          varianceNote:
            opts.facts.underwriting.noiCents == null
              ? "The snapshot has no period NOI, so variance is not calculated."
              : "Variance is this month's NOI minus the snapshot's period NOI. Annualized NOI is shown beside it and is not subtracted.",
        }
      : null,
    underwritingMissing: "No dated underwriting snapshot. Save one from the deal profile. Exit timing and IRR are not on this page.",
    log: opts.stored.events.map((event) => ({
      id: event.id,
      when: event.createdAt.toISOString().slice(0, 16).replace("T", " "),
      kind: event.kind.replaceAll("_", " ").toLowerCase(),
      actor: event.actor,
      reason: event.reason,
      note: event.note ?? PMS_NOTE,
      owner: event.ownerName,
      status: event.status,
      effect: presentCents(event.expectedEffectCents),
    })),
  };
}

function formatMultiple(bps: number | null): string {
  if (bps == null) return NOT_AVAILABLE;
  return `${(bps / 10_000).toFixed(2)}x`;
}
