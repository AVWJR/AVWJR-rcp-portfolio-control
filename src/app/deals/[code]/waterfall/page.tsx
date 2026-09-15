import { ArchivedSpeBanner } from "@/components/archived-spe-banner";
import { WaterfallForm } from "@/components/deals/waterfall-form";
import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { currentAccessRole } from "@/lib/access-server";
import { europeanPromoteOpen, loadLiveSpeWaterfalls, loadSpeWaterfall } from "@/lib/waterfall";
import { cfadsCents, cashBreakdown, periodPpeAdditionsCents } from "@rcp/analytics";
import { buildIncomeStatement, formatUsd, netByCode, principalPaydownFromLines, rollupBalances } from "@rcp/ledger";
import { buildOperatingPackage } from "@/lib/operating";
import { loadPortfolioDebt } from "@/lib/debt-view";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function DealWaterfallPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<ReportSearch>;
}) {
  const { code } = await params;
  const query = await searchParams;
  const merged: ReportSearch = { ...query, entity: code, view: undefined };

  return (
    <ReportShell searchParams={merged} pathname={`/deals/${code}/waterfall`}>
      {async (ctx) => {
        if (ctx.entity.type !== "SPE" || ctx.entity.code !== code) notFound();
        const role = await currentAccessRole();
        const period = `${ctx.year}-${String(ctx.month).padStart(2, "0")}`;
        const record = await loadSpeWaterfall(ctx.entity.id);
        if (!record) notFound();

        const pack = await buildOperatingPackage({
          entityId: ctx.entity.id,
          year: ctx.year,
          month: ctx.month,
          consolidated: false,
        });
        const balances = rollupBalances(pack.scope.throughEnd);
        const endMap = new Map(balances.map((row) => [row.code, netByCode(balances, row.code)]));
        const startBalances = rollupBalances(pack.scope.throughStart);
        const startMap = new Map(startBalances.map((row) => [row.code, netByCode(startBalances, row.code)]));
        const cash = cashBreakdown(endMap);
        const is = buildIncomeStatement({
          throughEnd: pack.scope.throughEnd,
          throughStart: pack.scope.throughStart,
          inPeriod: pack.scope.inPeriod,
        });
        const loans = (await loadPortfolioDebt(ctx.year, ctx.month)).filter((l) => l.entityCode === code);
        const reserveReq = loans[0]?.reserveRequirementCents ?? 0n;
        const periodCapex = periodPpeAdditionsCents(startMap, endMap);
        const cfads = cfadsCents({
          periodNoiCents: is.noi,
          periodCapexCents: periodCapex,
          reserveRequirementCents: reserveReq,
        });
        const parentId = ctx.entity.parentId;
        const siblings = parentId ? await loadLiveSpeWaterfalls(parentId) : [record];
        const gate = europeanPromoteOpen(siblings, 1);

        return (
          <div className="space-y-6">
            {ctx.archived ? <ArchivedSpeBanner code={code} period={period} /> : null}
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{reportSubtitle(ctx)}</p>
              <h1 className="font-display text-4xl text-navy-900">LP / GP waterfall</h1>
              <p className="mt-2 max-w-3xl text-sm text-ink-700">
                Deal-level distribution waterfall for <strong>{ctx.entity.name}</strong>. Default is{" "}
                <strong>100% look-through</strong> (today’s OpCo stack) until you pick a template. Saving amends cash /
                CFADS up to RCP OpCo — not property NOI, and not a GAAP consolidation. Soft-archived SPEs stay out of
                live rollup.
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                <Link className="text-navy-700 underline" href={`/deals?entity=${code}&period=${period}`}>
                  Deals
                </Link>
                <Link className="text-navy-700 underline" href={`/dashboard/${code}?entity=${code}&period=${period}`}>
                  SPE dashboard
                </Link>
                <Link
                  className="text-navy-700 underline"
                  href={`/dashboard/RCP-OPCO?entity=RCP-OPCO&period=${period}&view=combined`}
                >
                  OpCo rollup
                </Link>
              </div>
              <p className="mt-2 text-sm text-ink-600">
                Period CFADS {formatUsd(cfads)} · SPE cash {formatUsd(cash.total)} · principal this month{" "}
                {formatUsd(principalPaydownFromLines(pack.scope.throughStart, pack.scope.throughEnd))} (debt service is
                not a waterfall input).
              </p>
            </div>
            {role === "principal" ? (
              <WaterfallForm
                entityCode={code}
                entityName={ctx.entity.name}
                period={period}
                distributableCents={cfads.toString()}
                cashCents={cash.total.toString()}
                europeanPromoteOpen={gate}
                initial={{
                  ...record.config,
                  lpContributedCents: record.lpContributedCents,
                  unreturnedCapitalCents: record.unreturnedCapitalCents,
                  unpaidPrefCents: record.unpaidPrefCents,
                  prefPaidToDateCents: record.prefPaidToDateCents,
                }}
              />
            ) : (
              <p className="border border-cream-300 bg-white px-5 py-4 text-sm text-ink-700 shadow-ledger">
                Partner view is read-only. Waterfall templates are Principal-only.
              </p>
            )}
          </div>
        );
      }}
    </ReportShell>
  );
}
