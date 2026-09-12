import { formatUsd } from "@rcp/ledger";
import { formatRatioBps } from "@rcp/properties";
import type { ConcentrationRow } from "@rcp/analytics";
import Link from "next/link";

export function NoiConcentration({
  rows,
  period,
}: {
  rows: ConcentrationRow[];
  period: string;
}) {
  const max = rows.reduce((acc, r) => (r.noiCents > acc ? r.noiCents : acc), 0n);
  return (
    <section className="border border-cream-300 bg-white px-5 py-4 shadow-ledger">
      <h2 className="font-display text-2xl text-navy-900">NOI concentration</h2>
      <p className="mt-1 text-sm text-ink-700">
        Look-through period NOI mix. Combined roll-up is not a GAAP consolidation.
      </p>
      <div className="mt-4 space-y-3">
        {rows.map((row) => {
          const width =
            max === 0n || row.noiCents <= 0n ? 0 : Number((row.noiCents * 100n) / max);
          return (
            <Link
              key={row.entityCode}
              href={`/dashboard/${row.entityCode}?entity=${row.entityCode}&period=${period}`}
              className="block"
            >
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-semibold text-navy-900">
                  {row.entityCode}
                  <span className="ml-2 font-normal text-ink-500">{row.entityName}</span>
                </span>
                <span className="tabular text-ink-700">
                  {formatUsd(row.noiCents)} · {formatRatioBps(row.shareBps)}
                </span>
              </div>
              <div className="mt-1 h-2 bg-cream-200">
                <div className="h-2 bg-navy-900" style={{ width: `${width}%` }} />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
