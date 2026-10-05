import { RegisterPaidSourceForm } from "@/components/markets/register-form";
import { Scoreboard } from "@/components/markets/scoreboard";
import { ReportShell, type ReportSearch } from "@/components/report-frame";
import { currentAccessRole } from "@/lib/access-server";
import { marketsAccessDenied } from "@/lib/markets/policy";
import { loadMarketsBundle, type MarketsBundle } from "@/lib/markets/read";
import { DATA_NEEDED, INTERNAL_BANNER, NOT_INVESTMENT, SCENARIO_NOTE } from "@/lib/markets/types";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "scoreboard", label: "Scoreboard" },
  { id: "metrics", label: "Metrics" },
  { id: "weightings", label: "Weightings" },
  { id: "sources", label: "Data sources" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function tabId(raw: string | undefined): TabId {
  if (raw === "metrics" || raw === "weightings" || raw === "sources") return raw;
  return "scoreboard";
}

function hrefFor(tab: TabId, search: ReportSearch): string {
  const params = new URLSearchParams();
  if (search.entity) params.set("entity", search.entity);
  if (search.period) params.set("period", search.period);
  if (search.view) params.set("view", search.view);
  if (tab !== "scoreboard") params.set("tab", tab);
  const query = params.toString();
  return query ? `/markets?${query}` : "/markets";
}

function keepQuery(search: ReportSearch): string {
  const params = new URLSearchParams();
  if (search.entity) params.set("entity", search.entity);
  if (search.period) params.set("period", search.period);
  if (search.view) params.set("view", search.view);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export default async function MarketsPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearch & { tab?: string }>;
}) {
  const params = await searchParams;
  if (marketsAccessDenied(await currentAccessRole())) redirect("/unlock");
  const tab = tabId(params.tab);
  return (
    <ReportShell searchParams={params} pathname="/markets">
      {async () => {
        const bundle = await loadMarketsBundle();
        if (bundle.state !== "ready") {
          return (
            <div>
              <h1 className="font-display text-4xl text-navy-900">Market Ranks</h1>
              <p className="mt-3 max-w-2xl text-sm text-ink-700">{bundle.message}</p>
            </div>
          );
        }
        return (
          <div className="space-y-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">
                {bundle.runLabel} · {bundle.asOfLabel}
              </p>
              <h1 className="font-display text-4xl text-navy-900">Market Ranks</h1>
              <p className="mt-2 max-w-3xl border border-gold-500 bg-cream-50 px-4 py-3 text-sm text-navy-900">{INTERNAL_BANNER}</p>
              <p className="mt-2 text-sm text-ink-500">{NOT_INVESTMENT}</p>
            </div>
            <nav className="flex flex-wrap gap-2 text-[12px] uppercase tracking-[0.14em]">
              {TABS.map((item) => (
                <Link
                  key={item.id}
                  href={hrefFor(item.id, params)}
                  className={
                    item.id === tab
                      ? "border border-navy-900 bg-navy-900 px-3 py-1.5 text-cream-50"
                      : "border border-cream-300 bg-white px-3 py-1.5 text-navy-900"
                  }
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            {tab === "scoreboard" ? <ScoreboardTab bundle={bundle} query={keepQuery(params)} /> : null}
            {tab === "metrics" ? <MetricsTab bundle={bundle} /> : null}
            {tab === "weightings" ? <WeightingsTab bundle={bundle} /> : null}
            {tab === "sources" ? <SourcesTab bundle={bundle} /> : null}
          </div>
        );
      }}
    </ReportShell>
  );
}

function ScoreboardTab({ bundle, query }: { bundle: MarketsBundle; query: string }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-700">{bundle.rows.length} metros. Rank 1 is the highest Viability Score.</p>
        <a
          href="/api/markets/export"
          className="border border-navy-900 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-navy-900"
        >
          Export CSV
        </a>
      </div>
      <Scoreboard rows={bundle.rows} query={query} />
    </div>
  );
}

function MetricsTab({ bundle }: { bundle: MarketsBundle }) {
  return (
    <div className="overflow-x-auto border border-cream-300 bg-white shadow-ledger">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-cream-300 bg-cream-100 text-[11px] uppercase tracking-[0.12em] text-ink-500">
            <th className="px-3 py-2 text-left">Variable</th>
            <th className="px-3 py-2 text-left">Pillar</th>
            <th className="px-3 py-2 text-left">What it measures</th>
            <th className="px-3 py-2 text-left">Source</th>
            <th className="px-3 py-2 text-left">In score today</th>
            <th className="px-3 py-2 text-left">Unit</th>
            <th className="px-3 py-2 text-left">Sign</th>
          </tr>
        </thead>
        <tbody>
          {bundle.metrics.map((metric) => (
            <tr key={metric.id} className="border-b border-cream-200 align-top">
              <td className="px-3 py-2 font-semibold text-navy-900">{metric.name}</td>
              <td className="px-3 py-2">{metric.pillar}</td>
              <td className="px-3 py-2">{metric.definition}</td>
              <td className="px-3 py-2">{metric.source}</td>
              <td className="px-3 py-2">{metric.inScoreToday}</td>
              <td className="px-3 py-2">{metric.unit}</td>
              <td className="px-3 py-2">{metric.expectedSign}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WeightingsTab({ bundle }: { bundle: MarketsBundle }) {
  const pillars = bundle.weights.filter((row) => row.scope === "PILLAR");
  const variables = bundle.weights.filter((row) => row.scope === "VARIABLE");
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-ink-700">{bundle.derivation}</p>
      <div className="overflow-x-auto border border-cream-300 bg-white shadow-ledger">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-300 bg-cream-100 text-[11px] uppercase tracking-[0.12em] text-ink-500">
              <th className="px-3 py-2 text-left">Pillar</th>
              <th className="px-3 py-2 text-right">Weight</th>
              <th className="px-3 py-2 text-left">Notes</th>
            </tr>
          </thead>
          <tbody>
            {pillars.map((row) => (
              <tr key={row.pillar} className="border-b border-cream-200">
                <td className="px-3 py-2">{row.pillar}</td>
                <td className="tabular px-3 py-2 text-right">{row.weight}</td>
                <td className="px-3 py-2">{row.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto border border-cream-300 bg-white shadow-ledger">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-300 bg-cream-100 text-[11px] uppercase tracking-[0.12em] text-ink-500">
              <th className="px-3 py-2 text-left">Variable</th>
              <th className="px-3 py-2 text-left">Pillar</th>
              <th className="px-3 py-2 text-right">Within pillar</th>
              <th className="px-3 py-2 text-left">Notes</th>
            </tr>
          </thead>
          <tbody>
            {variables.map((row) => (
              <tr key={row.variableId} className="border-b border-cream-200">
                <td className="px-3 py-2 font-semibold text-navy-900">{row.variableId}</td>
                <td className="px-3 py-2">{row.pillar}</td>
                <td className="tabular px-3 py-2 text-right">{row.weight}</td>
                <td className="px-3 py-2">{row.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="border border-cream-300 bg-white px-5 py-4 shadow-ledger">
        <h2 className="font-display text-2xl text-navy-900">Backtest</h2>
        <p className="mt-2 max-w-3xl text-sm text-ink-700">{bundle.backtest || DATA_NEEDED}</p>
        <p className="mt-2 max-w-3xl text-sm text-ink-500">{SCENARIO_NOTE}</p>
      </section>
    </div>
  );
}

function SourcesTab({ bundle }: { bundle: MarketsBundle }) {
  const active = bundle.sources.filter((source) => source.feedsScore);
  const rest = bundle.sources.filter((source) => !source.feedsScore);
  return (
    <div className="space-y-6">
      <SourceTable title="Active free sources in this score" rows={active} />
      <SourceTable title="Inactive and paid registry" rows={rest} />
      <RegisterPaidSourceForm />
    </div>
  );
}

function SourceTable({
  title,
  rows,
}: {
  title: string;
  rows: MarketsBundle["sources"];
}) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-2xl text-navy-900">{title}</h2>
      <div className="overflow-x-auto border border-cream-300 bg-white shadow-ledger">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-300 bg-cream-100 text-[11px] uppercase tracking-[0.12em] text-ink-500">
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-left">Publisher</th>
              <th className="px-3 py-2 text-left">License</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">In this score</th>
              <th className="px-3 py-2 text-left">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((source) => (
              <tr key={source.id} className="border-b border-cream-200 align-top">
                <td className="px-3 py-2">
                  <p className="font-semibold text-navy-900">{source.name}</p>
                  {source.url ? (
                    <a className="text-xs text-navy-700 underline" href={source.url}>
                      {source.url}
                    </a>
                  ) : (
                    <p className="text-xs text-ink-500">{DATA_NEEDED}</p>
                  )}
                </td>
                <td className="px-3 py-2">{source.publisher}</td>
                <td className="px-3 py-2">{source.licenseBasis}</td>
                <td className="px-3 py-2">{source.status}</td>
                <td className="px-3 py-2">{source.feedsScore ? "Yes" : "No"}</td>
                <td className="px-3 py-2 text-ink-700">{source.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
