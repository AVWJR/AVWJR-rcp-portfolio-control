import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { StatementTable } from "@/components/statement-table";

export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearch>;
}) {
  const params = await searchParams;
  const footer = (balanced: boolean) =>
    balanced
      ? "Assets equal liabilities plus equity, including unclosed current-period net income."
      : "Balance sheet is out of equation — investigate posted journals.";

  return (
    <ReportShell searchParams={params} pathname="/reports/balance-sheet">
      {(ctx) => (
        <StatementTable
          title="Balance Sheet"
          subtitle={reportSubtitle(ctx)}
          rows={ctx.statements.bs.rows}
          footer={footer(ctx.statements.bs.balanced)}
        />
      )}
    </ReportShell>
  );
}
