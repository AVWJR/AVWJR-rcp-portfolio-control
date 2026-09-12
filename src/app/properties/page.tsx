import { ReportShell, type ReportSearch } from "@/components/report-frame";
import { formatUsd } from "@rcp/ledger";
import { formatRatioBps } from "@rcp/properties";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { summarizeRentRoll } from "@rcp/properties";
import { unitToSnapshot } from "@/lib/rent-roll";

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearch>;
}) {
  const params = await searchParams;
  return (
    <ReportShell searchParams={params} pathname="/properties">
      {(ctx) => {
        const period = `${ctx.year}-${String(ctx.month).padStart(2, "0")}`;
        return <PropertyIndex period={period} />;
      }}
    </ReportShell>
  );
}

async function PropertyIndex({ period }: { period: string }) {
  const spes = await prisma.entity.findMany({
    where: { type: "SPE" },
    include: { units: true },
    orderBy: { code: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">Phase B · {period}</p>
        <h1 className="font-display text-4xl text-navy-900">Property operating package</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-700">
          Rent-roll sourced occupancy and loss-to-lease. Open an SPE for the NOI bridge, budget
          variance, and unit master.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {spes.map((spe) => {
          const kpis = summarizeRentRoll(spe.units.map(unitToSnapshot));
          const href = `/properties/${spe.code}?entity=${spe.code}&period=${period}`;
          return (
            <Link
              key={spe.code}
              href={href}
              className="border border-cream-300 bg-white px-5 py-4 shadow-ledger hover:border-gold-500"
            >
              <p className="text-[11px] uppercase tracking-[0.16em] text-gold-700">{spe.code}</p>
              <h2 className="font-display text-2xl text-navy-900">{spe.name}</h2>
              <p className="mt-1 text-sm text-ink-700">
                {spe.unitCount} units · {spe.strategy?.replaceAll("_", " ")}
              </p>
              <p className="mt-3 text-sm text-ink-700">
                Physical occ. {formatRatioBps(kpis.physicalOccupancyBps)} · Loss-to-lease{" "}
                {formatUsd(kpis.lossToLease)}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
