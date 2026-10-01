import { LibraryWorkspace } from "@/components/library/library-workspace";
import { IRR_NOT_AVAILABLE } from "@/lib/returns/irr";
import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { loadLibraryRows } from "@/lib/library/facts";
import { listPickItems } from "@/lib/library/pick-lists";
import { listCriteriaPresets } from "@/lib/library/presets";
import { loadOpcoGaBudgetCents } from "@/lib/library/profile";

export const dynamic = "force-dynamic";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<ReportSearch> }) {
  const params = await searchParams;
  return (
    <ReportShell searchParams={params} pathname="/library">
      {async (ctx) => {
        const period = `${ctx.year}-${String(ctx.month).padStart(2, "0")}`;
        const [rows, presets, picks, ga] = await Promise.all([
          loadLibraryRows(),
          listCriteriaPresets(),
          listPickItems(),
          loadOpcoGaBudgetCents(),
        ]);
        return (
          <div className="space-y-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{reportSubtitle(ctx)}</p>
              <h1 className="font-display text-4xl text-navy-900">Deal Library</h1>
              <p className="mt-2 max-w-3xl text-sm text-ink-700">
                Every analyzed deal, in every status. Only Owned deals are in the OpCo roll-up. LP net IRR, LP cash yield, and RCP IRR use the deal waterfall after fees. A blank fee says fee needed. The Library column does not guess an exit cap rate. Without sale proceeds the IRR cell says {IRR_NOT_AVAILABLE}. A stale flag is a reminder. Nothing here is deleted because of age.
              </p>
            </div>
            <LibraryWorkspace
              rows={rows}
              presets={presets.map((row) => ({ id: row.id, name: row.name }))}
              picks={picks.map((row) => ({ id: row.id, kind: row.kind, label: row.label }))}
              gaBudgetCents={ga == null ? null : Number(ga)}
              period={period}
            />
          </div>
        );
      }}
    </ReportShell>
  );
}
