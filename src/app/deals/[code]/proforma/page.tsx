import { ArchivedSpeBanner } from "@/components/archived-spe-banner";
import { DealProformaView } from "@/components/deals/proforma-view";
import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { loadDealProformaSeed } from "@/lib/proforma-load";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function DealProformaPage({
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
    <ReportShell searchParams={merged} pathname={`/deals/${code}/proforma`}>
      {async (ctx) => {
        if (ctx.entity.type !== "SPE" || ctx.entity.code !== code) notFound();
        const period = `${ctx.year}-${String(ctx.month).padStart(2, "0")}`;
        const seed = await loadDealProformaSeed({
          entityId: ctx.entity.id,
          entityCode: ctx.entity.code,
          parentId: ctx.entity.parentId,
          year: ctx.year,
          month: ctx.month,
        });
        if (!seed) notFound();

        return (
          <div className="space-y-6">
            {ctx.archived ? <ArchivedSpeBanner code={code} period={period} /> : null}
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{reportSubtitle(ctx)}</p>
              <h1 className="font-display text-4xl text-navy-900">Deal proforma</h1>
              <p className="mt-2 max-w-3xl text-sm text-ink-700">
                Forward-looking cash and returns for <strong>Deal LPs</strong> and <strong>Deal GPs</strong> (RCP +
                optional Co-GP) on this SPE. Same waterfall as live OpCo rollup and LP packs.
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                <Link className="text-navy-700 underline" href={`/deals/${code}/waterfall?entity=${code}&period=${period}`}>
                  LP/GP waterfall
                </Link>
                <Link className="text-navy-700 underline" href={`/dashboard/${code}?entity=${code}&period=${period}`}>
                  SPE dashboard
                </Link>
                <Link
                  className="text-navy-700 underline"
                  href={`/opco/proforma?entity=RCP-OPCO&period=${period}&view=combined`}
                >
                  OpCo proforma
                </Link>
              </div>
            </div>
            <DealProformaView period={period} seed={seed} />
          </div>
        );
      }}
    </ReportShell>
  );
}
