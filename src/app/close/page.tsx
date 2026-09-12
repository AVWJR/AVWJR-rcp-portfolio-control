import { ChecklistSelect, HardLockButton, ReopenForm, SoftCloseButton } from "@/components/close-forms";
import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { periodStatusLabel } from "@/lib/period-close";
import { prisma } from "@/lib/prisma";

export default async function ClosePage({
  searchParams,
}: {
  searchParams: Promise<ReportSearch>;
}) {
  const params = await searchParams;
  const periods = await prisma.period.findMany({
    include: { entity: true, checklist: { orderBy: { sortOrder: "asc" } }, closeEvents: true },
    orderBy: [{ year: "asc" }, { month: "asc" }, { entity: { code: "asc" } }],
  });

  return (
    <ReportShell searchParams={params} pathname="/close">
      {(ctx) => {
        const selected = `${ctx.year}-${String(ctx.month).padStart(2, "0")}`;
        const focus = periods.filter((p) => p.entity.code === ctx.entity.code && p.label === selected);
        const current = focus[0] ?? null;
        return (
          <div className="space-y-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{reportSubtitle(ctx)}</p>
              <h1 className="font-display text-4xl text-navy-900">Period close</h1>
              <p className="mt-2 max-w-3xl text-sm text-ink-700">
                Soft close freezes operating posts. Controller completes the checklist from{" "}
                <code>docs/RCP_SPE_MONTHLY_CLOSE.md</code>, then hard-locks. Locked periods reject
                journals. Reopen requires a reason and ticket.
              </p>
            </div>

            <section className="border border-cream-300 bg-white shadow-ledger">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-300 bg-cream-100 text-[11px] uppercase tracking-[0.12em] text-ink-500">
                    <th className="px-4 py-2 text-left">Entity</th>
                    <th className="px-4 py-2 text-left">Period</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-right">Checklist</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((period) => {
                    const done = period.checklist.filter((i) => i.status === "DONE" || i.status === "NA").length;
                    return (
                      <tr key={period.id} className="border-b border-cream-200">
                        <td className="px-4 py-2">{period.entity.code}</td>
                        <td className="px-4 py-2">{period.label}</td>
                        <td className="px-4 py-2">{periodStatusLabel(period.status)}</td>
                        <td className="tabular px-4 py-2 text-right">
                          {done}/{period.checklist.length}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            {current ? (
              <section className="space-y-4 border border-cream-300 bg-white px-5 py-4 shadow-ledger">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="font-display text-2xl text-navy-900">
                      {current.entity.code} {current.label}
                    </h2>
                    <p className="text-sm text-ink-600">{periodStatusLabel(current.status)}</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {current.status === "OPEN" ? <SoftCloseButton periodId={current.id} /> : null}
                    {current.status === "SOFT_CLOSED" ? <HardLockButton periodId={current.id} /> : null}
                    {current.status !== "OPEN" ? <ReopenForm periodId={current.id} /> : null}
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-cream-300 text-[11px] uppercase tracking-[0.12em] text-ink-500">
                      <th className="py-2 text-left">Controller item</th>
                      <th className="py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.checklist.map((item) => (
                      <tr key={item.id} className="border-b border-cream-200">
                        <td className="py-2 pr-4 text-ink-700">{item.label}</td>
                        <td className="py-2">
                          <ChecklistSelect periodId={current.id} code={item.code} status={item.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null}
          </div>
        );
      }}
    </ReportShell>
  );
}
