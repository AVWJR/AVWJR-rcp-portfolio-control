import { ExportLinks, TaxDisclaimer } from "@/components/tax-disclaimer";
import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { listVendors, load1099Export } from "@/lib/vendors";
import { formatUsd } from "@rcp/ledger";
import { FORM_1099_LIMITATIONS } from "@rcp/tax-bridge";

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearch>;
}) {
  const params = await searchParams;

  return (
    <ReportShell searchParams={params} pathname="/vendors">
      {async (ctx) => {
        const period = `${ctx.year}-${String(ctx.month).padStart(2, "0")}`;
        const qs = new URLSearchParams({
          entity: ctx.entity.code,
          year: String(ctx.year),
          month: String(ctx.month),
        });
        const vendors = await listVendors();
        const exp = await load1099Export({
          year: ctx.year,
          month: ctx.month,
          entityCode: ctx.entity.code,
        });
        return (
          <div className="space-y-8">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{reportSubtitle(ctx)}</p>
              <h1 className="font-display text-4xl text-navy-900">1099 vendor hooks</h1>
              <p className="mt-2 max-w-3xl text-sm text-ink-700">
                Vendor master plus reportable-payment overlay coded to expense accounts. Phase A AP
                (2010 / 2020) has no invoice subledger — this export is a CPA hook, not a filed 1099.
              </p>
            </div>
            <TaxDisclaimer extra={exp.stub ? exp.stubReason : "Overlay payments exist for this period."} />
            <ExportLinks href={`/api/vendors/1099?${qs}`} label="1099 overlay" />

            <section className="border border-cream-300 bg-white shadow-ledger">
              <div className="border-b border-cream-300 bg-navy-900 px-6 py-4 text-cream-100">
                <h2 className="font-display text-2xl">Vendor master</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-300 bg-cream-100 text-[11px] uppercase tracking-[0.12em] text-ink-500">
                    <th className="px-4 py-2 text-left">Code</th>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">Form</th>
                    <th className="px-4 py-2 text-left">TIN last4</th>
                    <th className="px-4 py-2 text-right">Payments</th>
                  </tr>
                </thead>
                <tbody>
                  {vendors.map((v) => (
                    <tr key={v.id} className="border-t border-cream-200">
                      <td className="px-4 py-1.5">{v.code}</td>
                      <td className="px-4 py-1.5">{v.name}</td>
                      <td className="px-4 py-1.5">{v.form1099}</td>
                      <td className="px-4 py-1.5">{v.tinLast4 ?? "—"}</td>
                      <td className="tabular px-4 py-1.5 text-right">{v._count.payments}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="border border-cream-300 bg-white shadow-ledger">
              <div className="border-b border-cream-300 bg-navy-900 px-6 py-4 text-cream-100">
                <h2 className="font-display text-2xl">Reportable overlay · {period}</h2>
              </div>
              {exp.rows.length === 0 ? (
                <p className="px-6 py-4 text-sm text-ink-700">{exp.stubReason}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-cream-300 bg-cream-100 text-[11px] uppercase tracking-[0.12em] text-ink-500">
                      <th className="px-4 py-2 text-left">Vendor</th>
                      <th className="px-4 py-2 text-left">Account</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                      <th className="px-4 py-2 text-left">Reportable</th>
                      <th className="px-4 py-2 text-left">Memo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exp.rows.map((row) => (
                      <tr key={`${row.vendorCode}-${row.accountCode}-${row.memo}`} className="border-t border-cream-200">
                        <td className="px-4 py-1.5">
                          {row.vendorName}
                          <span className="ml-2 text-[10px] uppercase text-ink-500">{row.form1099}</span>
                        </td>
                        <td className="px-4 py-1.5">{row.accountCode}</td>
                        <td className="tabular px-4 py-1.5 text-right">{formatUsd(row.amountCents)}</td>
                        <td className="px-4 py-1.5">{row.reportable ? "Y" : "N"}</td>
                        <td className="px-4 py-1.5 text-xs text-ink-600">{row.memo}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-navy-900 font-semibold">
                      <td className="px-4 py-2" colSpan={2}>
                        Total reportable
                      </td>
                      <td className="tabular px-4 py-2 text-right">{formatUsd(exp.totalReportableCents)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tbody>
                </table>
              )}
            </section>
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink-700">
              {FORM_1099_LIMITATIONS.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        );
      }}
    </ReportShell>
  );
}
