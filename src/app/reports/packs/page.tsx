import { redirect } from "next/navigation";

export default async function ReportPacksAlias({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; period?: string; view?: string }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params.entity) qs.set("entity", params.entity);
  if (params.period) qs.set("period", params.period);
  if (params.view) qs.set("view", params.view);
  redirect(`/narratives?${qs.toString()}`);
}
