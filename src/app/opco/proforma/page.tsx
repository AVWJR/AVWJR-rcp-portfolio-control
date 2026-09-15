import { OpCoProformaView } from "@/components/deals/proforma-view";
import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { loadOpCoProformaSeeds } from "@/lib/proforma-load";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function OpCoProformaPage({ searchParams }: { searchParams: Promise<ReportSearch> }) {
  const query = await searchParams;
  const merged: ReportSearch = { ...query, entity: "RCP-OPCO", view: "combined" };

  return (
    <ReportShell searchParams={merged} pathname="/opco/proforma">
      {async (ctx) => {
        const opco = await prisma.entity.findUnique({ where: { code: "RCP-OPCO" } });
        if (!opco || opco.type !== "OPCO") notFound();
        const period = `${ctx.year}-${String(ctx.month).padStart(2, "0")}`;
        const seeds = await loadOpCoProformaSeeds({ opcoId: opco.id, year: ctx.year, month: ctx.month });

        return (
          <div className="space-y-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{reportSubtitle(ctx)}</p>
              <h1 className="font-display text-4xl text-navy-900">OpCo proforma</h1>
              <p className="mt-2 max-w-3xl text-sm text-ink-700">
                Forward-looking <strong>OpCo LPs</strong> (aggregated Deal LPs) and <strong>OpCo GPs (RCP platform)</strong>{" "}
                after each live SPE’s waterfall and Co-GP. Soft-archived SPEs stay out. Not a GAAP consolidation.
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                <Link
                  className="text-navy-700 underline"
                  href={`/dashboard/RCP-OPCO?entity=RCP-OPCO&period=${period}&view=combined`}
                >
                  OpCo dashboard
                </Link>
                <Link className="text-navy-700 underline" href={`/deals?entity=RCP-OPCO&period=${period}`}>
                  Deals
                </Link>
              </div>
            </div>
            <OpCoProformaView period={period} seeds={seeds} />
          </div>
        );
      }}
    </ReportShell>
  );
}
