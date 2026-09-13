import { BrokerOverlayStrip } from "@/components/broker-overlay-strip";
import { DashboardTiles } from "@/components/dashboard-tiles";
import { NoiConcentration } from "@/components/noi-concentration";
import { ReapplyRentRollButton } from "@/components/reapply-rent-roll";
import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { buildDashboardForEntity, type OpCoDashboard, type PropertyDashboard } from "@/lib/dashboards";
import { formatUsd } from "@rcp/ledger";
import { formatRatioBps } from "@rcp/properties";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export default async function EntityDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ entityCode: string }>;
  searchParams: Promise<ReportSearch>;
}) {
  const { entityCode } = await params;
  const query = await searchParams;
  const merged: ReportSearch =
    entityCode.startsWith("SPE")
      ? { ...query, entity: entityCode, view: undefined }
      : { ...query, entity: entityCode, view: query.view ?? "combined" };

  return (
    <ReportShell searchParams={merged} pathname={`/dashboard/${entityCode}`}>
      {async (ctx) => {
        if (ctx.entity.code !== entityCode) {
          const period = `${ctx.year}-${String(ctx.month).padStart(2, "0")}`;
          const view = ctx.entity.type === "OPCO" ? "&view=combined" : "";
          redirect(`/dashboard/${ctx.entity.code}?entity=${ctx.entity.code}&period=${period}${view}`);
        }
        if (ctx.entity.type === "HOLDCO") {
          notFound();
        }
        const dash = await buildDashboardForEntity({
          entityId: ctx.entity.id,
          entityType: ctx.entity.type,
          year: ctx.year,
          month: ctx.month,
        });
        return dash.kind === "opco" ? (
          <OpCoView ctxLabel={reportSubtitle(ctx)} dash={dash} />
        ) : (
          <PropertyView ctxLabel={reportSubtitle(ctx)} dash={dash} />
        );
      }}
    </ReportShell>
  );
}

function PropertyView({ ctxLabel, dash }: { ctxLabel: string; dash: PropertyDashboard }) {
  const q = `entity=${dash.entityCode}&period=${dash.period}`;
  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{ctxLabel}</p>
        <h1 className="font-display text-4xl text-navy-900">{dash.entityName}</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink-700">
          Property ratio dashboard · {dash.unitCount} units
          {dash.strategy ? ` · ${dash.strategy.replaceAll("_", " ")}` : ""} · {dash.viewLabel}.
          Every tile opens the formula, NOI definition, and contributing accounts or rent-roll
          fields. Delinquency and LTV stay gated.
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link className="text-navy-700 underline" href={`/reports/operating-statement?${q}`}>
            Operating statement
          </Link>
          <Link className="text-navy-700 underline" href={`/reports/trial-balance?${q}`}>
            Trial balance
          </Link>
          <Link className="text-navy-700 underline" href={`/debt?${q}`}>
            Debt file
          </Link>
          <Link className="text-navy-700 underline" href={`/properties/${dash.entityCode}?${q}`}>
            Rent roll
          </Link>
          <Link className="text-navy-700 underline" href={`/dashboard/ratios?${q}`}>
            Ratio dictionary
          </Link>
          <Link className="text-navy-700 underline" href={`/narratives?${q}`}>
            Narratives / packs
          </Link>
        </div>
      </div>
      {dash.unitCount === 0 ? <ReapplyRentRollButton entityCode={dash.entityCode} /> : null}
      <BrokerOverlayStrip overlay={dash.brokerOverlay} />
      <DashboardTiles tiles={dash.tiles} entityCode={dash.entityCode} period={dash.period} />
    </div>
  );
}

function OpCoView({ ctxLabel, dash }: { ctxLabel: string; dash: OpCoDashboard }) {
  const q = `entity=${dash.entityCode}&period=${dash.period}&view=combined`;
  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{ctxLabel}</p>
        <h1 className="font-display text-4xl text-navy-900">OpCo portfolio</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink-700">
          {dash.lookThroughLabel}. Operating KPIs stack wholly owned SPE books. The navy header
          combined view is a <strong>combined roll-up</strong> — it is not a GAAP consolidation.
        </p>
        <p className="mt-2 max-w-3xl text-sm text-ink-500">{dash.combinedNote}</p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link className="text-navy-700 underline" href={`/reports/operating-statement?${q}`}>
            Combined operating statement
          </Link>
          <Link className="text-navy-700 underline" href={`/debt?${q}`}>
            Portfolio debt
          </Link>
          <Link className="text-navy-700 underline" href={`/dashboard/ratios?${q}`}>
            Ratio dictionary
          </Link>
          <Link className="text-navy-700 underline" href={`/narratives?${q}`}>
            Narratives / packs
          </Link>
        </div>
      </div>
      <DashboardTiles tiles={dash.tiles} entityCode={dash.entityCode} period={dash.period} view="combined" />
      <NoiConcentration rows={dash.concentration} period={dash.period} />
      <section className="border border-cream-300 bg-white px-5 py-4 shadow-ledger">
        <h2 className="font-display text-2xl text-navy-900">Properties</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cream-300 text-[11px] uppercase tracking-[0.12em] text-ink-500">
                <th className="py-2 text-left">SPE</th>
                <th className="py-2 text-right">Units</th>
                <th className="py-2 text-left">Strategy</th>
                <th className="py-2 text-right">Period NOI</th>
                <th className="py-2 text-right">Share</th>
              </tr>
            </thead>
            <tbody>
              {dash.properties.map((p) => {
                const share = dash.concentration.find((c) => c.entityCode === p.entityCode);
                return (
                  <tr key={p.entityCode} className="border-b border-cream-200">
                    <td className="py-2">
                      <Link className="font-semibold text-navy-900 underline" href={p.href}>
                        {p.entityCode}
                      </Link>
                      <span className="ml-2 text-ink-500">{p.entityName}</span>
                    </td>
                    <td className="tabular py-2 text-right">{p.unitCount}</td>
                    <td className="py-2 text-ink-700">{p.strategy?.replaceAll("_", " ") ?? "—"}</td>
                    <td className="tabular py-2 text-right">{formatUsd(p.noiCents)}</td>
                    <td className="tabular py-2 text-right">{formatRatioBps(share?.shareBps ?? null)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="border border-cream-300 bg-white px-5 py-4 shadow-ledger">
        <h2 className="font-display text-2xl text-navy-900">Covenant watchlist</h2>
        <p className="mt-1 text-sm text-ink-700">
          Loan-file DSCR / debt-yield fails and maturities inside 12 months. Value-add monthly DSCR
          below 1.25x is a control result, not a bug.
        </p>
        {dash.watchlist.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">No watch items for this period.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cream-300 text-[11px] uppercase tracking-[0.12em] text-ink-500">
                  <th className="py-2 text-left">SPE</th>
                  <th className="py-2 text-left">Lender</th>
                  <th className="py-2 text-left">Flag</th>
                  <th className="py-2 text-right">DSCR</th>
                  <th className="py-2 text-right">Debt yield</th>
                  <th className="py-2 text-right">Months</th>
                </tr>
              </thead>
              <tbody>
                {dash.watchlist.map((row) => (
                  <tr key={row.entityCode} className="border-b border-cream-200">
                    <td className="py-2">
                      <Link className="font-semibold text-navy-900 underline" href={row.href}>
                        {row.entityCode}
                      </Link>
                    </td>
                    <td className="py-2">{row.lenderName}</td>
                    <td className="py-2 text-gold-700">{row.reason}</td>
                    <td className="tabular py-2 text-right">{row.dscrDisplay}</td>
                    <td className="tabular py-2 text-right">{row.debtYieldDisplay}</td>
                    <td className="tabular py-2 text-right">{row.monthsRemaining}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
