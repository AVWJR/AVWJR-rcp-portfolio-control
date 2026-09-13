import { ExportLinks, TaxDisclaimer } from "@/components/tax-disclaimer";
import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { loadBooksToTaxWorksheet } from "@/lib/tax-bridge";
import { formatUsd } from "@rcp/ledger";
import { MACRS_LIFE_HOOKS } from "@rcp/tax-bridge";
import Link from "next/link";

export default async function TaxBridgePage({
  searchParams,
}: {
  searchParams: Promise<ReportSearch>;
}) {
  const params = await searchParams;
  const merged: ReportSearch =
    params.entity === "RCP-OPCO" && !params.view ? { ...params, view: params.view } : params;

  return (
    <ReportShell searchParams={merged} pathname="/tax">
      {async (ctx) => {
        const period = `${ctx.year}-${String(ctx.month).padStart(2, "0")}`;
        const qs = new URLSearchParams({ entity: ctx.entity.code, period });
        if (ctx.consolidated) qs.set("view", "combined");
        const ws = await loadBooksToTaxWorksheet({
          entityId: ctx.entity.id,
          year: ctx.year,
          month: ctx.month,
          consolidated: ctx.consolidated,
        });
        return (
          <div className="space-y-8">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{reportSubtitle(ctx)}</p>
              <h1 className="font-display text-4xl text-navy-900">Books-to-tax bridge</h1>
              <p className="mt-2 max-w-3xl text-sm text-ink-700">
                Per-entity worksheet comparing book net income, depreciation, interest, and AM fees to
                tax columns. MACRS lives are hooks (27.5 / 15 / 5), not a filing engine. Every line is
                labeled <strong>BOOKS</strong>, <strong>TAX</strong>, or <strong>BRIDGE</strong>.
              </p>
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <Link className="text-navy-700 underline" href={`/tax/k1?${qs}`}>
                  Partner capital / K-1 export
                </Link>
                <Link className="text-navy-700 underline" href={`/vendors?${qs}`}>
                  1099 vendor hooks
                </Link>
              </div>
            </div>
            <TaxDisclaimer extra={ws.viewLabel} />
            <ExportLinks href={`/api/tax/bridge?${qs}`} label="bridge" />

            <section className="border border-cream-300 bg-white shadow-ledger">
              <div className="border-b border-cream-300 bg-navy-900 px-6 py-4 text-cream-100">
                <p className="text-[11px] uppercase tracking-[0.2em] text-gold-400">{ws.viewLabel}</p>
                <h2 className="font-display text-2xl">Worksheet · {ws.entityCode} · {ws.period}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-cream-300 bg-cream-100 text-[11px] uppercase tracking-[0.12em] text-ink-500">
                      <th className="px-4 py-2 text-left">Line</th>
                      <th className="px-4 py-2 text-left">Basis</th>
                      <th className="px-4 py-2 text-right">Books</th>
                      <th className="px-4 py-2 text-right">Tax</th>
                      <th className="px-4 py-2 text-right">Tax − books</th>
                      <th className="px-4 py-2 text-left">MACRS / notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ws.lines.map((line) => (
                      <tr key={line.key} className="border-t border-cream-200">
                        <td className="px-4 py-1.5 text-navy-900">
                          {line.label}
                          {line.accountCode ? (
                            <span className="ml-2 text-[10px] uppercase text-ink-500">{line.accountCode}</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-1.5">
                          <span
                            className={
                              line.basis === "BOOKS"
                                ? "text-navy-800"
                                : line.basis === "TAX"
                                  ? "text-gold-800"
                                  : "font-semibold text-navy-900"
                            }
                          >
                            {line.basis}
                          </span>
                        </td>
                        <td className="tabular px-4 py-1.5 text-right">{formatUsd(line.booksCents)}</td>
                        <td className="tabular px-4 py-1.5 text-right">{formatUsd(line.taxCents)}</td>
                        <td className="tabular px-4 py-1.5 text-right">{formatUsd(line.adjustmentCents)}</td>
                        <td className="px-4 py-1.5 text-xs text-ink-600">
                          {line.macrsLifeYears ? `${line.macrsLifeYears}-year · ` : ""}
                          {line.notes}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="border border-cream-300 bg-white px-6 py-4 shadow-ledger">
              <h2 className="font-display text-2xl text-navy-900">MACRS lives hooks</h2>
              <p className="mt-1 text-sm text-ink-700">
                Recovery periods for CPA mapping. Monthly tax depreciation is straight-line basis ÷
                (years × 12). No bonus, §179, or mid-quarter test.
              </p>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-300 text-[11px] uppercase tracking-[0.12em] text-ink-500">
                    <th className="py-2 text-left">Class</th>
                    <th className="py-2 text-left">Account</th>
                    <th className="py-2 text-left">Life</th>
                    <th className="py-2 text-left">Convention</th>
                  </tr>
                </thead>
                <tbody>
                  {MACRS_LIFE_HOOKS.map((h) => (
                    <tr key={h.assetClass} className="border-t border-cream-200">
                      <td className="py-1.5">{h.label}</td>
                      <td className="py-1.5">{h.accountCode ?? "—"}</td>
                      <td className="py-1.5">{h.recoveryYears ?? "n/a"}</td>
                      <td className="py-1.5">{h.convention}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        );
      }}
    </ReportShell>
  );
}
