import { ModelList } from "@/components/models/model-controls";
import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { listModels } from "@/lib/models/store";

export const dynamic = "force-dynamic";

export default async function ModelsPage({ searchParams }: { searchParams: Promise<ReportSearch> }) {
  const params = await searchParams;
  const models = await listModels();
  return (
    <ReportShell searchParams={params} pathname="/models">
      {async (ctx) => {
        const periodQuery = `entity=${ctx.entity.code}&period=${ctx.year}-${String(ctx.month).padStart(2, "0")}`;
        return (
          <div className="space-y-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{reportSubtitle(ctx)}</p>
              <h1 className="font-display text-4xl text-navy-900">Models</h1>
              <p className="mt-2 max-w-3xl text-sm text-ink-700">
                A Model is a named what-if list. It uses the same waterfall as the live books and does not post journals, write the distribution ledger, or change a deal. Projection, not books. Compare up to four.
              </p>
            </div>
            <ModelList
              periodQuery={periodQuery}
              models={models.map((model) => ({ id: model.id, name: model.name, kind: model.kind, deals: model.deals.length }))}
            />
          </div>
        );
      }}
    </ReportShell>
  );
}
