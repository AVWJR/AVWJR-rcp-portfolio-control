import { CsvImportForm } from "@/components/csv-import-form";
import { KpiStrip } from "@/components/kpi-strip";
import { OperatingStatementTable } from "@/components/operating-statement-table";
import { ReapplyRentRollButton } from "@/components/reapply-rent-roll";
import { RentRollTable } from "@/components/rent-roll-table";
import { ReportShell, reportSubtitle, type ReportSearch } from "@/components/report-frame";
import { prisma } from "@/lib/prisma";
import { parseCanonicalNotes } from "@/lib/rent-roll";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export default async function PropertyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<ReportSearch>;
}) {
  const { code } = await params;
  const query = await searchParams;
  const entity = await prisma.entity.findUnique({ where: { code } });
  if (!entity || entity.type !== "SPE") notFound();

  const canonical = await prisma.vaultDocument.findFirst({
    where: { entityId: entity.id, filename: "rent-roll-canonical.xlsx" },
    orderBy: { uploadedAt: "desc" },
  });
  const original = await prisma.vaultDocument.findFirst({
    where: { entityId: entity.id, kind: "rent_roll", NOT: { filename: "rent-roll-canonical.xlsx" } },
    orderBy: { uploadedAt: "desc" },
  });
  const dialect = parseCanonicalNotes(canonical?.notes ?? original?.notes);

  const merged: ReportSearch = { ...query, entity: code, view: undefined };
  return (
    <ReportShell searchParams={merged} pathname={`/properties/${code}`}>
      {(ctx) => {
        if (ctx.entity.code !== code) {
          redirect(`/properties/${code}?entity=${code}&period=${ctx.year}-${String(ctx.month).padStart(2, "0")}`);
        }
        const period = `${ctx.year}-${String(ctx.month).padStart(2, "0")}`;
        const showBudget = ctx.statements.os.rows.some((r) => r.budget !== null);
        return (
          <div className="space-y-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{reportSubtitle(ctx)}</p>
              <h1 className="font-display text-4xl text-navy-900">{ctx.entity.name}</h1>
              <p className="mt-2 text-sm text-ink-700">
                {ctx.entity.unitCount} units · {ctx.entity.strategy?.replaceAll("_", " ")} · rent roll as-of
                period close. Occupancy KPIs are gated as rent-roll sourced.
              </p>
              {dialect?.dialectLabel ? (
                <p className="mt-3 border border-gold-300 bg-cream-50 px-4 py-2 text-sm text-navy-900">
                  Detected <span className="font-medium">{dialect.dialectLabel}</span> and normalized it.
                  Labels and unmapped fields are on the Canonical / Meta sheets — nothing is dropped silently.
                  Original workbook stays in Vault.
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                <Link className="text-navy-700 underline" href={`/dashboard/${code}?entity=${code}&period=${period}`}>
                  Property dashboard
                </Link>
                <Link className="text-navy-700 underline" href={`/reports/operating-statement?entity=${code}&period=${period}`}>
                  Full NOI bridge
                </Link>
                <Link className="text-navy-700 underline" href={`/api/rent-roll?entity=${code}&format=csv`}>
                  Download rent-roll CSV
                </Link>
                {canonical ? (
                  <Link className="text-navy-700 underline" href={`/api/rent-roll?entity=${code}&format=xlsx`}>
                    Download canonical XLSX
                  </Link>
                ) : null}
                {original ? (
                  <Link className="text-navy-700 underline" href={`/api/rent-roll?entity=${code}&format=original`}>
                    Download original workbook
                  </Link>
                ) : null}
                <Link
                  className="text-navy-700 underline"
                  href={`/api/budgets?entity=${code}&period=${period}&format=csv`}
                >
                  Download budget CSV
                </Link>
              </div>
            </div>
            <KpiStrip kpis={ctx.statements.kpis} />
            <OperatingStatementTable
              title="NOI bridge · budget vs actual"
              subtitle={reportSubtitle(ctx)}
              rows={ctx.statements.os.rows}
              showBudget={showBudget}
              showPrior={ctx.statements.os.prior !== null}
              footer="AM fees remain below NOI. Variance = actual − budget."
            />
            <div>
              <h2 className="mb-3 font-display text-2xl text-navy-900">Rent roll / unit master</h2>
              <div className="mb-3">
                <ReapplyRentRollButton entityCode={code} />
              </div>
              <CsvImportForm
                action="/api/rent-roll"
                entity={code}
                label="Replace rent-roll CSV / XLSX"
                acceptHint="Yardi Lease Charges, redIQ, broker/Yardi-MRI flat rows, or the RCP canonical template"
              />
              <div className="mt-4">
                <RentRollTable units={ctx.statements.units} />
              </div>
            </div>
          </div>
        );
      }}
    </ReportShell>
  );
}
