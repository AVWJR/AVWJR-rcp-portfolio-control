import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { SchedulerRunButton } from "@/components/vault-forms";
import { listReportJobs } from "@/lib/scheduler";
import { PHASE_F_SCHEDULER_TODO } from "@rcp/documents/scheduler";

export default async function SchedulerPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearch>;
}) {
  const params = await searchParams;

  return (
    <ReportShell searchParams={params} pathname="/scheduler">
      {async (ctx) => {
        const period = `${ctx.year}-${String(ctx.month).padStart(2, "0")}`;
        const jobs = await listReportJobs();
        return (
          <div className="space-y-8">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{reportSubtitle(ctx)}</p>
              <h1 className="font-display text-4xl text-navy-900">Scheduled reporting</h1>
              <p className="mt-2 max-w-3xl text-sm text-ink-700">
                Job definitions generate Phase E packs on a cadence. No email send — files write to{" "}
                <code>data/reports/</code> and last-run status is stored. CLI:{" "}
                <code>npm run reports:run -- --pack=monthly_investor --entity=SPE-WBG --period=2026-08</code>
              </p>
              <p className="mt-2 text-xs text-ink-500">{PHASE_F_SCHEDULER_TODO}</p>
            </div>

            <section className="border border-cream-300 bg-white shadow-ledger">
              <div className="border-b border-cream-300 bg-navy-900 px-6 py-4 text-cream-100">
                <h2 className="font-display text-2xl">Job definitions</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-300 bg-cream-100 text-[11px] uppercase tracking-[0.12em] text-ink-500">
                    <th className="px-4 py-2 text-left">Job</th>
                    <th className="px-4 py-2 text-left">Pack</th>
                    <th className="px-4 py-2 text-left">Cadence</th>
                    <th className="px-4 py-2 text-left">Last status</th>
                    <th className="px-4 py-2 text-left">Last run</th>
                    <th className="px-4 py-2 text-left">Run</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id} className="border-t border-cream-200 align-top">
                      <td className="px-4 py-2">
                        <p className="font-semibold text-navy-900">{job.title}</p>
                        <p className="text-xs text-ink-500">{job.code}</p>
                      </td>
                      <td className="px-4 py-2">
                        {job.packId}
                        <p className="text-xs text-ink-500">
                          {job.entityCode} · {job.periodLabel}
                        </p>
                      </td>
                      <td className="px-4 py-2">{job.cadence}</td>
                      <td className="px-4 py-2">
                        {job.lastStatus}
                        {job.lastError ? <p className="text-xs text-ink-600">{job.lastError}</p> : null}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {job.lastRunAt ? job.lastRunAt.toISOString() : "never"}
                        {job.lastOutputDir ? <p className="break-all text-ink-500">{job.lastOutputDir}</p> : null}
                      </td>
                      <td className="px-4 py-2">
                        <SchedulerRunButton packId={job.packId} entity={job.entityCode} period={period} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="border border-cream-300 bg-white px-6 py-4 shadow-ledger text-sm text-ink-700">
              <h2 className="font-display text-2xl text-navy-900">Documented cron</h2>
              <pre className="mt-2 overflow-x-auto bg-cream-100 px-3 py-2 text-xs">
{`# Monthly investor pack on the 1st
0 7 1 * * cd /opt/rcp && npm run reports:run -- --pack=monthly_investor --entity=SPE-WBG

# Quarterly lender pack
0 7 1 1,4,7,10 * cd /opt/rcp && npm run reports:run -- --pack=quarterly_lender --entity=SPE-WBG`}
              </pre>
              <p className="mt-2">
                In-process alternative: call <code>runScheduledPack</code> from a worker. Status UI is
                this page. LTV and delinquency stay gated inside the Phase E pack itself.
              </p>
            </section>
          </div>
        );
      }}
    </ReportShell>
  );
}
