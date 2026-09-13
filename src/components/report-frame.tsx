import { PeriodBanner } from "@/components/period-banner";
import { Shell } from "@/components/shell";
import { isArchivedSpe } from "@/lib/archive";
import { listPeriodLabels } from "@/lib/deals/periods";
import { getEntityByCode, listEntities } from "@/lib/queries";
import { buildAllStatements } from "@/lib/reports-server";
import type { ReactNode } from "react";

export type ReportSearch = {
  entity?: string;
  period?: string;
  view?: string;
};

export async function loadReportContext(searchParams: ReportSearch) {
  const liveEntities = await listEntities();
  if (liveEntities.length === 0) {
    throw new Error("NO_SEED");
  }
  const entityCode = searchParams.entity ?? liveEntities.find((e) => e.type === "OPCO")?.code ?? liveEntities[0]?.code;
  let entity = liveEntities.find((e) => e.code === entityCode) ?? null;
  if (!entity && searchParams.entity) {
    entity = await getEntityByCode(searchParams.entity);
  }
  if (!entity) {
    entity = liveEntities[0] ?? null;
  }
  if (!entity) {
    throw new Error("No entities seeded. Run npm run db:reset");
  }
  const entities = liveEntities.some((row) => row.code === entity.code)
    ? liveEntities
    : [entity, ...liveEntities];
  const [yearStr, monthStr] = (searchParams.period ?? "2026-08").split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const consolidated = searchParams.view === "consolidated" || searchParams.view === "combined";

  const [statements, periodLabels] = await Promise.all([
    buildAllStatements({
      entityId: entity.id,
      year,
      month,
      consolidated,
    }),
    listPeriodLabels(),
  ]);

  return {
    entities,
    entity,
    year,
    month,
    periodLabels,
    consolidated: statements.consolidated,
    canConsolidate: statements.canConsolidate,
    archived: isArchivedSpe(entity),
    statements,
  };
}

export async function ReportShell({
  searchParams,
  pathname,
  children,
}: {
  searchParams: ReportSearch;
  pathname: string;
  children: (ctx: Awaited<ReturnType<typeof loadReportContext>>) => ReactNode | Promise<ReactNode>;
}) {
  let ctx: Awaited<ReturnType<typeof loadReportContext>>;
  try {
    ctx = await loadReportContext(searchParams);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NO_SEED" || message.includes("No entities")) {
      return (
        <div className="mx-auto max-w-xl px-6 py-24 text-center">
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">Roche Capital Partners</p>
          <h1 className="mt-2 font-display text-4xl text-navy-900">Ledger not seeded</h1>
          <p className="mt-3 text-sm text-ink-700">
            Run <code className="bg-cream-200 px-1">npm run db:reset</code> then reload this page.
          </p>
        </div>
      );
    }
    if (/period not found/i.test(message)) {
      return (
        <div className="mx-auto max-w-xl px-6 py-24 text-center">
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">Roche Capital Partners</p>
          <h1 className="mt-2 font-display text-4xl text-navy-900">Period is not open</h1>
          <p className="mt-3 text-sm text-ink-700">
            Switch the navy header back to <strong>2026-08</strong>. A rent-roll as-of date is not the OpCo close month.
          </p>
        </div>
      );
    }
    throw error;
  }
  return (
    <Shell
      entities={ctx.entities}
      activeEntity={ctx.entity.code}
      year={ctx.year}
      month={ctx.month}
      consolidated={ctx.consolidated}
      pathname={pathname}
      periodLabels={ctx.periodLabels}
    >
      <PeriodBanner
        status={ctx.statements.period.status}
        entityCode={ctx.entity.code}
        period={`${ctx.year}-${String(ctx.month).padStart(2, "0")}`}
      />
      {await children(ctx)}
    </Shell>
  );
}

export function reportSubtitle(ctx: Awaited<ReturnType<typeof loadReportContext>>) {
  const units = ctx.entity.unitCount ? ` · ${ctx.entity.unitCount} units` : "";
  const view = ctx.consolidated ? " · Combined roll-up" : " · Standalone";
  const archived = ctx.archived ? " · Archived" : "";
  return `${ctx.entity.name}${units}${view}${archived} · ${ctx.year}-${String(ctx.month).padStart(2, "0")}`;
}
