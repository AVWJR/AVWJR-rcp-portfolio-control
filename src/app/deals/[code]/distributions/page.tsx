import { ArchivedSpeBanner } from "@/components/archived-spe-banner";
import { DistributionCharts } from "@/components/deals/distribution-charts";
import { DistributionForm } from "@/components/deals/distribution-form";
import { ReverseDistributionButton } from "@/components/deals/reverse-distribution";
import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { currentAccessRole } from "@/lib/access-server";
import { chartModelFromBoard } from "@/lib/distribution-chart-model";
import { loadDistributionBoard } from "@/lib/distribution-ledger";
import { formatUsd } from "@rcp/ledger";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function DistributionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<ReportSearch>;
}) {
  const { code } = await params;
  const query = await searchParams;
  const merged: ReportSearch = { ...query, entity: code, view: undefined };
  return (
    <ReportShell searchParams={merged} pathname={`/deals/${code}/distributions`}>
      {async (ctx) => {
        if (ctx.entity.type !== "SPE" || ctx.entity.code !== code) notFound();
        const board = await loadDistributionBoard(ctx.entity.id);
        if (!board) notFound();
        const role = await currentAccessRole();
        const period = `${ctx.year}-${String(ctx.month).padStart(2, "0")}`;
        const history = [...board.events].sort(
          (a, b) => a.sequence - b.sequence || a.periodLabel.localeCompare(b.periodLabel),
        );
        const latestActive = history.filter((event) => !event.reversesEventId && !event.reversed).at(-1);
        const archived = Boolean(ctx.archived);
        const sourceLabel = (source: string) => (source === "CAPITAL_EVENT" ? "Capital event" : "Operating cash");
        return (
          <div className="space-y-8">
            {ctx.archived ? <ArchivedSpeBanner code={code} period={period} /> : null}
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{reportSubtitle(ctx)}</p>
              <h1 className="font-display text-4xl text-navy-900">Distribution ledger</h1>
              <p className="mt-2 max-w-3xl text-sm text-ink-700">
                Permanent history for <strong>{ctx.entity.name}</strong>. A deal with no distributions starts at{" "}
                <strong>$0 distributed</strong>
                {board.capitalSource === "ledger"
                  ? ". Unreturned capital and unpaid pref now come from this ledger."
                  : ", and unreturned capital equals contributed capital."}{" "}
                Each row is one check run through the saved waterfall. Illustrative CFADS on the waterfall page is a
                separate what-if.
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                <Link className="text-navy-700 underline" href={`/deals/${code}/waterfall?entity=${code}&period=${period}`}>
                  LP/GP waterfall
                </Link>
                <Link className="text-navy-700 underline" href={`/dashboard/${code}?entity=${code}&period=${period}`}>
                  SPE dashboard
                </Link>
                <a className="text-navy-700 underline" href={`/api/deals/${code}/distributions?format=csv`}>
                  Download CSV
                </a>
              </div>
            </div>

            <section className="grid gap-3 md:grid-cols-4">
              <div className="border border-cream-300 bg-white px-4 py-3 shadow-ledger">
                <p className="text-[11px] uppercase tracking-[0.14em] text-gold-700">Distributed to LPs</p>
                <p className="font-display text-3xl tabular text-navy-900">{formatUsd(board.current.cumulativeLpCents)}</p>
              </div>
              <div className="border border-cream-300 bg-white px-4 py-3 shadow-ledger">
                <p className="text-[11px] uppercase tracking-[0.14em] text-gold-700">Distributed to RCP</p>
                <p className="font-display text-3xl tabular text-navy-900">{formatUsd(board.current.cumulativeRcpCents)}</p>
              </div>
              <div className="border border-cream-300 bg-white px-4 py-3 shadow-ledger">
                <p className="text-[11px] uppercase tracking-[0.14em] text-gold-700">Pref still unpaid</p>
                <p className="font-display text-3xl tabular text-navy-900">{formatUsd(board.current.prefUnpaidCents)}</p>
              </div>
              <div className="border border-cream-300 bg-white px-4 py-3 shadow-ledger">
                <p className="text-[11px] uppercase tracking-[0.14em] text-gold-700">Unreturned capital</p>
                <p className="font-display text-3xl tabular text-navy-900">{formatUsd(board.current.unreturnedCapitalCents)}</p>
              </div>
            </section>

            <DistributionCharts model={chartModelFromBoard(board)} />
            <DistributionForm
              entityCode={code}
              period={period}
              canPost={role === "principal" && board.ready && !archived}
              lockedCopy={
                archived
                  ? "This SPE is soft-archived. Restore it from Deal Archive before recording a distribution."
                  : undefined
              }
            />
            {!board.ready ? (
              <p className="text-sm text-ink-600">
                The ledger tables are not on this database yet, so this page shows the starting point only. Do not post
                a test distribution against a shared live database.
              </p>
            ) : null}

            <section className="border border-cream-300 bg-white px-5 py-4 shadow-ledger">
              <h2 className="font-display text-2xl text-navy-900">History</h2>
              <p className="mt-1 text-sm text-ink-600">
                Each row is one period. The running columns are the totals after that row, including reversals.
              </p>
              {board.events.length === 0 ? (
                <p className="mt-3 text-sm text-ink-600">No distributions posted. The deal is at $0 distributed.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-cream-300 text-[11px] uppercase tracking-[0.12em] text-ink-500">
                        <th className="py-2 text-left">Period</th>
                        <th className="py-2 text-left">Source</th>
                        <th className="py-2 text-right">This check</th>
                        <th className="py-2 text-right">LP to date</th>
                        <th className="py-2 text-right">RCP to date</th>
                        <th className="py-2 text-right">Pref unpaid</th>
                        <th className="py-2 text-right">Unreturned</th>
                        <th className="py-2 text-left"> </th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((event) => (
                        <tr key={event.id} className="border-b border-cream-200">
                          <td className="py-2">
                            {event.periodLabel}
                            {event.reversesEventId ? <span className="ml-2 text-gold-700">reversal</span> : null}
                            {event.reversed ? <span className="ml-2 text-ink-500">reversed</span> : null}
                          </td>
                          <td className="py-2 text-ink-700">{sourceLabel(event.source)}</td>
                          <td className="tabular py-2 text-right">{formatUsd(event.grossCents)}</td>
                          <td className="tabular py-2 text-right">{formatUsd(event.state.cumulativeLpCents)}</td>
                          <td className="tabular py-2 text-right">{formatUsd(event.state.cumulativeRcpCents)}</td>
                          <td className="tabular py-2 text-right">{formatUsd(event.state.prefUnpaidCents)}</td>
                          <td className="tabular py-2 text-right">{formatUsd(event.state.unreturnedCapitalCents)}</td>
                          <td className="py-2">
                            {role === "principal" && latestActive?.id === event.id ? (
                              <ReverseDistributionButton entityCode={code} eventId={event.id} />
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        );
      }}
    </ReportShell>
  );
}
