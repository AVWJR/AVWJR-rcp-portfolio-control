import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { RATIO_DICTIONARY } from "@rcp/analytics";
import Link from "next/link";

export default async function RatioDictionaryPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearch>;
}) {
  const params = await searchParams;
  return (
    <ReportShell searchParams={params} pathname="/dashboard/ratios">
      {(ctx) => {
        const period = `${ctx.year}-${String(ctx.month).padStart(2, "0")}`;
        const q = new URLSearchParams({ entity: ctx.entity.code, period });
        if (ctx.consolidated) q.set("view", "combined");
        return (
          <div className="space-y-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{reportSubtitle(ctx)}</p>
              <h1 className="font-display text-4xl text-navy-900">RCP Ratio Dictionary</h1>
              <p className="mt-2 max-w-3xl text-sm text-ink-700">
                Live formulas, units, and NOI definition labels (period vs T12 vs annualized period).
                Computational source of truth is <code>@rcp/analytics</code>; the in-repo narrative is{" "}
                <code>docs/RCP_RATIO_DICTIONARY_STUB.md</code>. Click a row for contributing accounts
                or rent-roll fields on {ctx.entity.code}.
              </p>
            </div>
            <div className="overflow-x-auto border border-cream-300 bg-white shadow-ledger">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-300 bg-cream-100 text-[11px] uppercase tracking-[0.12em] text-ink-500">
                    <th className="px-4 py-2 text-left">Ratio</th>
                    <th className="px-4 py-2 text-left">Formula</th>
                    <th className="px-4 py-2 text-left">NOI def.</th>
                    <th className="px-4 py-2 text-left">Unit</th>
                    <th className="px-4 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {RATIO_DICTIONARY.map((row) => (
                    <tr key={row.id} className="border-b border-cream-200 align-top">
                      <td className="px-4 py-2">
                        <Link className="font-semibold text-navy-900 underline" href={`/dashboard/ratios/${row.id}?${q}`}>
                          {row.label}
                        </Link>
                        <p className="text-xs text-ink-500">{row.id}</p>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-ink-700">{row.formula}</td>
                      <td className="px-4 py-2 text-xs uppercase tracking-[0.12em] text-ink-500">
                        {row.noiDefinition?.replaceAll("_", " ") ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-xs">{row.unit.replaceAll("_", " ")}</td>
                      <td className="px-4 py-2 text-xs uppercase tracking-[0.12em]">
                        {row.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      }}
    </ReportShell>
  );
}
