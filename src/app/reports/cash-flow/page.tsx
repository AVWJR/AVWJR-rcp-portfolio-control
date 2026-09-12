import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { StatementTable } from "@/components/statement-table";

export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearch>;
}) {
  const params = await searchParams;
  return (
    <ReportShell searchParams={params} pathname="/reports/cash-flow">
      {(ctx) => (
        <StatementTable
          title="Statement of Cash Flows"
          subtitle={reportSubtitle(ctx)}
          rows={ctx.statements.cf.rows}
          footer={
            ctx.statements.cf.tiesToBalanceSheet
              ? "Beginning cash + net change equals ending cash on the balance sheet."
              : "Cash rollforward does not tie — investigate non-cash classifications."
          }
        />
      )}
    </ReportShell>
  );
}
