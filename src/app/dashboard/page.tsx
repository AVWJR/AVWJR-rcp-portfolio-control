import { listEntities } from "@/lib/queries";
import { redirect } from "next/navigation";

export default async function DashboardIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; period?: string; view?: string }>;
}) {
  const params = await searchParams;
  const entities = await listEntities();
  const period = params.period ?? "2026-08";
  const requested = params.entity ?? "RCP-OPCO";
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
