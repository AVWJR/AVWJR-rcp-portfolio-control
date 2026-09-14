import { ArchivedSpeBanner } from "@/components/archived-spe-banner";
import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { ReapplyRentRollButton } from "@/components/reapply-rent-roll";
import { SpeDeleteControl } from "@/components/spe-delete-control";
import { VaultUploadForm } from "@/components/vault-forms";
import { currentAccessRole } from "@/lib/access-server";
import { isCanonicalRentRollFilename } from "@/lib/deals/rent-roll-candidates";
import { isBlobTokenConfigured, isOnVercel } from "@/lib/file-store";
import { listVaultDocuments } from "@/lib/vault";
import { looksLikeRentRollFilename, VAULT_KIND_LABELS } from "@rcp/documents/vault";
import Link from "next/link";

export default async function VaultPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearch>;
}) {
  const params = await searchParams;

  return (
    <ReportShell searchParams={params} pathname="/vault">
      {async (ctx) => {
        const period = `${ctx.year}-${String(ctx.month).padStart(2, "0")}`;
        const docs = await listVaultDocuments(ctx.entity.id);
        const role = await currentAccessRole();
        const liveSpe = ctx.entity.type === "SPE" && !ctx.archived;
        return (
          <div className="space-y-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{reportSubtitle(ctx)}</p>
                <h1 className="font-display text-4xl text-navy-900">Document vault</h1>
                <p className="mt-2 max-w-3xl text-sm text-ink-700">
                  Metadata plus file blobs linked to a legal entity. Large files (OM PDFs over ~3.5 MB)
                  use the same Vercel Blob client-upload path as Add Deal. Seed covers leases, loans,
                  K-1 placeholders, draws, and insurance for SPE-WBG. Not a live PMS or bank attachment
                  store. Removing a vault file is not deleting the deal. Soft-archived SPEs stay here
                  for study; restore is on gold nav{" "}
                  <Link className="underline" href={`/archive?period=${period}`}>
                    Deal Archive
                  </Link>
                  , not under Deals.
                </p>
              </div>
              {role === "principal" && liveSpe ? (
                <div className="space-y-2">
                  <SpeDeleteControl
                    code={ctx.entity.code}
                    name={ctx.entity.name}
                    afterHref={`/archive?period=${period}`}
                    triggerLabel="Delete"
                  />
                  <p className="max-w-xs text-xs text-ink-500">
                    Delete removes this SPE from live Deals. It does not remove a vault file.
                  </p>
                </div>
              ) : null}
            </div>
            {ctx.archived ? <ArchivedSpeBanner code={ctx.entity.code} period={period} /> : null}
            {liveSpe && role !== "viewer" ? (
              <div className="max-w-xl">
                <ReapplyRentRollButton entityCode={ctx.entity.code} hasUnits={(ctx.entity.unitCount ?? 0) > 0} />
              </div>
            ) : null}
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <section className="border border-cream-300 bg-white shadow-ledger">
                  <div className="border-b border-cream-300 bg-navy-900 px-6 py-4 text-cream-100">
                    <h2 className="font-display text-2xl">{ctx.entity.code} documents</h2>
                  </div>
                  {docs.length === 0 ? (
                    <p className="px-6 py-4 text-sm text-ink-700">No documents for this entity.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-cream-300 bg-cream-100 text-[11px] uppercase tracking-[0.12em] text-ink-500">
                          <th className="px-4 py-2 text-left">Title</th>
                          <th className="px-4 py-2 text-left">Kind</th>
                          <th className="px-4 py-2 text-left">File</th>
                          <th className="px-4 py-2 text-right">Bytes</th>
                          <th className="px-4 py-2 text-left">Download</th>
                          {liveSpe && role !== "viewer" ? <th className="px-4 py-2 text-left">Apply</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {docs.map((doc) => (
                          <tr key={doc.id} className="border-t border-cream-200">
                            <td className="px-4 py-1.5">{doc.title}</td>
                            <td className="px-4 py-1.5">{VAULT_KIND_LABELS[doc.kind]}</td>
                            <td className="px-4 py-1.5 text-xs">{doc.filename}</td>
                            <td className="tabular px-4 py-1.5 text-right">{doc.byteSize}</td>
                            <td className="px-4 py-1.5">
                              <a className="text-navy-700 underline" href={`/api/vault/${doc.id}`}>
                                Download
                              </a>
                            </td>
                            {liveSpe && role !== "viewer" ? (
                              <td className="px-4 py-1.5">
                                {!isCanonicalRentRollFilename(doc.filename) &&
                                (doc.kind === "rent_roll" || looksLikeRentRollFilename(doc.filename)) ? (
                                  <ReapplyRentRollButton
                                    entityCode={ctx.entity.code}
                                    documentId={doc.id}
                                    compact
                                  />
                                ) : null}
                              </td>
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
              </div>
              <VaultUploadForm
                entity={ctx.entity.code}
                period={period}
                blobConfigured={isBlobTokenConfigured()}
                onVercel={isOnVercel()}
              />
            </div>
          </div>
        );
      }}
    </ReportShell>
  );
}
