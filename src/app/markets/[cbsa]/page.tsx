import { ReportShell, type ReportSearch } from "@/components/report-frame";
import { currentAccessRole } from "@/lib/access-server";
import { marketsAccessDenied } from "@/lib/markets/policy";
import { loadMetroDetail } from "@/lib/markets/read";
import { DATA_NEEDED, INTERNAL_BANNER, NOT_INVESTMENT } from "@/lib/markets/types";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MetroPage({
  params,
  searchParams,
}: {
  params: Promise<{ cbsa: string }>;
  searchParams: Promise<ReportSearch>;
}) {
  const { cbsa } = await params;
  const query = await searchParams;
  if (marketsAccessDenied(await currentAccessRole())) redirect("/unlock");
  if (!/^\d{4,5}$/.test(cbsa)) notFound();
  return (
    <ReportShell searchParams={query} pathname={`/markets/${cbsa}`}>
      {async () => {
        const detail = await loadMetroDetail(cbsa);
        if (detail && "state" in detail) {
          return (
            <div>
              <h1 className="font-display text-4xl text-navy-900">Market Ranks</h1>
              <p className="mt-3 text-sm text-ink-700">{detail.message}</p>
            </div>
          );
        }
        if (!detail) notFound();
        const back = new URLSearchParams();
        if (query.entity) back.set("entity", query.entity);
        if (query.period) back.set("period", query.period);
        if (query.view) back.set("view", query.view);
        const backHref = back.size ? `/markets?${back.toString()}` : "/markets";
        return (
          <div className="space-y-6">
            <div>
              <Link className="text-[11px] uppercase tracking-[0.16em] text-gold-700" href={backHref}>
                ← Scoreboard
              </Link>
              <h1 className="mt-2 font-display text-4xl text-navy-900">{detail.name}</h1>
              <p className="mt-1 text-sm text-ink-500">CBSA {detail.cbsa}</p>
              <p className="mt-3 max-w-3xl border border-gold-500 bg-cream-50 px-4 py-3 text-sm text-navy-900">{INTERNAL_BANNER}</p>
              <p className="mt-2 text-sm text-ink-500">{NOT_INVESTMENT}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <Fact label="Viability Score" value={detail.viability} />
              <Fact label="Rank" value={`${detail.rank} of ${detail.of}`} />
              <Fact label="Band" value={detail.band} />
              <Fact label="Confidence" value={detail.confidence} />
              <Fact label="Momentum" value={detail.momentum} />
              <Fact label="Rank interval" value={`${detail.rankP5} – ${detail.rankP95}`} />
              <Fact label="Tied in band" value={`${detail.tiedWithinBand} · ${detail.tiedCount}`} />
              <Fact label="Flags" value={detail.flags || "None"} />
            </div>
            <section className="border border-cream-300 bg-white px-5 py-4 shadow-ledger">
              <h2 className="font-display text-2xl text-navy-900">Pillars</h2>
              <div className="mt-4 space-y-3">
                {detail.pillars.map((pillar) => (
                  <div key={pillar.name}>
                    <div className="flex justify-between text-sm">
                      <span>{pillar.name}</span>
                      <span className="tabular">{pillar.score ?? DATA_NEEDED}</span>
                    </div>
                    {pillar.score ? (
                      <div className="mt-1 h-2 bg-cream-200">
                        <div className="h-2 bg-navy-800" style={{ width: `${Math.min(100, Number(pillar.score))}%` }} />
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-ink-500">{DATA_NEEDED}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
            <section className="space-y-2">
              <h2 className="font-display text-2xl text-navy-900">Metrics in this score</h2>
              <p className="max-w-3xl text-sm text-ink-700">
                This run stores the Viability Score and pillar subscores. A metro-level value for each variable is {DATA_NEEDED}.
              </p>
              <div className="overflow-x-auto border border-cream-300 bg-white shadow-ledger">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-cream-300 bg-cream-100 text-[11px] uppercase tracking-[0.12em] text-ink-500">
                      <th className="px-3 py-2 text-left">Variable</th>
                      <th className="px-3 py-2 text-left">Definition</th>
                      <th className="px-3 py-2 text-left">Source</th>
                      <th className="px-3 py-2 text-left">Metro value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.metrics.map((metric) => (
                      <tr key={metric.id} className="border-b border-cream-200 align-top">
                        <td className="px-3 py-2 font-semibold text-navy-900">{metric.id}</td>
                        <td className="px-3 py-2">{metric.definition}</td>
                        <td className="px-3 py-2">{metric.source}</td>
                        <td className="px-3 py-2">{DATA_NEEDED}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        );
      }}
    </ReportShell>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-cream-300 bg-white px-4 py-3 shadow-ledger">
      <p className="text-[11px] uppercase tracking-[0.16em] text-gold-700">{label}</p>
      <p className="mt-1 font-display text-2xl text-navy-900">{value}</p>
    </div>
  );
}
