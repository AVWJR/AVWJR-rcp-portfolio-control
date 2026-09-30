import { ArchiveDealButton } from "@/components/deals/archive-deal-button";
import { DealLibraryForm } from "@/components/deals/deal-library-form";
import { DealStatusControl } from "@/components/deals/deal-status-control";
import { SaveSnapshotButton } from "@/components/deals/save-snapshot-button";
import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { FEE_NEEDED } from "@/lib/library/fees";
import { loadDealProfile } from "@/lib/library/facts";
import { listPickItems, PICK_METRO, PICK_PROPERTY_TYPE, PICK_STATE } from "@/lib/library/pick-lists";
import { staleFlagLabel } from "@/lib/library/staleness";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DealProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<ReportSearch>;
}) {
  const { code } = await params;
  const query = await searchParams;
  const profile = await loadDealProfile(code);
  if (!profile) notFound();
  const picks = await listPickItems();
  const period = query.period ?? "2026-08";

  return (
    <ReportShell searchParams={{ ...query, entity: profile.code }} pathname={`/deals/${profile.code}`}>
      {(ctx) => (
        <div className="space-y-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{reportSubtitle(ctx)}</p>
            <p className="text-[11px] uppercase tracking-[0.16em] text-gold-700">{profile.code}</p>
            <h1 className="font-display text-4xl text-navy-900">{profile.name}</h1>
            <p className="mt-2 text-sm text-ink-700">
              Status {profile.statusLabel}. {profile.feeNeeded ? `LP returns need an AM fee and other LP fees — ${FEE_NEEDED}.` : "Deal fees are on file. LP returns are still Phase 2."}
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <Link className="text-navy-800 underline" href={`/dashboard/${profile.code}?entity=${profile.code}&period=${period}`}>Dashboard</Link>
              <Link className="text-navy-800 underline" href={`/deals/${profile.code}/waterfall?entity=${profile.code}&period=${period}`}>Waterfall</Link>
              <Link className="text-navy-800 underline" href={`/library?period=${period}`}>Deal Library</Link>
              <SaveSnapshotButton code={profile.code} period={period} />
            </div>
            {profile.latest ? (
              <p className="mt-3 text-sm text-ink-700">
                Latest snapshot {profile.latest.periodLabel}, basis {profile.latest.basisLabel}. {staleFlagLabel(profile.latest.stale) ?? "Current"}. Saving again keeps this one.
              </p>
            ) : (
              <p className="mt-3 text-sm text-ink-700">No analysis snapshot yet. Save one from the link above, or backfill from the Library.</p>
            )}
          </div>
          <DealStatusControl profile={profile} />
          {profile.dealStatus !== "OWNED" && profile.lifecycleStatus !== "ARCHIVED" ? (
            <section className="border border-cream-300 bg-white px-5 py-4 shadow-ledger">
              <h2 className="font-display text-2xl text-navy-900">Archive this deal</h2>
              <p className="mt-1 max-w-2xl text-sm text-ink-700">
                Delete asks for this SPE code, then archives the deal. Books and files stay. Nothing is removed because of age.
              </p>
              <div className="mt-3">
                <ArchiveDealButton code={profile.code} name={profile.name} afterHref="/library" />
              </div>
            </section>
          ) : null}
          <DealLibraryForm
            profile={profile}
            states={picks.filter((row) => row.kind === PICK_STATE).map((row) => row.label)}
            metros={picks.filter((row) => row.kind === PICK_METRO).map((row) => row.label)}
            propertyTypes={picks.filter((row) => row.kind === PICK_PROPERTY_TYPE).map((row) => row.label)}
          />
        </div>
      )}
    </ReportShell>
  );
}
