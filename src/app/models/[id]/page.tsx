import { ModelDetail } from "@/components/models/model-controls";
import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { DEAL_STATUS_LABEL, effectiveDealStatus } from "@/lib/deal-status";
import { listPickItems } from "@/lib/library/pick-lists";
import type { CriterionField } from "@/lib/library/criteria";
import { loadModelProjection } from "@/lib/models/store";
import { toModelView } from "@/lib/models/view";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ModelDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ReportSearch>;
}) {
  const { id } = await params;
  const query = await searchParams;
  return (
    <ReportShell searchParams={query} pathname={`/models/${id}`}>
      {async (ctx) => {
        const loaded = await loadModelProjection(id, ctx.year, ctx.month).catch(() => null);
        if (!loaded) notFound();
        const [entities, picks] = await Promise.all([
          prisma.entity.findMany({ where: { type: "SPE" }, orderBy: { code: "asc" }, select: { code: true, name: true, dealStatus: true, lifecycleStatus: true } }),
          listPickItems(),
        ]);
        const choices: Partial<Record<CriterionField, string[]>> = {
          state: picks.filter((row) => row.kind === "state").map((row) => row.label),
          metro: picks.filter((row) => row.kind === "metro").map((row) => row.label),
          propertyType: picks.filter((row) => row.kind === "property_type").map((row) => row.label),
          dealStatus: ["Pipeline", "Screened", "Owned", "Archived", "Test"],
        };
        const periodQuery = `entity=${ctx.entity.code}&period=${ctx.year}-${String(ctx.month).padStart(2, "0")}`;
        return (
          <div className="space-y-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{reportSubtitle(ctx)}</p>
              <h1 className="font-display text-4xl text-navy-900">{loaded.name}</h1>
              <p className="mt-2 text-sm text-ink-700">{loaded.kind === "TEST" ? "Test Model." : "Model."} Hard limits apply. Preference rows are stored for the Phase 3 optimizer.</p>
            </div>
            <ModelDetail
              view={toModelView(loaded)}
              choices={choices}
              periodQuery={periodQuery}
              deals={entities.map((entity) => {
                const status = effectiveDealStatus(entity);
                return { code: entity.code, name: entity.name, status: DEAL_STATUS_LABEL[status] };
              })}
            />
          </div>
        );
      }}
    </ReportShell>
  );
}
