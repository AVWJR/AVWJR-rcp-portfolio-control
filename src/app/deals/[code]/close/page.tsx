import { CloseDropzone } from "@/components/deals/close-dropzone";
import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { loadYtdBudgetMap } from "@/lib/budgets";
import { loadCloseWorkspace } from "@/lib/close/workspace";
import { buildIncomeStatement, formatUsd, MASTER_COA } from "@rcp/ledger";
import { incomeStatementFromBudget, incomeStatementKeyedAmounts } from "@rcp/reporting";
import { notFound } from "next/navigation";

export default async function MonthEndClosePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<ReportSearch & { error?: string }>;
}) {
  const { code } = await params;
  const query = await searchParams;
  const merged: ReportSearch = { ...query, entity: code, view: undefined };
  return (
    <ReportShell searchParams={merged} pathname={`/deals/${code}/close`}>
      {async (ctx) => {
        if (ctx.entity.type !== "SPE" || ctx.entity.code !== code) notFound();
        const [workspace, ytdBudgetMap] = await Promise.all([
          loadCloseWorkspace(ctx.entity.id, ctx.year, ctx.month),
          loadYtdBudgetMap({
            entityIds: [ctx.entity.id],
            year: ctx.year,
            month: ctx.month,
          }),
        ]);
        const ytd = buildIncomeStatement({
          throughEnd: ctx.statements.ytdActivity,
          inPeriod: ctx.statements.ytdActivity,
          eliminate: false,
        });
        const ytdByKey = new Map(ytd.rows.map((row) => [row.key, row.amount]));
        const ytdBudget = ytdBudgetMap.size > 0 ? incomeStatementKeyedAmounts(incomeStatementFromBudget(ytdBudgetMap)) : null;
        const momByKey = ctx.statements.mom ? incomeStatementKeyedAmounts(ctx.statements.mom) : null;
        const period = `${ctx.year}-${String(ctx.month).padStart(2, "0")}`;
        return (
          <div className="space-y-8">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{reportSubtitle(ctx)}</p>
              <h1 className="font-display text-4xl text-navy-900">Month-end close</h1>
              {query.error ? <p className="mt-2 text-sm text-red-800">{query.error}</p> : null}
              <p className="mt-2 max-w-3xl text-sm text-ink-700">
                {ctx.entity.name} · {period} · {workspace.periodStatus.replaceAll("_", " ")}. Drop the manager’s
                package. Each file is classified, mapped onto the RCP chart, and kept. Unmapped lines sit in suspense
                and block a hard lock. Closed months are not overwritten.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                {ctx.periodLabels.map((label) => (
                  <a
                    key={label}
                    className={label === period ? "rounded bg-navy-900 px-2 py-1 text-white" : "rounded border border-navy-900 px-2 py-1 text-navy-900"}
                    href={`/deals/${code}/close?entity=${code}&period=${label}`}
                  >
                    {label}
                  </a>
                ))}
              </div>
            </div>

            <CloseDropzone code={code} year={ctx.year} month={ctx.month} />

            <section className="space-y-3">
              <h2 className="font-display text-2xl text-navy-900">Package</h2>
              {workspace.uploads.length === 0 ? (
                <p className="text-sm text-ink-700">No files for this period yet.</p>
              ) : (
                workspace.uploads.map((file) => (
                  <article key={file.id} className="rounded-md border border-gold-700/40 bg-white p-4 text-sm">
                    <p className="font-medium text-navy-900">
                      {file.filename} · {file.classification.replaceAll("_", " ")} · {file.byteSize.toLocaleString()} bytes
                    </p>
                    {file.unmapped.length ? (
                      <div className="mt-3 space-y-2">
                        <p className="text-ink-700">Unmapped lines block hard close. Pick an RCP account — it is remembered for this SPE.</p>
                        {file.unmapped.map((label) => (
                          <form key={label} className="flex flex-wrap items-center gap-2" action={`/api/deals/${code}/close`} method="post">
                            <input type="hidden" name="action" value="map" />
                            <input type="hidden" name="year" value={ctx.year} />
                            <input type="hidden" name="month" value={ctx.month} />
                            <input type="hidden" name="label" value={label} />
                            <span className="min-w-48">{label}</span>
                            <input name="accountCode" list="rcp-coa" required placeholder="RCP code" className="rounded border px-2 py-1" />
                            <button className="rounded bg-navy-900 px-3 py-1 text-white" type="submit">
                              Remember mapping
                            </button>
                          </form>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-ink-500">{file.lines.length} mapped lines.</p>
                    )}
                  </article>
                ))
              )}
              <datalist id="rcp-coa">
                {MASTER_COA.map((account) => (
                  <option key={account.code} value={account.code}>
                    {account.code} {account.name}
                  </option>
                ))}
              </datalist>
              {workspace.periodStatus !== "CLOSED" ? (
                <div className="space-y-3">
                  <form className="flex flex-wrap items-end gap-2" action={`/api/deals/${code}/close`} method="post">
                    <input type="hidden" name="action" value="reverse-operating" />
                    <input type="hidden" name="year" value={ctx.year} />
                    <input type="hidden" name="month" value={ctx.month} />
                    <label className="text-xs">
                      Reason
                      <input name="reason" required className="mt-1 block rounded border px-2 py-1" placeholder="Why these journals reverse" />
                    </label>
                    <button className="rounded border border-navy-900 px-3 py-2" type="submit">
                      Reverse operating journals
                    </button>
                  </form>
                  <p className="max-w-3xl text-ink-700">
                    Seeded months such as SPE-WBG 2026-08 already have operating journals. Reverse them with a reason, then post the package. A hard-locked month still needs a reopen first.
                  </p>
                  <form action={`/api/deals/${code}/close`} method="post">
                    <input type="hidden" name="action" value="post" />
                    <input type="hidden" name="year" value={ctx.year} />
                    <input type="hidden" name="month" value={ctx.month} />
                    <button className="rounded bg-navy-900 px-4 py-2 text-sm text-white" type="submit">
                      Post this period into the SPE books
                    </button>
                  </form>
                </div>
              ) : (
                <p className="text-sm text-ink-700">This month is hard-locked. Reopen it before posting again.</p>
              )}
            </section>

            <section className="overflow-x-auto">
              <h2 className="font-display text-2xl text-navy-900">Income statement</h2>
              <p className="mb-2 text-sm text-ink-700">
                Actual is this month. Prior year is the same month last year. Month-over-month is optional. YTD budget is January through this month.
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-ink-500">
                    <th className="py-2">Line</th>
                    <th>Actual</th>
                    <th>Budget</th>
                    <th>Var</th>
                    <th>Prior year</th>
                    <th>MoM</th>
                    <th>YTD</th>
                    <th>YTD Budget</th>
                    <th>YTD Var</th>
                  </tr>
                </thead>
                <tbody>
                  {ctx.statements.os.rows.map((row) => {
                    const ytdActual = ytdByKey.get(row.key);
                    const ytdPlan = ytdBudget?.get(row.key);
                    const ytdVar = ytdActual != null && ytdPlan != null ? ytdActual - ytdPlan : null;
                    const mom = momByKey?.get(row.key);
                    return (
                      <tr key={row.key} className="border-b border-black/5">
                        <td className="py-1" style={{ paddingLeft: row.indent * 16 }}>
                          {row.label}
                        </td>
                        <td className="tabular">{row.actual == null ? "" : formatUsd(row.actual)}</td>
                        <td className="tabular">{row.budget == null ? "—" : formatUsd(row.budget)}</td>
                        <td className="tabular">{row.variance == null ? "—" : formatUsd(row.variance)}</td>
                        <td className="tabular">{row.prior == null ? "—" : formatUsd(row.prior)}</td>
                        <td className="tabular">{mom == null ? "—" : formatUsd(mom)}</td>
                        <td className="tabular">{ytdActual == null ? "—" : formatUsd(ytdActual)}</td>
                        <td className="tabular">{ytdPlan == null ? "—" : formatUsd(ytdPlan)}</td>
                        <td className="tabular">{ytdVar == null ? "—" : formatUsd(ytdVar)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            <section>
              <h2 className="font-display text-2xl text-navy-900">Balance sheet</h2>
              <p className="mb-2 text-sm text-ink-700">
                Prior-year retained earnings and current-year earnings are separate. Intercompany 1310/2310 and 6310/7010
                drop out of the combined roll-up, not of this SPE.
              </p>
              <table className="w-full text-sm">
                <tbody>
                  {ctx.statements.bs.rows.map((row) => (
                    <tr key={row.key} className="border-b border-black/5">
                      <td className="py-1" style={{ paddingLeft: row.indent * 16 }}>
                        {row.label}
                      </td>
                      <td className="tabular">{row.amount == null ? "" : formatUsd(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="space-y-3 text-sm">
              <h2 className="font-display text-2xl text-navy-900">Tie-out tolerance</h2>
              <p className="max-w-3xl text-ink-700">
                Saved for this SPE. Cents and basis points are optional. A blank field clears that limit.
              </p>
              {workspace.tolerances.length ? (
                <ul>
                  {workspace.tolerances.map((row) => (
                    <li key={row.key}>
                      {row.key}: cents {row.cents ?? "—"} · bps {row.bps ?? "—"} · days {row.days ?? "—"}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-ink-500">No tolerance saved for this SPE.</p>
              )}
              <form className="flex flex-wrap items-end gap-2" action={`/api/deals/${code}/close`} method="post">
                <input type="hidden" name="action" value="set-tolerance" />
                <input type="hidden" name="year" value={ctx.year} />
                <input type="hidden" name="month" value={ctx.month} />
                <label className="text-xs">
                  Key
                  <input name="key" required placeholder="gpr" className="mt-1 block rounded border px-2 py-1" />
                </label>
                <label className="text-xs">
                  Cents
                  <input name="cents" inputMode="numeric" className="mt-1 block rounded border px-2 py-1" />
                </label>
                <label className="text-xs">
                  Bps
                  <input name="bps" inputMode="numeric" className="mt-1 block rounded border px-2 py-1" />
                </label>
                <label className="text-xs">
                  Days
                  <input name="days" inputMode="numeric" className="mt-1 block rounded border px-2 py-1" />
                </label>
                <button className="rounded bg-navy-900 px-3 py-2 text-white" type="submit">
                  Save tolerance
                </button>
              </form>
            </section>

            <section>
              <h2 className="font-display text-2xl text-navy-900">Rent roll tie-outs</h2>
              <table className="w-full text-sm">
                <tbody>
                  {workspace.tieOuts.map((row) => (
                    <tr key={row.id} className="border-b border-black/5">
                      <td className="py-1">{row.id}</td>
                      <td>{row.label}</td>
                      <td>{row.severity.replaceAll("_", " ")}</td>
                      <td>{row.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="text-sm text-ink-700">
              <h2 className="font-display text-2xl text-navy-900">Leases</h2>
              <p>
                Occupied {workspace.summary.occupiedCount}. Move-ins {workspace.summary.moveIns}. Move-outs{" "}
                {workspace.summary.moveOuts}. MTM {workspace.summary.mtmCount}. Next-12-month expirations{" "}
                {workspace.summary.next12RolloverCount}. Average remaining term{" "}
                {workspace.summary.averageRemainingMonths ?? "—"} months. Rent-weighted remaining term{" "}
                {workspace.summary.rentWeightedRemainingMonths ?? "—"} months. Average original term{" "}
                {workspace.summary.averageOriginalMonths ?? "—"} months. Rent-weighted original term{" "}
                {workspace.summary.rentWeightedOriginalMonths ?? "—"} months. Deposits{" "}
                {formatUsd(workspace.summary.depositsCents)}. Delinquency {formatUsd(workspace.summary.delinquencyCents)}.
              </p>
              <p className="mt-2">Expirations by quarter</p>
              <ul>
                {workspace.summary.quarters
                  .filter((bucket) => bucket.count > 0)
                  .map((bucket) => (
                    <li key={bucket.key}>
                      {bucket.label}: {bucket.count} · {formatUsd(bucket.leaseRentCents)}
                    </li>
                  ))}
              </ul>
              <ul className="mt-2">
                {workspace.summary.buckets
                  .filter((bucket) => bucket.count > 0)
                  .map((bucket) => (
                    <li key={bucket.key}>
                      {bucket.label}: {bucket.count} · {formatUsd(bucket.leaseRentCents)}
                    </li>
                  ))}
              </ul>
            </section>

            <section className="space-y-3 text-sm">
              <h2 className="font-display text-2xl text-navy-900">Lock</h2>
              <div className="flex flex-wrap gap-3">
                <form action={`/api/deals/${code}/close`} method="post">
                  <input type="hidden" name="action" value="soft" />
                  <input type="hidden" name="year" value={ctx.year} />
                  <input type="hidden" name="month" value={ctx.month} />
                  <button className="rounded border border-navy-900 px-3 py-2" type="submit">
                    Soft close
                  </button>
                </form>
                <form action={`/api/deals/${code}/close`} method="post">
                  <input type="hidden" name="action" value="hard" />
                  <input type="hidden" name="year" value={ctx.year} />
                  <input type="hidden" name="month" value={ctx.month} />
                  <button className="rounded bg-navy-900 px-3 py-2 text-white" type="submit">
                    Hard lock
                  </button>
                </form>
              </div>
              <form className="flex flex-wrap items-end gap-2" action={`/api/deals/${code}/close`} method="post">
                <input type="hidden" name="action" value="reopen" />
                <input type="hidden" name="year" value={ctx.year} />
                <input type="hidden" name="month" value={ctx.month} />
                <label className="text-xs">
                  Reason
                  <input name="reason" required className="mt-1 block rounded border px-2 py-1" />
                </label>
                <label className="text-xs">
                  Ticket
                  <input name="ticket" required className="mt-1 block rounded border px-2 py-1" />
                </label>
                <button className="rounded border border-navy-900 px-3 py-2" type="submit">
                  Reopen
                </button>
              </form>
              <ul>
                {workspace.events.map((event, index) => (
                  <li key={`${event.at}-${index}`}>
                    {event.at.slice(0, 16).replace("T", " ")} · {event.action} · {event.detail || "—"}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        );
      }}
    </ReportShell>
  );
}
