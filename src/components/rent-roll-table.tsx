import { formatUsd } from "@rcp/ledger";
import { bathsFromTenths, type UnitSnapshot } from "@rcp/properties";

export function RentRollTable({ units }: { units: UnitSnapshot[] }) {
  return (
    <section className="border border-cream-300 bg-white shadow-ledger">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-cream-300 text-[11px] uppercase tracking-[0.14em] text-ink-500">
              <th className="px-4 py-2 text-left">Unit</th>
              <th className="px-4 py-2 text-left">Floorplan</th>
              <th className="px-4 py-2 text-right">Bd</th>
              <th className="px-4 py-2 text-right">Ba</th>
              <th className="px-4 py-2 text-right">Sqft</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-right">Market</th>
              <th className="px-4 py-2 text-right">In-place</th>
              <th className="px-4 py-2 text-right">Concession</th>
              <th className="px-4 py-2 text-left">Lease</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.unitCode} className="border-b border-cream-200">
                <td className="px-4 py-1.5 font-medium">{u.unitCode}</td>
                <td className="px-4 py-1.5">{u.floorplan}</td>
                <td className="tabular px-4 py-1.5 text-right">{u.beds}</td>
                <td className="tabular px-4 py-1.5 text-right">{bathsFromTenths(u.bathsTenths).toFixed(1)}</td>
                <td className="tabular px-4 py-1.5 text-right">{u.sqft}</td>
                <td className="px-4 py-1.5">
                  <StatusPill status={u.status} />
                </td>
                <td className="tabular px-4 py-1.5 text-right">{formatUsd(u.marketRent)}</td>
                <td className="tabular px-4 py-1.5 text-right">
                  {u.status === "OCCUPIED" ? formatUsd(u.inPlaceRent) : ""}
                </td>
                <td className="tabular px-4 py-1.5 text-right">
                  {u.concessionCents === 0n ? "" : formatUsd(u.concessionCents)}
                </td>
                <td className="px-4 py-1.5 text-xs text-ink-500">
                  {u.leaseStart && u.leaseEnd
                    ? `${u.leaseStart.toISOString().slice(0, 10)} → ${u.leaseEnd.toISOString().slice(0, 10)}`
                    : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: UnitSnapshot["status"] }) {
  const cls =
    status === "OCCUPIED"
      ? "bg-emerald-50 text-emerald-800"
      : status === "VACANT"
        ? "bg-amber-50 text-amber-900"
        : "bg-slate-100 text-slate-700";
  return <span className={`px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${cls}`}>{status}</span>;
}
