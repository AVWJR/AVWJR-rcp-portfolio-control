import { AssumptionsForm } from "@/components/models/model-controls";
import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { loadModelProjection } from "@/lib/models/store";
import { toModelView } from "@/lib/models/view";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ModelAssumptionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ReportSearch>;
}) {
  const { id } = await params;
  const query = await searchParams;
  return (
    <ReportShell searchParams={query} pathname={`/models/${id}/assumptions`}>
      {async (ctx) => {
        const loaded = await loadModelProjection(id, ctx.year, ctx.month).catch(() => null);
        if (!loaded) notFound();
        const periodQuery = `entity=${ctx.entity.code}&period=${ctx.year}-${String(ctx.month).padStart(2, "0")}`;
        return (
          <div className="space-y-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{reportSubtitle(ctx)}</p>
              <h1 className="font-display text-4xl text-navy-900">{loaded.name} assumptions</h1>
            </div>
            <AssumptionsForm view={toModelView(loaded)} periodQuery={periodQuery} />
          </div>
        );
      }}
    </ReportShell>
  );
}
