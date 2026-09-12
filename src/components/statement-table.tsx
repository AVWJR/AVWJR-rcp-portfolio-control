import { formatUsd, type StatementRow } from "@rcp/ledger";

export function StatementTable({
  title,
  subtitle,
  rows,
  footer,
}: {
  title: string;
  subtitle?: string;
  rows: StatementRow[];
  footer?: string;
}) {
  return (
    <section className="border border-cream-300 bg-white shadow-ledger">
      <div className="border-b border-cream-300 bg-navy-900 px-6 py-4 text-cream-100">
        <p className="text-[11px] uppercase tracking-[0.2em] text-gold-400">{subtitle}</p>
        <h1 className="font-display text-2xl">{title}</h1>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((row) => {
            if (row.amount === null && row.emphasis === "section") {
              return (
                <tr key={row.key} className="bg-cream-100">
                  <td
                    colSpan={2}
                    className="px-6 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-navy-700"
                  >
                    {row.label}
                  </td>
                </tr>
              );
            }
            const bold = row.emphasis === "total" || row.emphasis === "subtotal";
            const top = row.emphasis === "total" || row.emphasis === "subtotal";
            return (
              <tr key={row.key} className={top ? "border-t border-cream-300" : ""}>
                <td
                  className={`px-6 py-1.5 ${bold ? "font-semibold text-navy-900" : "text-ink-700"}`}
                  style={{ paddingLeft: `${1.5 + row.indent * 1.25}rem` }}
                >
                  {row.label}
                  {row.code ? (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-ink-500">
                      {row.code}
                    </span>
                  ) : null}
                </td>
                <td
                  className={`tabular px-6 py-1.5 text-right ${
                    bold ? "font-semibold text-navy-900" : ""
                  }`}
                >
                  {row.amount === null ? "" : formatUsd(row.amount)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {footer ? (
        <p className="border-t border-cream-300 px-6 py-3 text-xs text-ink-500">{footer}</p>
      ) : null}
    </section>
  );
}

export function TrialBalanceTable({
  title,
  subtitle,
  rows,
  totalDebit,
  totalCredit,
}: {
  title: string;
  subtitle?: string;
  rows: { code: string; name: string; debit: bigint; credit: bigint }[];
  totalDebit: bigint;
  totalCredit: bigint;
}) {
  return (
    <section className="border border-cream-300 bg-white shadow-ledger">
      <div className="border-b border-cream-300 bg-navy-900 px-6 py-4 text-cream-100">
        <p className="text-[11px] uppercase tracking-[0.2em] text-gold-400">{subtitle}</p>
        <h1 className="font-display text-2xl">{title}</h1>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-cream-300 text-[11px] uppercase tracking-[0.14em] text-ink-500">
            <th className="px-6 py-2 text-left">Code</th>
            <th className="px-6 py-2 text-left">Account</th>
            <th className="px-6 py-2 text-right">Debit</th>
            <th className="px-6 py-2 text-right">Credit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.code} className="border-b border-cream-200">
              <td className="px-6 py-1.5 text-ink-500">{row.code}</td>
              <td className="px-6 py-1.5">{row.name}</td>
              <td className="tabular px-6 py-1.5 text-right">
                {row.debit === 0n ? "" : formatUsd(row.debit)}
              </td>
              <td className="tabular px-6 py-1.5 text-right">
                {row.credit === 0n ? "" : formatUsd(row.credit)}
              </td>
            </tr>
          ))}
          <tr className="bg-cream-100 font-semibold">
            <td className="px-6 py-2" colSpan={2}>
              Totals
            </td>
            <td className="tabular px-6 py-2 text-right">{formatUsd(totalDebit)}</td>
            <td className="tabular px-6 py-2 text-right">{formatUsd(totalCredit)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
