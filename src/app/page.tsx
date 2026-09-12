import { KpiStrip } from "@/components/kpi-strip";
import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { formatUsd } from "@rcp/ledger";
import Link from "next/link";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<ReportSearch>;
}) {
  const params = await searchParams;
  return (
    <ReportShell searchParams={params} pathname="/">
      {(ctx) => {
        const { tb, is, bs, cf } = ctx.statements;
        const cards = [
          { label: "NOI", value: is.noi, hint: "AM fees sit below this line" },
          { label: "Net Income", value: is.netIncome, hint: "Period activity" },
          { label: "Total Assets", value: bs.totalAssets, hint: bs.balanced ? "A = L + E" : "Out of balance" },
          { label: "Ending Cash", value: cf.endingCash, hint: cf.tiesToBalanceSheet ? "CF ties to BS" : "CF mismatch" },
        ];
        const q = new URLSearchParams({
          entity: ctx.entity.code,
          period: `${ctx.year}-${String(ctx.month).padStart(2, "0")}`,
        });
        if (ctx.consolidated) q.set("view", "combined");

        return (
          <div className="space-y-8">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{reportSubtitle(ctx)}</p>
              <h1 className="font-display text-4xl text-navy-900">Portfolio Control</h1>
              <p className="mt-2 max-w-2xl text-sm text-ink-700">
                Book-basis ledger for Roche Capital Partners HoldCo, OpCo, and wholly owned property
                SPEs. Physical occupancy and loss-to-lease are rent-roll sourced. Book economic
                occupancy is EGI / GPR. Delinquency is not invented from GL AR. OpCo{" "}
                <strong>combined roll-up</strong> sums wholly owned SPEs and eliminates IC / AM —
                it is not a GAAP consolidation.
              </p>
            </div>
            {ctx.entity.type === "SPE" || ctx.consolidated ? <KpiStrip kpis={ctx.statements.kpis} /> : null}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {cards.map((card) => (
                <div key={card.label} className="border border-cream-300 bg-white px-5 py-4 shadow-ledger">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-gold-700">{card.label}</p>
                  <p className="mt-1 font-display text-3xl text-navy-900 tabular">{formatUsd(card.value)}</p>
                  <p className="mt-1 text-xs text-ink-500">{card.hint}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                { href: "/dashboard", title: "OpCo / property dashboards", copy: "Live ratio tiles with formula drill-down. Combined roll-up is not GAAP consolidation." },
                { href: "/dashboard/ratios", title: "Ratio dictionary", copy: "Formulas, units, and NOI definition labels (period vs T12 vs annualized period)." },
                { href: "/reports/operating-statement", title: "Operating Statement", copy: "NOI bridge with budget variance and prior-period (MoM) columns." },
                { href: "/properties", title: "Properties / rent roll", copy: "Unit master, occupancy, loss-to-lease, CSV import." },
                { href: "/debt", title: "Debt / covenants", copy: "Loan file, maturity schedule, DSCR and debt yield vs thresholds." },
                { href: "/capex", title: "CapEx / CIP", copy: "CapEx vs R&M. CIP 1460 until placed in service." },
                { href: "/close", title: "Period close", copy: "Soft close, controller checklist, hard lock. Reopen needs a ticket." },
                { href: "/reports/trial-balance", title: "Trial Balance", copy: "As-of posted activity. Debits equal credits." },
                { href: "/reports/income-statement", title: "Income Statement", copy: "Book P/L: GPR → NOI → interest, depreciation, AM fees." },
                { href: "/reports/balance-sheet", title: "Balance Sheet", copy: "Assets, liabilities, and members' equity including unclosed NI." },
                { href: "/reports/cash-flow", title: "Cash Flow", copy: "Indirect method. Ending cash ties to the balance sheet." },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={`${item.href}?${q.toString()}`}
                  className="border border-cream-300 bg-white px-5 py-4 shadow-ledger hover:border-gold-500"
                >
                  <h2 className="font-display text-2xl text-navy-900">{item.title}</h2>
                  <p className="mt-1 text-sm text-ink-700">{item.copy}</p>
                </Link>
              ))}
            </div>
            <p className="text-xs text-ink-500">
              Trial balance totals {formatUsd(tb.totalDebit)} / {formatUsd(tb.totalCredit)} ·{" "}
              {tb.balanced ? "in balance" : "out of balance"}
            </p>
          </div>
        );
      }}
    </ReportShell>
  );
}
