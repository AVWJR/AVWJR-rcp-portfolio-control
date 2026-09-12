import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { PHASE_E_NARRATIVES_TODO } from "@rcp/analytics";

export default async function NarrativesStubPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearch>;
}) {
  const params = await searchParams;
  return (
    <ReportShell searchParams={params} pathname="/narratives">
      {(ctx) => (
        <div className="max-w-2xl space-y-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{reportSubtitle(ctx)}</p>
          <h1 className="font-display text-4xl text-navy-900">Narratives / PDF packs</h1>
          <p className="text-sm text-ink-700">{PHASE_E_NARRATIVES_TODO}</p>
          <p className="text-sm text-ink-500">
            Phase D dashboards stay book and ratio math. No lender or investor PDF is generated
            here.
          </p>
        </div>
      )}
    </ReportShell>
  );
}
