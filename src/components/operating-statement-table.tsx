import { formatUsd } from "@rcp/ledger";
import { formatRatioBps, type OperatingLine } from "@rcp/reporting";

function cell(amount: bigint | null | undefined) {
  if (amount === null || amount === undefined) return "";
  return formatUsd(amount);
}

function varianceClass(row: OperatingLine): string {
  if (row.variance === null || row.favorable === null) return "";
  const favorable =
    row.favorable === "revenue" ? row.variance > 0n : row.favorable === "expense" ? row.variance < 0n : false;
  const unfavorable =
    row.favorable === "revenue" ? row.variance < 0n : row.favorable === "expense" ? row.variance > 0n : false;
  if (favorable) return "text-emerald-800";
  if (unfavorable) return "text-rose-800";
  return "";
}

export function OperatingStatementTable({
  title,
  subtitle,
  rows,
  footer,
  showBudget,
  showPrior,
}: {
  title: string;
  subtitle?: string;
  rows: OperatingLine[];
  footer?: string;
  showBudget: boolean;
  showPrior: boolean;
}) {
  return (
    <section className="border border-cream-300 bg-white shadow-ledger">
      <div className="border-b border-cream-300 bg-navy-900 px-6 py-4 text-cream-100">
        <p className="text-[11px] uppercase tracking-[0.2em] text-gold-400">{subtitle}</p>
        <h1 className="font-display text-2xl">{title}</h1>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-cream-300 text-[11px] uppercase tracking-[0.14em] text-ink-500">
              <th className="px-6 py-2 text-left">Line</th>
              <th className="px-4 py-2 text-right">Actual</th>
              {showBudget ? (
                <>
                  <th className="px-4 py-2 text-right">Budget</th>
                  <th className="px-4 py-2 text-right">Var $</th>
                  <th className="px-4 py-2 text-right">Var %</th>
                </>
              ) : null}
              {showPrior ? (
                <>
                  <th className="px-4 py-2 text-right">Prior</th>
                  <th className="px-4 py-2 text-right">MoM %</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              if (row.amount === null && row.emphasis === "section") {
                return (
                  <tr key={row.key} className="bg-cream-100">
                    <td
                      colSpan={1 + 1 + (showBudget ? 3 : 0) + (showPrior ? 2 : 0)}
                      className="px-6 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-navy-700"
                    >
                      {row.label}
                    </td>
                  </tr>
                );
              }
              const bold = row.emphasis === "total" || row.emphasis === "subtotal";
              return (
                <tr key={row.key} className={bold ? "border-t border-cream-300" : ""}>
                  <td
                    className={`px-6 py-1.5 ${bold ? "font-semibold text-navy-900" : "text-ink-700"}`}
                    style={{ paddingLeft: `${1.5 + row.indent * 1.25}rem` }}
                  >
                    {row.label}
                    {row.code ? (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-ink-500">{row.code}</span>
                    ) : null}
                  </td>
                  <td className={`tabular px-4 py-1.5 text-right ${bold ? "font-semibold" : ""}`}>
                    {cell(row.actual)}
                  </td>
                  {showBudget ? (
                    <>
                      <td className="tabular px-4 py-1.5 text-right">{cell(row.budget)}</td>
                      <td className={`tabular px-4 py-1.5 text-right ${varianceClass(row)}`}>
                        {cell(row.variance)}
                      </td>
                      <td className={`tabular px-4 py-1.5 text-right ${varianceClass(row)}`}>
                        {formatRatioBps(row.varianceBps)}
                      </td>
                    </>
                  ) : null}
                  {showPrior ? (
                    <>
                      <td className="tabular px-4 py-1.5 text-right">{cell(row.prior)}</td>
                      <td className="tabular px-4 py-1.5 text-right">{formatRatioBps(row.momBps)}</td>
                    </>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {footer ? (
        <p className="border-t border-cream-300 px-6 py-3 text-xs text-ink-500">{footer}</p>
      ) : null}
    </section>
  );
}
