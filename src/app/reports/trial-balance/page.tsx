import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { TrialBalanceTable } from "@/components/statement-table";

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<ReportSearch>;
}) {
  const params = await searchParams;
  return (
    <ReportShell searchParams={params} pathname="/reports/trial-balance">
      {(ctx) => (
        <TrialBalanceTable
          title="Trial Balance"
          subtitle={reportSubtitle(ctx)}
          rows={ctx.statements.tb.rows}
          totalDebit={ctx.statements.tb.totalDebit}
          totalCredit={ctx.statements.tb.totalCredit}
        />
      )}
    </ReportShell>
  );
}
