import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearch>;
}) {
  const params = await searchParams;
  return (
    <ReportShell searchParams={params} pathname="/deals">
      {(ctx) => <DealIndex period={`${ctx.year}-${String(ctx.month).padStart(2, "0")}`} subtitle={reportSubtitle(ctx)} />}
    </ReportShell>
  );
}

async function DealIndex({ period, subtitle }: { period: string; subtitle: string }) {
  const [spes, drafts] = await Promise.all([
    prisma.entity.findMany({
      where: { type: "SPE" },
      include: { parent: true },
      orderBy: { code: "asc" },
    }),
    prisma.dealIntake.findMany({
      where: { status: { not: "APPLIED" } },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{subtitle}</p>
          <h1 className="font-display text-4xl text-navy-900">Deals</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-700">
            Property SPEs sit under OpCo. Add a new deal when you are onboarding a new SPE — not a new HoldCo
            or a second OpCo.
          </p>
        </div>
        <Link
          href={`/deals/new?period=${period}`}
          className="bg-gold-500 px-5 py-2 text-[12px] uppercase tracking-[0.14em] text-navy-950"
        >
          Add Deal
        </Link>
      </div>

      {drafts.length ? (
        <div>
          <h2 className="font-display text-2xl text-navy-900">Saved drafts</h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <Link
                  href={`/deals/new?intake=${draft.id}&period=${period}`}
                  className="block border border-cream-300 bg-white px-4 py-3 shadow-ledger hover:border-gold-500"
                >
                  <p className="text-[11px] uppercase tracking-[0.14em] text-gold-700">{draft.status}</p>
                  <p className="font-display text-xl text-navy-900">{draft.speName || "Untitled deal"}</p>
                  <p className="text-sm text-ink-600">
                    {draft.speCode || "code pending"} · step {draft.currentStep}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {spes.map((spe) => (
          <Link
            key={spe.code}
            href={`/dashboard/${spe.code}?entity=${spe.code}&period=${period}`}
            className="border border-cream-300 bg-white px-5 py-4 shadow-ledger hover:border-gold-500"
          >
            <p className="text-[11px] uppercase tracking-[0.16em] text-gold-700">{spe.code}</p>
            <h2 className="font-display text-2xl text-navy-900">{spe.name}</h2>
            <p className="mt-1 text-sm text-ink-700">
              Under {spe.parent?.code ?? "—"} · {spe.unitCount ?? "—"} units · {spe.strategy?.replaceAll("_", " ") ?? "strategy TBD"}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
