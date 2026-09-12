import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { classificationLabel, loadCapexProjects } from "@/lib/capex";
import { formatUsd } from "@rcp/ledger";

export default async function CapexPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearch>;
}) {
  const params = await searchParams;
  const projects = await loadCapexProjects();
  return (
    <ReportShell searchParams={params} pathname="/capex">
      {(ctx) => (
        <div className="space-y-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{reportSubtitle(ctx)}</p>
            <h1 className="font-display text-4xl text-navy-900">CapEx / CIP</h1>
            <p className="mt-2 max-w-3xl text-sm text-ink-700">
              CapEx spends <code>1460</code> Construction in Progress until placed in service to a
              fixed-asset account. R&amp;M stays on <code>5210</code> and in NOI. Monthly depreciation
              (<code>6210</code>/<code>1490</code>) is unchanged.
            </p>
          </div>
          <section className="border border-cream-300 bg-white shadow-ledger">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cream-300 bg-cream-100 text-[11px] uppercase tracking-[0.12em] text-ink-500">
                  <th className="px-4 py-2 text-left">Project</th>
                  <th className="px-4 py-2 text-left">Class</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right">Budget</th>
                  <th className="px-4 py-2 text-right">Spent</th>
                  <th className="px-4 py-2 text-right">CIP</th>
                  <th className="px-4 py-2 text-right">In service</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id} className="border-b border-cream-200 align-top">
                    <td className="px-4 py-2">
                      <p className="font-semibold text-navy-900">{project.name}</p>
                      <p className="text-xs text-ink-500">{project.entity.code}</p>
                      {project.notes ? <p className="mt-1 max-w-md text-xs text-ink-500">{project.notes}</p> : null}
                    </td>
                    <td className="px-4 py-2">{classificationLabel(project.classification)}</td>
                    <td className="px-4 py-2 text-xs uppercase tracking-wide">{project.status.replaceAll("_", " ")}</td>
                    <td className="tabular px-4 py-2 text-right">{formatUsd(project.budgetCents)}</td>
                    <td className="tabular px-4 py-2 text-right">{formatUsd(project.spentCents)}</td>
                    <td className="tabular px-4 py-2 text-right">{formatUsd(project.cipCents)}</td>
                    <td className="tabular px-4 py-2 text-right">{formatUsd(project.placedInServiceCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </ReportShell>
  );
}
