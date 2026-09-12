import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { StatementTable } from "@/components/statement-table";

export default async function IncomeStatementPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearch>;
}) {
  const params = await searchParams;
  return (
    <ReportShell searchParams={params} pathname="/reports/income-statement">
      {(ctx) => (
        <StatementTable
          title="Income Statement"
          subtitle={reportSubtitle(ctx)}
          rows={ctx.statements.is.rows}
          footer="Locked policy: OpCo asset management fees sit below NOI on the SPE. Budget variance and rent-roll KPIs live on the Operating Statement."
        />
      )}
    </ReportShell>
  );
}
