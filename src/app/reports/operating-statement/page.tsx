import { KpiStrip } from "@/components/kpi-strip";
import { OperatingStatementTable } from "@/components/operating-statement-table";
import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { CsvImportForm } from "@/components/csv-import-form";

export default async function OperatingStatementPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearch>;
}) {
  const params = await searchParams;
  return (
    <ReportShell searchParams={params} pathname="/reports/operating-statement">
      {(ctx) => {
        const showBudget = ctx.statements.os.rows.some((r) => r.budget !== null);
        const showPrior = ctx.statements.os.prior !== null;
        const isSpe = ctx.entity.type === "SPE";
        const isRollup = ctx.consolidated;
        return (
          <div className="space-y-6">
            {isSpe || isRollup ? <KpiStrip kpis={ctx.statements.kpis} /> : null}
            <OperatingStatementTable
              title="Operating Statement · NOI Bridge"
              subtitle={reportSubtitle(ctx)}
              rows={ctx.statements.os.rows}
              showBudget={showBudget}
              showPrior={showPrior}
              footer="GPR → vacancy/concessions → EGI → OpEx groups → NOI. Interest, depreciation, and OpCo AM fees sit below NOI. Variance = actual − budget. MoM uses the prior calendar month when that period exists (2026-07 seed has no operating activity)."
            />
            {isSpe ? (
              <CsvImportForm
                action="/api/budgets"
                entity={ctx.entity.code}
                period={`${ctx.year}-${String(ctx.month).padStart(2, "0")}`}
                label="Replace monthly budget CSV"
                acceptHint="Columns: account_code, amount (USD). Natural-magnitude cents after import."
              />
            ) : null}
          </div>
        );
      }}
    </ReportShell>
  );
}
