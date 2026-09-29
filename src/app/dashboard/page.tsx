import { resolveReportingPeriod } from "@/lib/period-default";
import { listEntities } from "@/lib/queries";
import { redirect } from "next/navigation";

export default async function DashboardIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; period?: string; view?: string }>;
}) {
  const params = await searchParams;
  const entities = await listEntities();
  const requested = params.entity ?? "RCP-OPCO";
  const period = await resolveReportingPeriod(requested, params.period);
  const entity =
    entities.find((e) => e.code === requested) ??
    entities.find((e) => e.type === "OPCO") ??
    entities[0];
  if (!entity) {
    redirect("/");
  }
  if (entity.type === "SPE") {
    redirect(`/dashboard/${entity.code}?entity=${entity.code}&period=${period}`);
  }
  const opco = entity.type === "OPCO" ? entity : entities.find((e) => e.type === "OPCO");
  const code = opco?.code ?? entity.code;
  redirect(`/dashboard/${code}?entity=${code}&period=${period}&view=combined`);
}
