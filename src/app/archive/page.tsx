import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { SpeLifecycleDialog } from "@/components/spe-lifecycle-dialog";
import { currentAccessRole } from "@/lib/access-server";
import { listArchivedSpes, restoreImpactCopy } from "@/lib/archive";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function DealArchivePage({
  searchParams,
}: {
  searchParams: Promise<ReportSearch>;
}) {
  const params = await searchParams;
  const role = await currentAccessRole();
  if (role !== "principal") {
    redirect("/?denied=archive");
  }
  return (
    <ReportShell searchParams={params} pathname="/archive">
      {(ctx) => <ArchiveIndex period={`${ctx.year}-${String(ctx.month).padStart(2, "0")}`} subtitle={reportSubtitle(ctx)} />}
    </ReportShell>
  );
}

async function ArchiveIndex({ period, subtitle }: { period: string; subtitle: string }) {
  const deals = await listArchivedSpes();

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{subtitle}</p>
        <h1 className="font-display text-4xl text-navy-900">Deal Archive</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink-700">
          Deleted property SPEs for study. Books, ledgers, and vault stay intact. These deals are{" "}
          <strong>not</strong> under Deals and they are out of the OpCo combined roll-up. Restore is a
          Principal two-step confirm from this page only. This is not a hard wipe.
        </p>
        <p className="mt-2 text-sm text-ink-600">
          Live SPEs stay on{" "}
          <Link className="underline" href={`/deals?period=${period}`}>
            Deals
          </Link>
          . Delete a live deal from the Deals row or from that SPE’s Vault. Permanent demos (
          <code>SPE-WBG</code>, <code>SPE-CVC</code>, <code>SPE-HCR</code>) cannot be deleted.
        </p>
      </div>

      {deals.length === 0 ? (
        <div className="border border-cream-300 bg-white px-6 py-8 shadow-ledger">
          <h2 className="font-display text-2xl text-navy-900">No archived deals</h2>
          <p className="mt-2 max-w-xl text-sm text-ink-700">
            When you Delete a live SPE, it leaves Deals and lands here. Nothing is wiped.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {deals.map((spe) => (
            <article key={spe.code} className="border border-cream-300 bg-white px-5 py-4 shadow-ledger">
              <p className="text-[11px] uppercase tracking-[0.16em] text-gold-700">{spe.code} · archived</p>
              <h2 className="font-display text-2xl text-navy-900">{spe.name}</h2>
              <p className="mt-1 text-sm text-ink-700">
                Under {spe.parentCode ?? "—"} · {spe.unitCount ?? "—"} units
                {spe.archivedAt ? ` · deleted ${spe.archivedAt.toISOString().slice(0, 10)}` : ""}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link
                  href={`/vault?entity=${spe.code}&period=${period}`}
                  className="text-sm text-navy-800 underline"
                >
                  Study vault
                </Link>
                <Link
                  href={`/dashboard/${spe.code}?entity=${spe.code}&period=${period}`}
                  className="text-sm text-navy-800 underline"
                >
                  Study books
                </Link>
                <SpeLifecycleDialog
                  action="restore"
                  code={spe.code}
                  name={spe.name}
                  impact={restoreImpactCopy({ code: spe.code, name: spe.name })}
                  triggerLabel="Restore"
                  afterHref={`/deals?period=${period}`}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
