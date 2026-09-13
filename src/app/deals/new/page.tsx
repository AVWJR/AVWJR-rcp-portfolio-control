import { AddDealWizard } from "@/components/deals/add-deal-wizard";
import { ReportShell, type ReportSearch } from "@/components/report-frame";
import { listPeriodLabels } from "@/lib/deals/periods";
import { prisma } from "@/lib/prisma";

export default async function NewDealPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearch & { intake?: string }>;
}) {
  const params = await searchParams;
  const [opcos, periodLabels] = await Promise.all([
    prisma.entity.findMany({
      where: { type: "OPCO" },
      select: { code: true, name: true },
      orderBy: { code: "asc" },
    }),
    listPeriodLabels(),
  ]);

  return (
    <ReportShell searchParams={params} pathname="/deals/new">
      {() => (
        <AddDealWizard
          initialIntakeId={params.intake}
          opcos={opcos.length ? opcos : [{ code: "RCP-OPCO", name: "RCP Operating Company LLC" }]}
          periodLabels={periodLabels}
        />
      )}
    </ReportShell>
  );
}
