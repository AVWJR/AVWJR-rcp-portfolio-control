import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { loadPortfolioDebt } from "@/lib/debt-view";
import { formatUsd } from "@rcp/ledger";
import { formatMultipleBps, formatPercentBps } from "@rcp/debt";

export default async function DebtPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearch>;
}) {
  const params = await searchParams;
  const loans = await loadPortfolioDebt();
  return (
    <ReportShell searchParams={params} pathname="/debt">
      {(ctx) => (
        <div className="space-y-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{reportSubtitle(ctx)}</p>
            <h1 className="font-display text-4xl text-navy-900">Debt · maturity schedule</h1>
            <p className="mt-2 max-w-3xl text-sm text-ink-700">
              One first mortgage per SPE. UPB ties to GL 2110 + 2210. DSCR = period NOI / (interest +
              principal). Debt yield = annualized NOI / UPB. LTV is not computed from book cost.
            </p>
          </div>
          <section className="border border-cream-300 bg-white shadow-ledger">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-300 bg-cream-100 text-[11px] uppercase tracking-[0.12em] text-ink-500">
                    <th className="px-4 py-2 text-left">SPE</th>
                    <th className="px-4 py-2 text-left">Lender</th>
                    <th className="px-4 py-2 text-right">Original</th>
                    <th className="px-4 py-2 text-right">UPB</th>
                    <th className="px-4 py-2 text-right">Current / LT</th>
                    <th className="px-4 py-2 text-right">Rate</th>
                    <th className="px-4 py-2 text-right">P&amp;I</th>
                    <th className="px-4 py-2 text-left">Maturity</th>
                    <th className="px-4 py-2 text-right">DSCR</th>
                    <th className="px-4 py-2 text-right">Debt yield</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.map((loan) => (
                    <tr key={loan.loanId} className="border-b border-cream-200">
                      <td className="px-4 py-2">
                        <p className="font-semibold text-navy-900">{loan.entityCode}</p>
                        <p className="text-xs text-ink-500">{loan.entityName}</p>
                      </td>
                      <td className="px-4 py-2">{loan.lenderName}</td>
                      <td className="tabular px-4 py-2 text-right">{formatUsd(loan.originalPrincipalCents)}</td>
                      <td className="tabular px-4 py-2 text-right">{formatUsd(loan.currentUpbCents)}</td>
                      <td className="tabular px-4 py-2 text-right text-xs">
                        {formatUsd(loan.currentPortionCents)}
                        <br />
                        {formatUsd(loan.longTermPortionCents)}
                      </td>
                      <td className="tabular px-4 py-2 text-right">{(loan.interestRateBps / 100).toFixed(2)}%</td>
                      <td className="tabular px-4 py-2 text-right">{formatUsd(loan.paymentCents)}</td>
                      <td className="px-4 py-2 text-xs">
                        {loan.maturityDate.toISOString().slice(0, 10)}
                        <br />
                        {loan.monthsRemaining} mo
                      </td>
                      <td className="tabular px-4 py-2 text-right">
                        {formatMultipleBps(loan.covenants.dscrBps)}
                        <span className={`ml-1 text-[10px] uppercase ${loan.covenants.dscrPass ? "text-navy-700" : "text-gold-700"}`}>
                          {loan.covenants.dscrPass ? "pass" : "fail"}
                        </span>
                      </td>
                      <td className="tabular px-4 py-2 text-right">
                        {formatPercentBps(loan.covenants.debtYieldBps)}
                        <span className={`ml-1 text-[10px] uppercase ${loan.covenants.debtYieldPass ? "text-navy-700" : "text-gold-700"}`}>
                          {loan.covenants.debtYieldPass ? "pass" : "fail"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-cream-300 px-4 py-3 text-xs text-ink-500">
              Reserve requirement is stored on the loan (typically 1020). Covenant fail on a value-add
              SPE is expected when monthly DSCR is below the 1.25x note test.
            </p>
          </section>
        </div>
      )}
    </ReportShell>
  );
}
