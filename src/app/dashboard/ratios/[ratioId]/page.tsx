import { RatioDrilldown } from "@/components/ratio-drilldown";
import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { buildDashboardForEntity, liveRatioById } from "@/lib/dashboards";
import { getRatioDefinition, isRatioId, statementHref } from "@rcp/analytics";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function RatioDefinitionPage({
  params,
  searchParams,
}: {
  params: Promise<{ ratioId: string }>;
  searchParams: Promise<ReportSearch>;
}) {
  const { ratioId } = await params;
  const query = await searchParams;
  if (!isRatioId(ratioId)) notFound();
  const definition = getRatioDefinition(ratioId);
  if (!definition) notFound();

  return (
    <ReportShell searchParams={query} pathname={`/dashboard/ratios/${ratioId}`}>
      {async (ctx) => {
        const period = `${ctx.year}-${String(ctx.month).padStart(2, "0")}`;
        const dash =
          ctx.entity.type === "HOLDCO"
            ? null
            : await buildDashboardForEntity({
                entityId: ctx.entity.id,
                entityType: ctx.entity.type,
                year: ctx.year,
                month: ctx.month,
              });
        const tile = dash ? liveRatioById(dash.tiles, ratioId) : undefined;
        const dashHref =
          ctx.entity.type === "SPE"
            ? `/dashboard/${ctx.entity.code}?entity=${ctx.entity.code}&period=${period}`
            : `/dashboard/${ctx.entity.code}?entity=${ctx.entity.code}&period=${period}&view=combined`;
        return (
          <div className="space-y-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{reportSubtitle(ctx)}</p>
              <p className="text-sm">
                <Link className="text-navy-700 underline" href={`/dashboard/ratios?entity=${ctx.entity.code}&period=${period}`}>
                  Ratio dictionary
                </Link>
                {" · "}
                <Link className="text-navy-700 underline" href={dashHref}>
                  Dashboard
                </Link>
              </p>
            </div>
            {tile ? (
              <RatioDrilldown tile={tile} entityCode={ctx.entity.code} period={period} />
            ) : (
              <div className="border border-cream-300 bg-white px-5 py-4 shadow-ledger">
                <h1 className="font-display text-3xl text-navy-900">{definition.label}</h1>
                <p className="mt-2 font-mono text-sm">{definition.formula}</p>
                <p className="mt-3 text-sm text-ink-700">{definition.description}</p>
                <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
                  {definition.contributors.map((c) => (
                    <li key={`${c.kind}-${c.code ?? c.field ?? c.label}`}>
                      {c.statement ? (
                        <Link
                          className="text-navy-700 underline"
                          href={statementHref(c.statement, ctx.entity.code, period, ctx.consolidated ? "combined" : undefined)}
                        >
                          {c.label}
                        </Link>
                      ) : (
                        c.label
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      }}
    </ReportShell>
  );
}
