import { NarrativeView } from "@/components/narrative-view";
import { PackExportButtons } from "@/components/pack-export-buttons";
import { ChartSuiteView } from "@/components/rcp-charts";
import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { loadPeriodSnapshot } from "@/lib/period-snapshot";
import { buildPack, isPackId, serializeChartSuite } from "@rcp/reporting";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function PackPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ packId: string }>;
  searchParams: Promise<ReportSearch>;
}) {
  const { packId } = await params;
  if (!isPackId(packId)) notFound();
  const query = await searchParams;

  return (
    <ReportShell searchParams={query} pathname={`/narratives/packs/${packId}`}>
      {async (ctx) => {
        if (ctx.entity.type === "HOLDCO") {
          return (
            <div className="max-w-2xl">
              <h1 className="font-display text-4xl text-navy-900">No operating pack</h1>
              <p className="mt-2 text-sm text-ink-700">Switch to SPE-WBG or RCP-OPCO.</p>
            </div>
          );
        }
        const period = `${ctx.year}-${String(ctx.month).padStart(2, "0")}`;
        const snap = await loadPeriodSnapshot({
          entityId: ctx.entity.id,
          entityType: ctx.entity.type,
          year: ctx.year,
          month: ctx.month,
        });
        const pack = buildPack(snap, packId);
        const qs = new URLSearchParams({ entity: ctx.entity.code, period });
        if (ctx.consolidated) qs.set("view", "combined");
        return (
          <div className="space-y-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{reportSubtitle(ctx)}</p>
                <h1 className="font-display text-4xl text-navy-900">{pack.meta.title}</h1>
                <p className="mt-2 max-w-3xl text-sm text-ink-700">{pack.meta.description}</p>
                <p className="mt-1 text-xs text-ink-500">{pack.viewLabel} · {pack.slides.length} slides</p>
              </div>
              <PackExportButtons
                packId={packId}
                entity={ctx.entity.code}
                period={period}
                view={ctx.consolidated ? "combined" : undefined}
              />
            </div>
            <p className="text-sm">
              <Link className="text-navy-700 underline" href={`/narratives?${qs.toString()}`}>
                All audiences
              </Link>
            </p>
            <NarrativeView narrative={pack.narrative} qs={qs.toString()} />
            <ChartSuiteView suite={serializeChartSuite(pack.charts)} />
          </div>
        );
      }}
    </ReportShell>
  );
}
