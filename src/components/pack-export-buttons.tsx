"use client";

import type { PackId } from "@rcp/reporting";

export function PackExportButtons({
  packId,
  entity,
  period,
  view,
}: {
  packId: PackId;
  entity: string;
  period: string;
  view?: string;
}) {
  const qs = new URLSearchParams({ entity, period, format: "pdf" });
  if (view === "combined") qs.set("view", "combined");
  const pdf = `/api/packs/${packId}?${qs.toString()}`;
  qs.set("format", "pptx");
  const pptx = `/api/packs/${packId}?${qs.toString()}`;
  return (
    <div className="flex flex-wrap gap-2">
      <a className="bg-navy-900 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-cream-100" href={pdf}>
        Export PDF
      </a>
      <a className="border border-navy-900 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-navy-900" href={pptx}>
        Export PPTX
      </a>
    </div>
  );
}
