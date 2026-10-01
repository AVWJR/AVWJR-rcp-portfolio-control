import { ModelFeesForm } from "@/components/models/model-controls";
import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { loadOpcoGaBudgetCents } from "@/lib/library/profile";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ModelFeesPage({ searchParams }: { searchParams: Promise<ReportSearch> }) {
  const params = await searchParams;
  const ga = await loadOpcoGaBudgetCents();
  return (
    <ReportShell searchParams={params} pathname="/models/fees">
      {async (ctx) => {
        const periodQuery = `entity=${ctx.entity.code}&period=${ctx.year}-${String(ctx.month).padStart(2, "0")}`;
        return (
          <div className="space-y-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{reportSubtitle(ctx)}</p>
              <h1 className="font-display text-4xl text-navy-900">Model fees</h1>
              <p className="mt-2 max-w-3xl text-sm text-ink-700">
                G&amp;A coverage uses this budget. Deal fees stay on the deal profile. A blank shows fee needed.
              </p>
              <Link className="mt-2 inline-block text-sm text-navy-800 underline" href={`/models?${periodQuery}`}>All Models</Link>
            </div>
            <ModelFeesForm gaBudgetCents={ga == null ? null : Number(ga)} />
          </div>
        );
      }}
    </ReportShell>
  );
}
