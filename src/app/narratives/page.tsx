import { AudienceTabs, NarrativeView } from "@/components/narrative-view";
import { PackExportButtons } from "@/components/pack-export-buttons";
import { ChartSuiteView } from "@/components/rcp-charts";
import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { loadPeriodSnapshot } from "@/lib/period-snapshot";
import { PACK_CATALOG, buildAllNarratives, buildChartSuite, isAudienceId, serializeChartSuite } from "@rcp/reporting";
import Link from "next/link";

export default async function NarrativesPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearch & { audience?: string }>;
}) {
  const params = await searchParams;
  const audience = params.audience && isAudienceId(params.audience) ? params.audience : "lp";
  const merged: ReportSearch & { audience?: string } =
    params.entity === "RCP-OPCO" ? { ...params, view: params.view ?? "combined" } : params;

  return (
    <ReportShell searchParams={merged} pathname="/narratives">
      {async (ctx) => {
        const period = `${ctx.year}-${String(ctx.month).padStart(2, "0")}`;
        const qs = new URLSearchParams({ entity: ctx.entity.code, period });
        if (ctx.consolidated) qs.set("view", "combined");
        if (ctx.entity.type === "HOLDCO") {
          return (
            <div className="max-w-2xl space-y-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{reportSubtitle(ctx)}</p>
              <h1 className="font-display text-4xl text-navy-900">Narratives / report packs</h1>
              <p className="text-sm text-ink-700">
                HoldCo has no operating pack. Switch to RCP-OPCO (combined roll-up) or SPE-WBG.
              </p>
            </div>
          );
        }
        const snap = await loadPeriodSnapshot({
          entityId: ctx.entity.id,
          entityType: ctx.entity.type,
          year: ctx.year,
          month: ctx.month,
        });
        const narratives = buildAllNarratives(snap);
        const suite = serializeChartSuite(buildChartSuite(snap));
        const q = qs.toString();
        return (
          <div className="space-y-8">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{reportSubtitle(ctx)}</p>
              <h1 className="font-display text-4xl text-navy-900">Narratives / report packs</h1>
              <p className="mt-2 max-w-3xl text-sm text-ink-700">
                Phase E institutional reporting. Five audience tones regenerate from the same period
                snapshot. Charts reprint Phase D ratio math — AM fees stay below NOI, T12 is not
                silently annualized, LTV and delinquency stay gated. Combined roll-up is not a GAAP
                consolidation.
              </p>
            </div>
            <section className="grid gap-4 md:grid-cols-2">
              {PACK_CATALOG.map((pack) => (
                <article key={pack.id} className="border border-cream-300 bg-white px-5 py-4 shadow-ledger">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-gold-700">{pack.cadence}</p>
                  <h2 className="font-display text-2xl text-navy-900">{pack.title}</h2>
                  <p className="mt-1 text-sm text-ink-700">{pack.description}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Link className="text-sm text-navy-700 underline" href={`/narratives/packs/${pack.id}?${q}`}>
                      Preview pack
                    </Link>
                    <PackExportButtons
                      packId={pack.id}
                      entity={ctx.entity.code}
                      period={period}
                      view={ctx.consolidated ? "combined" : undefined}
                    />
                  </div>
                </article>
              ))}
            </section>
            <AudienceTabs active={audience} qs={q} />
            <NarrativeView narrative={narratives[audience]} qs={q} />
            <ChartSuiteView suite={suite} />
          </div>
        );
      }}
    </ReportShell>
  );
}
