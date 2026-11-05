import { ModelCompare } from "@/components/models/model-controls";
import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { compareModelProjections } from "@/lib/models/store";
import { toModelView } from "@/lib/models/view";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ModelComparePage({ searchParams }: { searchParams: Promise<ReportSearch & { ids?: string }> }) {
  const query = await searchParams;
  const ids = (query.ids ?? "").split(",").map((id) => id.trim()).filter(Boolean).slice(0, 4);
  return (
    <ReportShell searchParams={query} pathname="/models/compare">
      {async (ctx) => {
        const rows = ids.length ? await compareModelProjections(ids, ctx.year, ctx.month) : [];
        const periodQuery = `entity=${ctx.entity.code}&period=${ctx.year}-${String(ctx.month).padStart(2, "0")}`;
        return (
          <div className="space-y-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{reportSubtitle(ctx)}</p>
              <h1 className="font-display text-4xl text-navy-900">Compare Models</h1>
              <p className="mt-2 max-w-3xl text-sm text-ink-700">Up to four Models, side by side. Projection, not books. The OpCo dashboard is unchanged.</p>
              <Link className="mt-2 inline-block text-sm text-navy-800 underline" href={`/models?${periodQuery}`}>All Models</Link>
            </div>
            <ModelCompare views={rows.map((row) => toModelView(row))} />
          </div>
        );
      }}
    </ReportShell>
  );
}
