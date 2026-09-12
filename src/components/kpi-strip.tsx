import { formatUsd } from "@rcp/ledger";
import { formatRatioBps } from "@rcp/properties";
import type { PropertyKpis } from "@/lib/operating";

export function KpiStrip({ kpis }: { kpis: PropertyKpis }) {
  const rr = kpis.rentRoll;
  const book = kpis.bookEconomic;
  const be = kpis.breakeven;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="bg-navy-900 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-gold-400">
          Rent-roll sourced
        </span>
        <span className="text-xs text-ink-500">
          Physical occupancy, loss-to-lease, and rent-roll vacancy/concessions come from the unit
          master. Book economic occupancy is EGI ÷ GPR from the GL.
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Physical occupancy"
          value={rr ? formatRatioBps(rr.physicalOccupancyBps) : "—"}
          hint={
            rr
              ? `${rr.occupiedCount} occupied / ${rr.rentableCount} rentable · ${rr.downCount} down`
              : kpis.occupancyGate.reason
          }
          gated
        />
        <KpiCard
          label="Economic occupancy"
          value={book ? formatRatioBps(book.economicOccupancyBps) : "—"}
          hint="Book: EGI / GPR. Rent-roll analog is in-place − concessions over market rent."
          gated
        />
        <KpiCard
          label="Loss-to-lease"
          value={rr ? formatUsd(rr.lossToLease) : "—"}
          hint="Occupied Σ max(0, market − in-place). Not loan-to-value."
          gated
        />
        <KpiCard
          label="Breakeven occupancy"
          value={be ? formatRatioBps(be.breakevenOccupancyBps) : "—"}
          hint="(OpEx + interest + principal − other income) / GPR"
        />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <KpiCard
          label="Vacancy loss (rent roll)"
          value={rr ? formatUsd(rr.vacancyLoss) : "—"}
          hint="Σ market rent of VACANT units"
          gated
        />
        <KpiCard
          label="Concessions (rent roll)"
          value={rr ? formatUsd(rr.concessions) : "—"}
          hint="Σ concession on OCCUPIED units"
          gated
        />
        <KpiCard
          label="Delinquency / AR aging"
          value="Not available"
          hint={kpis.delinquency.reason}
        />
      </div>
      {rr && book ? (
        <p className="text-xs text-ink-500">
          Rent-roll economic analog {formatRatioBps(rr.economicOccupancyBps)} (in-place − concessions / GPR{" "}
          {formatUsd(rr.gpr)}). Book EGI {formatUsd(book.egi)} / GPR {formatUsd(book.gpr)}.
        </p>
      ) : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  gated,
}: {
  label: string;
  value: string;
  hint: string;
  gated?: boolean;
}) {
  return (
    <div className="border border-cream-300 bg-white px-4 py-3 shadow-ledger">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.16em] text-gold-700">{label}</p>
        {gated ? (
          <span className="text-[9px] uppercase tracking-[0.14em] text-navy-700">Rent roll</span>
        ) : null}
      </div>
      <p className="mt-1 font-display text-2xl text-navy-900 tabular">{value}</p>
      <p className="mt-1 text-xs text-ink-500">{hint}</p>
    </div>
  );
}
