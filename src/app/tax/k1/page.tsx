import { ExportLinks, TaxDisclaimer } from "@/components/tax-disclaimer";
import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { loadCapitalRollforward } from "@/lib/capital";
import { formatUsd } from "@rcp/ledger";
import { K1_EXPORT_LIMITATIONS } from "@rcp/tax-bridge";
import Link from "next/link";

export default async function K1CapitalPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearch>;
}) {
  const params = await searchParams;

  return (
    <ReportShell searchParams={params} pathname="/tax/k1">
      {async (ctx) => {
        const period = `${ctx.year}-${String(ctx.month).padStart(2, "0")}`;
        const qs = new URLSearchParams({ entity: ctx.entity.code, period });
        const roll = await loadCapitalRollforward({
          entityId: ctx.entity.id,
          year: ctx.year,
          month: ctx.month,
        });
        return (
          <div className="space-y-8">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{reportSubtitle(ctx)}</p>
              <h1 className="font-display text-4xl text-navy-900">Partner capital / K-1 export</h1>
              <p className="mt-2 max-w-3xl text-sm text-ink-700">
                Book-basis capital account rollforward: beginning + contributions − distributions ±
                book net income = ending. CSV / Excel is for CPA K-1 preparation. This is not a filed
                Schedule K-1.
              </p>
              <Link className="mt-3 inline-block text-sm text-navy-700 underline" href={`/tax?${qs}`}>
                Back to books-to-tax
              </Link>
            </div>
            <TaxDisclaimer extra="Standalone legal entity only. Combined roll-up is not a tax consolidation." />
            <ExportLinks href={`/api/tax/k1?${qs}`} label="K-1 capital" />

            <section className="border border-cream-300 bg-white shadow-ledger">
              <div className="border-b border-cream-300 bg-navy-900 px-6 py-4 text-cream-100">
                <h2 className="font-display text-2xl">
                  {roll.entityCode} · {roll.period}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-cream-300 bg-cream-100 text-[11px] uppercase tracking-[0.12em] text-ink-500">
                      <th className="px-4 py-2 text-left">Partner</th>
                      <th className="px-4 py-2 text-left">Role</th>
                      <th className="px-4 py-2 text-right">Own. bps</th>
                      <th className="px-4 py-2 text-right">Beginning</th>
                      <th className="px-4 py-2 text-right">Contrib</th>
                      <th className="px-4 py-2 text-right">Dist</th>
                      <th className="px-4 py-2 text-right">Book NI</th>
                      <th className="px-4 py-2 text-right">Ending</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roll.rows.map((row) => (
                      <tr key={row.partnerCode} className="border-t border-cream-200">
                        <td className="px-4 py-1.5">
                          {row.partnerName}
                          <span className="ml-2 text-[10px] uppercase text-ink-500">{row.partnerCode}</span>
                        </td>
                        <td className="px-4 py-1.5">{row.role}</td>
                        <td className="tabular px-4 py-1.5 text-right">{row.ownershipBps}</td>
                        <td className="tabular px-4 py-1.5 text-right">{formatUsd(row.beginningCents)}</td>
                        <td className="tabular px-4 py-1.5 text-right">{formatUsd(row.contributionsCents)}</td>
                        <td className="tabular px-4 py-1.5 text-right">{formatUsd(row.distributionsCents)}</td>
                        <td className="tabular px-4 py-1.5 text-right">{formatUsd(row.bookNiAllocCents)}</td>
                        <td className="tabular px-4 py-1.5 text-right font-semibold">
                          {formatUsd(row.endingCents)}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-navy-900 font-semibold">
                      <td className="px-4 py-2" colSpan={3}>
                        Total {roll.totals.identityHolds ? "· identity holds" : "· IDENTITY BREAK"}
                      </td>
                      <td className="tabular px-4 py-2 text-right">{formatUsd(roll.totals.beginningCents)}</td>
                      <td className="tabular px-4 py-2 text-right">{formatUsd(roll.totals.contributionsCents)}</td>
                      <td className="tabular px-4 py-2 text-right">{formatUsd(roll.totals.distributionsCents)}</td>
                      <td className="tabular px-4 py-2 text-right">{formatUsd(roll.totals.bookNiAllocCents)}</td>
                      <td className="tabular px-4 py-2 text-right">{formatUsd(roll.totals.endingCents)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <ul className="list-disc space-y-1 pl-5 text-sm text-ink-700">
              {K1_EXPORT_LIMITATIONS.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        );
      }}
    </ReportShell>
  );
}
