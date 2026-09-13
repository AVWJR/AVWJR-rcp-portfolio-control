import { getIntake, publicIntake } from "@/lib/deals/intake";
import { buildDashboardForEntity, type LiveRatio } from "@/lib/dashboards";
import { loadPortfolioDebt } from "@/lib/debt-view";
import { reviewTreeIntercompany } from "@/lib/intercompany";
import { periodStatusLabel } from "@/lib/period-close";
import { prisma } from "@/lib/prisma";
import { buildAllStatements } from "@/lib/reports-server";
import { isJournalBalanced } from "@rcp/ledger";
import { formatMultipleBps, formatPercentBps } from "@rcp/debt";
import { formatRatioBps } from "@rcp/reporting";
import { listNavTargets, withContext } from "./nav";
import { parsePeriodLabel } from "./period";
import type {
  AnomalyFlag,
  CompletenessItem,
  DataCompleteness,
  EntitySummary,
  ExpertToolError,
  KpiSnapshot,
  KpiTileView,
  PeriodStatusView,
} from "./types";

const VARIANCE_WATCH_BPS = 1_500;
const OCCUPANCY_WATCH_BPS = 9_000;

function href(path: string, entityCode: string, periodLabel: string, view?: "combined") {
  return withContext(path, entityCode, periodLabel, view);
}

export async function getEntitySummary(entityCode: string): Promise<EntitySummary | ExpertToolError> {
  const entity = await prisma.entity.findUnique({
    where: { code: entityCode },
    include: { parent: true, children: true },
  });
  if (!entity) return { ok: false, error: `Unknown entity ${entityCode}` };
  return {
    code: entity.code,
    name: entity.name,
    type: entity.type,
    parentCode: entity.parent?.code ?? null,
    unitCount: entity.unitCount,
    strategy: entity.strategy,
    children: entity.children
      .slice()
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((child) => ({
        code: child.code,
        name: child.name,
        type: child.type,
        unitCount: child.unitCount,
      })),
  };
}

export async function getPeriodStatus(
  entityCode: string,
  periodLabel: string,
): Promise<PeriodStatusView | ExpertToolError> {
  const parsed = parsePeriodLabel(periodLabel);
  if (!parsed) return { ok: false, error: "Period must be YYYY-MM" };
  const entity = await prisma.entity.findUnique({ where: { code: entityCode } });
  if (!entity) return { ok: false, error: `Unknown entity ${entityCode}` };
  const period = await prisma.period.findUnique({
    where: { entityId_year_month: { entityId: entity.id, year: parsed.year, month: parsed.month } },
    include: { checklist: { orderBy: { sortOrder: "asc" } } },
  });
  if (!period) {
    return {
      entityCode,
      periodLabel,
      status: "MISSING",
      statusLabel: "Period row missing",
      exists: false,
      checklistDone: 0,
      checklistTotal: 0,
      openItems: [],
    };
  }
  const openItems = period.checklist
    .filter((item) => item.status !== "DONE" && item.status !== "NA")
    .map((item) => ({ code: item.code, label: item.label, status: item.status }));
  return {
    entityCode,
    periodLabel,
    status: period.status,
    statusLabel: periodStatusLabel(period.status),
    exists: true,
    checklistDone: period.checklist.filter((item) => item.status === "DONE" || item.status === "NA").length,
    checklistTotal: period.checklist.length,
    openItems,
  };
}

function tilesOf(dash: { tiles: LiveRatio[] }): KpiTileView[] {
  return dash.tiles.map((tile) => ({
    id: tile.id,
    display: tile.display,
    hint: tile.hint,
    gated: tile.gated,
  }));
}

export async function getKpiSnapshot(
  entityCode: string,
  periodLabel: string,
): Promise<KpiSnapshot | ExpertToolError> {
  const parsed = parsePeriodLabel(periodLabel);
  if (!parsed) return { ok: false, error: "Period must be YYYY-MM" };
  const entity = await prisma.entity.findUnique({ where: { code: entityCode } });
  if (!entity) return { ok: false, error: `Unknown entity ${entityCode}` };
  if (entity.type === "HOLDCO") {
    return {
      entityCode: entity.code,
      entityName: entity.name,
      periodLabel,
      kind: "holdco",
      viewLabel: "HoldCo — no operating dashboard",
      tiles: [],
      notes: ["HoldCo has no operating dashboard. Switch to RCP-OPCO or an SPE."],
    };
  }
  const dash = await buildDashboardForEntity({
    entityId: entity.id,
    entityType: entity.type,
    year: parsed.year,
    month: parsed.month,
  });
  const notes: string[] = [];
  if (dash.kind === "opco") {
    notes.push(dash.combinedNote);
    if (dash.watchlist.length) {
      notes.push(`Covenant watchlist: ${dash.watchlist.map((w) => `${w.entityCode} ${w.reason}`).join("; ")}`);
    }
  }
  return {
    entityCode: dash.entityCode,
    entityName: dash.entityName,
    periodLabel,
    kind: dash.kind,
    viewLabel: dash.viewLabel,
    tiles: tilesOf(dash),
    notes,
  };
}

export async function getDataCompleteness(
  entityCode: string,
  periodLabel: string,
): Promise<DataCompleteness | ExpertToolError> {
  const parsed = parsePeriodLabel(periodLabel);
  if (!parsed) return { ok: false, error: "Period must be YYYY-MM" };
  const entity = await prisma.entity.findUnique({
    where: { code: entityCode },
    include: { children: true },
  });
  if (!entity) return { ok: false, error: `Unknown entity ${entityCode}` };

  const period = await prisma.period.findUnique({
    where: { entityId_year_month: { entityId: entity.id, year: parsed.year, month: parsed.month } },
    include: { checklist: true },
  });

  const [postedJournals, draftJournals, units, budgetLines, loans, taxRows, vaultDocs, partners] =
    await Promise.all([
      period
        ? prisma.journal.count({ where: { entityId: entity.id, periodId: period.id, status: "POSTED" } })
        : Promise.resolve(0),
      period
        ? prisma.journal.count({ where: { entityId: entity.id, periodId: period.id, status: "DRAFT" } })
        : Promise.resolve(0),
      prisma.unit.count({ where: { entityId: entity.id } }),
      prisma.budgetLine.count({
        where: { entityId: entity.id, year: parsed.year, month: parsed.month },
      }),
      prisma.loan.count({ where: { entityId: entity.id } }),
      prisma.taxAdjustment.count({
        where: { entityId: entity.id, year: parsed.year, month: parsed.month },
      }),
      prisma.vaultDocument.count({ where: { entityId: entity.id } }),
      prisma.partner.count({ where: { entityId: entity.id } }),
    ]);

  const items: CompletenessItem[] = [];
  const spe = entity.type === "SPE";
  const opco = entity.type === "OPCO";

  items.push({
    id: "period",
    label: "Period row",
    status: period ? "ready" : "missing",
    detail: period ? `${periodLabel} is ${periodStatusLabel(period.status).toLowerCase()}` : "No YYYY-MM period row",
    href: href("/close", entityCode, periodLabel),
    source: "From Period Close",
  });

  items.push({
    id: "journals",
    label: "Posted journals",
    status: postedJournals > 0 ? "ready" : "missing",
    detail:
      postedJournals > 0
        ? `${postedJournals} posted journal(s)${draftJournals ? `; ${draftJournals} draft` : ""}`
        : "No posted journals in this period",
    href: href("/reports/trial-balance", entityCode, periodLabel),
    source: "From Trial Balance / journals",
  });

  items.push({
    id: "rent_roll",
    label: "Rent roll / unit master",
    status: !spe ? "na" : units > 0 ? "ready" : "missing",
    detail: !spe
      ? "Rent-roll occupancy is SPE-level (not derived from GL vacancy)"
      : units > 0
        ? `${units} unit row(s)${entity.unitCount && units !== entity.unitCount ? ` — entity master is ${entity.unitCount}` : ""}`
        : "No unit file. Import on Properties. Do not invent occupancy from 4020.",
    href: href(spe ? `/properties/${entityCode}` : "/properties", entityCode, periodLabel),
    source: "From rent roll",
  });

  items.push({
    id: "budget",
    label: "Monthly budget",
    status: entity.type === "HOLDCO" ? "na" : budgetLines > 0 ? "ready" : "missing",
    detail:
      entity.type === "HOLDCO"
        ? "HoldCo has no operating budget in this product"
        : budgetLines > 0
          ? `${budgetLines} budget account row(s)`
          : "No budget for this month. Import on the operating statement.",
    href: href("/reports/operating-statement", entityCode, periodLabel, opco ? "combined" : undefined),
    source: "From Operating Statement budget",
  });

  items.push({
    id: "loan",
    label: "Loan file",
    status: !spe ? "na" : loans > 0 ? "ready" : "missing",
    detail: !spe
      ? "First-mortgage files live on SPEs. OpCo uses look-through UPB."
      : loans > 0
        ? `${loans} loan file(s)`
        : "No loan file — DSCR / debt yield / UPB stay empty. Do not invent LTV.",
    href: href("/debt", entityCode, periodLabel),
    source: "From Loan file",
  });

  items.push({
    id: "tax",
    label: "Tax-bridge adjustments",
    status: entity.type === "HOLDCO" ? "na" : taxRows > 0 ? "ready" : "missing",
    detail:
      taxRows > 0
        ? `${taxRows} CPA worksheet row(s) — export only, does not file`
        : "No tax adjustment rows. Book columns still compute from the GL. Not a filed return.",
    href: href("/tax", entityCode, periodLabel, opco ? "combined" : undefined),
    source: "From Tax bridge",
  });

  items.push({
    id: "vault",
    label: "Vault documents",
    status: vaultDocs > 0 ? "ready" : "missing",
    detail: vaultDocs > 0 ? `${vaultDocs} document(s)` : "Vault is empty for this entity",
    href: href("/vault", entityCode, periodLabel),
    source: "From Document vault",
  });

  items.push({
    id: "partners",
    label: "Partner capital",
    status: entity.type === "HOLDCO" ? "na" : partners > 0 ? "ready" : "missing",
    detail:
      partners > 0
        ? `${partners} partner row(s) for K-1-oriented export`
        : "No partners — K-1 export will be empty. Not a filed K-1.",
    href: href("/tax/k1", entityCode, periodLabel),
    source: "From partner capital",
  });

  const checklistTotal = period?.checklist.length ?? 0;
  const checklistOpen =
    period?.checklist.filter((item) => item.status !== "DONE" && item.status !== "NA").length ?? 0;
  items.push({
    id: "checklist",
    label: "Month-end checklist",
    status: !period ? "missing" : checklistTotal === 0 ? "missing" : checklistOpen > 0 ? "partial" : "ready",
    detail: !period
      ? "Create the period before closing"
      : checklistTotal === 0
        ? "Checklist not started — left nav → Close"
        : checklistOpen > 0
          ? `${checklistOpen} open item(s) of ${checklistTotal}`
          : `${checklistTotal} items DONE / N/A`,
    href: href("/close", entityCode, periodLabel),
    source: "From Period Close checklist",
  });

  if (opco) {
    const spes = entity.children.filter((c) => c.type === "SPE");
    for (const speChild of spes) {
      const [speUnits, speBudget, speLoan] = await Promise.all([
        prisma.unit.count({ where: { entityId: speChild.id } }),
        prisma.budgetLine.count({
          where: { entityId: speChild.id, year: parsed.year, month: parsed.month },
        }),
        prisma.loan.count({ where: { entityId: speChild.id } }),
      ]);
      const missing = [
        speUnits === 0 ? "rent roll" : null,
        speBudget === 0 ? "budget" : null,
        speLoan === 0 ? "loan file" : null,
      ].filter(Boolean);
      items.push({
        id: `spe_${speChild.code}`,
        label: `${speChild.code} look-through inputs`,
        status: missing.length === 0 ? "ready" : missing.length === 3 ? "missing" : "partial",
        detail: missing.length ? `Missing ${missing.join(", ")}` : "Rent roll, budget, and loan file present",
        href: href(`/dashboard/${speChild.code}`, speChild.code, periodLabel),
        source: "From OpCo look-through stack",
      });
    }
  }

  const applicable = items.filter((item) => item.status !== "na");
  const ready = applicable.filter((item) => item.status === "ready").length;
  const score = applicable.length === 0 ? 0 : Math.round((ready / applicable.length) * 100);

  return { entityCode, periodLabel, score, ready, applicable: applicable.length, items };
}

export async function getAnomalies(
  entityCode: string,
  periodLabel: string,
): Promise<{ entityCode: string; periodLabel: string; flags: AnomalyFlag[] } | ExpertToolError> {
  const parsed = parsePeriodLabel(periodLabel);
  if (!parsed) return { ok: false, error: "Period must be YYYY-MM" };
  const entity = await prisma.entity.findUnique({ where: { code: entityCode } });
  if (!entity) return { ok: false, error: `Unknown entity ${entityCode}` };

  const flags: AnomalyFlag[] = [];
  const period = await prisma.period.findUnique({
    where: { entityId_year_month: { entityId: entity.id, year: parsed.year, month: parsed.month } },
    include: { checklist: true },
  });

  if (!period) {
    flags.push({
      id: "no_period",
      severity: "blocker",
      title: "Period missing",
      detail: `${entityCode} has no ${periodLabel} period row.`,
      source: "From Period Close",
      href: href("/close", entityCode, periodLabel),
    });
    return { entityCode, periodLabel, flags };
  }

  if (period.status === "CLOSED") {
    flags.push({
      id: "hard_lock",
      severity: "info",
      title: "Period is hard locked",
      detail: "New journals are rejected. Reopen from Close with a reason and ticket.",
      source: "From Period Close",
      href: href("/close", entityCode, periodLabel),
    });
  } else if (period.status === "SOFT_CLOSED") {
    flags.push({
      id: "soft_close",
      severity: "watch",
      title: "Period is soft closed",
      detail: "Operating posts are blocked. Controller adjustments need an explicit override.",
      source: "From Period Close",
      href: href("/close", entityCode, periodLabel),
    });
  }

  const openChecklist = period.checklist.filter((item) => item.status !== "DONE" && item.status !== "NA");
  if (period.checklist.length === 0 && period.status === "OPEN") {
    flags.push({
      id: "checklist_unstarted",
      severity: "watch",
      title: "Month-end checklist not started",
      detail: "Left nav → Close to start the controller checklist before soft close.",
      source: "From Period Close checklist",
      href: href("/close", entityCode, periodLabel),
    });
  } else if (openChecklist.length > 0) {
    const preview = openChecklist
      .slice(0, 3)
      .map((item) => item.label)
      .join("; ");
    flags.push({
      id: "checklist_open",
      severity: "watch",
      title: "Open close checklist items",
      detail: `${openChecklist.length} of ${period.checklist.length} still open. ${preview}${openChecklist.length > 3 ? "…" : ""}`,
      source: "From Period Close checklist",
      href: href("/close", entityCode, periodLabel),
    });
  }

  const drafts = await prisma.journal.findMany({
    where: { entityId: entity.id, periodId: period.id, status: "DRAFT" },
    include: { lines: { include: { account: true } } },
  });
  if (drafts.length > 0) {
    const imbalanced = drafts.filter(
      (journal) =>
        !isJournalBalanced(
          journal.lines.map((line) => ({
            accountCode: line.account.code,
            debit: line.debit,
            credit: line.credit,
          })),
        ),
    );
    flags.push({
      id: "draft_journals",
      severity: imbalanced.length ? "blocker" : "watch",
      title: imbalanced.length ? "Draft journals include an imbalance" : "Draft journals in period",
      detail: `${drafts.length} draft journal(s)${imbalanced.length ? `; ${imbalanced.length} do not foot` : ""}.`,
      source: "From journals",
      href: href("/reports/trial-balance", entityCode, periodLabel),
    });
  }

  try {
    const statements = await buildAllStatements({
      entityId: entity.id,
      year: parsed.year,
      month: parsed.month,
      consolidated: entity.type === "OPCO",
    });
    if (!statements.tb.balanced) {
      flags.push({
        id: "tb_imbalance",
        severity: "blocker",
        title: "Trial balance does not foot",
        detail: "Debits do not equal credits on posted activity.",
        source: "From Trial Balance",
        href: href("/reports/trial-balance", entityCode, periodLabel, entity.type === "OPCO" ? "combined" : undefined),
      });
    }
    if (!statements.bs.balanced) {
      flags.push({
        id: "bs_imbalance",
        severity: "blocker",
        title: "Balance sheet does not balance",
        detail: "Assets do not equal liabilities + equity (including unclosed NI).",
        source: "From Balance Sheet",
        href: href("/reports/balance-sheet", entityCode, periodLabel, entity.type === "OPCO" ? "combined" : undefined),
      });
    }
    if (!statements.cf.tiesToBalanceSheet) {
      flags.push({
        id: "cf_mismatch",
        severity: "blocker",
        title: "Cash flow does not tie to the balance sheet",
        detail: "Ending cash on the cash-flow statement does not match BS cash.",
        source: "From Cash Flow",
        href: href("/reports/cash-flow", entityCode, periodLabel, entity.type === "OPCO" ? "combined" : undefined),
      });
    }

    const units = statements.units;
    if (entity.type === "SPE" && entity.unitCount && units.length > 0 && units.length !== entity.unitCount) {
      flags.push({
        id: "units_dont_foot",
        severity: "watch",
        title: "Unit file does not foot to the SPE master",
        detail: `Rent roll has ${units.length} rows; entity master is ${entity.unitCount} units.`,
        source: "From rent roll",
        href: href(`/properties/${entityCode}`, entityCode, periodLabel),
      });
    }

    const rr = statements.kpis.rentRoll;
    if (rr && rr.physicalOccupancyBps !== null && rr.physicalOccupancyBps < OCCUPANCY_WATCH_BPS) {
      flags.push({
        id: "occupancy_cliff",
        severity: "watch",
        title: "Physical occupancy below 90% coaching heuristic",
        detail: `${formatRatioBps(rr.physicalOccupancyBps)} occupied (${rr.occupiedCount}/${rr.rentableCount} rentable; ${rr.downCount} down). This is a coach review flag, not a loan covenant.`,
        source: "From Dashboard KPI physical occupancy",
        href: href(`/dashboard/${entityCode}`, entityCode, periodLabel),
      });
    }

    const noiVar = statements.os.rows.find((row) => row.key === "noi")?.varianceBps ?? null;
    if (noiVar !== null && Math.abs(noiVar) >= VARIANCE_WATCH_BPS) {
      flags.push({
        id: "noi_variance",
        severity: "watch",
        title: "NOI budget variance ≥ 15%",
        detail: `${formatRatioBps(noiVar)} vs budget. Coaching heuristic — confirm the budget import and operating journals.`,
        source: "From Operating Statement variance",
        href: href("/reports/operating-statement", entityCode, periodLabel),
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message !== "Period not found") {
      flags.push({
        id: "statement_error",
        severity: "info",
        title: "Could not compute statement checks",
        detail: "Books may be incomplete for this entity and period.",
        source: "From statements",
        href: href("/reports/trial-balance", entityCode, periodLabel),
      });
    }
  }

  if (entity.type === "SPE" || entity.type === "OPCO") {
    try {
      const dash = await buildDashboardForEntity({
        entityId: entity.id,
        entityType: entity.type,
        year: parsed.year,
        month: parsed.month,
      });
      if (dash.kind === "property") {
        const loan = dash.loans[0];
        if (loan) {
          if (loan.covenants.dscrPass === false) {
            flags.push({
              id: "dscr_fail",
              severity: "blocker",
              title: "DSCR below the loan-file threshold",
              detail: `${formatMultipleBps(loan.covenants.dscrBps)} vs ${formatMultipleBps(loan.covenants.dscrThresholdBps)} (${loan.lenderName}).`,
              source: "From Dashboard KPI DSCR / Loan file",
              href: href("/debt", entityCode, periodLabel),
            });
          }
          if (loan.covenants.debtYieldPass === false) {
            flags.push({
              id: "debt_yield_fail",
              severity: "blocker",
              title: "Debt yield below the loan-file threshold",
              detail: `${formatPercentBps(loan.covenants.debtYieldBps)} vs ${formatPercentBps(loan.covenants.debtYieldThresholdBps)}.`,
              source: "From Dashboard KPI debt yield / Loan file",
              href: href("/debt", entityCode, periodLabel),
            });
          }
          if (loan.monthsRemaining <= 12) {
            flags.push({
              id: "maturity_12",
              severity: "watch",
              title: "Maturity within 12 months",
              detail: `${loan.maturityDate.toISOString().slice(0, 10)} · ${loan.monthsRemaining} months remaining.`,
              source: "From Loan file",
              href: href("/debt", entityCode, periodLabel),
            });
          }
        }
        if (dash.t12.definition === "incomplete") {
          flags.push({
            id: "t12_incomplete",
            severity: "info",
            title: "T12 NOI is incomplete",
            detail: `Only ${dash.t12.monthsAvailable} month(s) of books. Demo seed operating month is 2026-08. Not annualized.`,
            source: "From Dashboard KPI T12 NOI",
            href: href(`/dashboard/${entityCode}`, entityCode, periodLabel),
          });
        }
      } else {
        for (const watch of dash.watchlist) {
          flags.push({
            id: `watch_${watch.entityCode}`,
            severity: watch.reason.includes("fail") ? "blocker" : "watch",
            title: `${watch.entityCode} covenant watch`,
            detail: `${watch.reason} · DSCR ${watch.dscrDisplay} · debt yield ${watch.debtYieldDisplay}`,
            source: "From OpCo dashboard watchlist / Loan file",
            href: watch.href,
          });
        }
        if (dash.t12.definition === "incomplete") {
          flags.push({
            id: "t12_incomplete",
            severity: "info",
            title: "Look-through T12 NOI is incomplete",
            detail: `Only ${dash.t12.monthsAvailable} month(s) of SPE books. Not annualized.`,
            source: "From Dashboard KPI T12 NOI",
            href: href("/dashboard", entityCode, periodLabel, "combined"),
          });
        }
      }
    } catch {
      // HoldCo or missing operating pack — already handled above.
    }
  }

  try {
    const ic = await reviewTreeIntercompany(period.endDate);
    if (!ic.ok) {
      flags.push({
        id: "ic_fail",
        severity: "blocker",
        title: "Intercompany does not match",
        detail: ic.findings.join(" "),
        source: "From intercompany review (1310/2310, 6310/7010)",
        href: href("/close", entityCode, periodLabel),
      });
    }
  } catch {
    // ignore IC if the tree is empty
  }

  const ltv = flags.some((f) => f.id === "ltv_gated");
  if (!ltv) {
    flags.push({
      id: "ltv_gated",
      severity: "info",
      title: "LTV is gated",
      detail: "Loan file has UPB but no appraisal. Do not divide UPB by book cost.",
      source: "From Dashboard KPI LTV",
      href: href("/dashboard/ratios/ltv", entityCode, periodLabel),
    });
  }

  return { entityCode, periodLabel, flags };
}

export async function getDealIntakeStatus(intakeId: string) {
  if (!intakeId?.trim()) return { ok: false as const, error: "intakeId required" };
  const intake = await getIntake(intakeId.trim());
  if (!intake) return { ok: false as const, error: `Unknown intake ${intakeId}` };
  return { ok: true as const, intake: publicIntake(intake) };
}

export { listNavTargets };

export async function runExpertTools(entityCode: string, periodLabel: string) {
  const [entity, period, completeness, anomalies, kpis, nav] = await Promise.all([
    getEntitySummary(entityCode),
    getPeriodStatus(entityCode, periodLabel),
    getDataCompleteness(entityCode, periodLabel),
    getAnomalies(entityCode, periodLabel),
    getKpiSnapshot(entityCode, periodLabel),
    Promise.resolve(listNavTargets()),
  ]);
  return { entity, period, completeness, anomalies, kpis, nav };
}

export async function loadPortfolioLoansForPeriod(periodLabel: string) {
  const parsed = parsePeriodLabel(periodLabel);
  if (!parsed) return [];
  return loadPortfolioDebt(parsed.year, parsed.month);
}
