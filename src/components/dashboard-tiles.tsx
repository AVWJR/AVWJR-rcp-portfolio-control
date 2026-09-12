import { formatUsd } from "@rcp/ledger";
import type { LiveRatio } from "@/lib/dashboards";
import Link from "next/link";

export function DashboardTiles({
  tiles,
  entityCode,
  period,
  view,
}: {
  tiles: LiveRatio[];
  entityCode: string;
  period: string;
  view?: string;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => (
        <KpiTile key={tile.id} tile={tile} entityCode={entityCode} period={period} view={view} />
      ))}
    </div>
  );
}

export function KpiTile({
  tile,
  entityCode,
  period,
  view,
}: {
  tile: LiveRatio;
  entityCode: string;
  period: string;
  view?: string;
}) {
  const params = new URLSearchParams({ entity: entityCode, period });
  if (view) params.set("view", view);
  const href = `/dashboard/ratios/${tile.id}?${params.toString()}`;
  return (
    <Link
      href={href}
      className="border border-cream-300 bg-white px-4 py-3 shadow-ledger hover:border-gold-500"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.16em] text-gold-700">{tile.definition.label}</p>
        <span className="text-[9px] uppercase tracking-[0.12em] text-ink-500">
          {tile.gated ? "Gated" : tile.definition.source.replaceAll("_", " ")}
        </span>
      </div>
      <p className="mt-1 font-display text-2xl text-navy-900 tabular">{tile.display}</p>
      <p className="mt-1 text-xs text-ink-500">{tile.hint}</p>
      {tile.noiLabel ? (
        <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-navy-700">{tile.noiLabel}</p>
      ) : null}
      <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-gold-700">Formula / drill-down →</p>
    </Link>
  );
}

export function ContributorTable({
  contributors,
}: {
  contributors: LiveRatio["contributors"];
}) {
  if (contributors.length === 0) {
    return <p className="text-sm text-ink-500">No contributing rows for this ratio on the selected books.</p>;
  }
  return (
    <div className="overflow-x-auto border border-cream-300 bg-white shadow-ledger">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-cream-300 bg-cream-100 text-[11px] uppercase tracking-[0.12em] text-ink-500">
            <th className="px-4 py-2 text-left">Source</th>
            <th className="px-4 py-2 text-left">Contributor</th>
            <th className="px-4 py-2 text-right">Amount</th>
            <th className="px-4 py-2 text-left">Link</th>
          </tr>
        </thead>
        <tbody>
          {contributors.map((row, index) => (
            <tr key={`${row.kind}-${row.code ?? row.field ?? row.label}-${index}`} className="border-b border-cream-200">
              <td className="px-4 py-2 text-xs uppercase tracking-[0.12em] text-ink-500">
                {row.code ?? row.field ?? row.kind}
              </td>
              <td className="px-4 py-2">{row.label}</td>
              <td className="tabular px-4 py-2 text-right">
                {row.text ?? (row.amountCents === undefined ? "—" : formatUsd(row.amountCents))}
              </td>
              <td className="px-4 py-2">
                <Link className="text-navy-700 underline" href={row.href}>
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
