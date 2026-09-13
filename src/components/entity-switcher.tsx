"use client";

import { useRouter } from "next/navigation";

type EntityOption = {
  code: string;
  name: string;
  type: string;
  unitCount: number | null;
  strategy: string | null;
};

export function EntitySwitcher({
  entities,
  activeEntity,
  year,
  month,
  consolidated,
  pathname,
}: {
  entities: EntityOption[];
  activeEntity: string;
  year: number;
  month: number;
  consolidated: boolean;
  pathname: string;
}) {
  const router = useRouter();
  const period = `${year}-${String(month).padStart(2, "0")}`;

  function go(next: { entity?: string; period?: string; view?: string }) {
    const params = new URLSearchParams({
      entity: next.entity ?? activeEntity,
      period: next.period ?? period,
    });
    const entity = next.entity ?? activeEntity;
    const nextType = entities.find((e) => e.code === entity)?.type;
    const defaultView = nextType === "OPCO" || consolidated ? "combined" : "standalone";
    const view = next.view ?? defaultView;
    if (view === "combined" || view === "consolidated") params.set("view", "combined");
    if (pathname.startsWith("/narratives/packs/")) {
      router.push(`${pathname}?${params.toString()}`);
      return;
    }
    if (pathname === "/dashboard" || pathname.startsWith("/dashboard/SPE-") || pathname === "/dashboard/RCP-OPCO") {
      const dest =
        entity.startsWith("SPE-") || entity === "RCP-OPCO"
          ? `/dashboard/${entity}`
          : "/dashboard";
      router.push(`${dest}?${params.toString()}`);
      return;
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  const current = entities.find((e) => e.code === activeEntity);
  const canConsolidate = current?.type === "OPCO";

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <label className="uppercase tracking-[0.14em] text-gold-400">Entity</label>
      <select
        className="border border-navy-700 bg-navy-800 px-2 py-1.5 text-cream-100"
        value={activeEntity}
        onChange={(e) => go({ entity: e.target.value })}
      >
        {entities.map((entity) => (
          <option key={entity.code} value={entity.code}>
            {entity.name}
            {entity.unitCount ? ` · ${entity.unitCount} units` : ""}
          </option>
        ))}
      </select>
      <label className="uppercase tracking-[0.14em] text-gold-400">Period</label>
      <select
        className="border border-navy-700 bg-navy-800 px-2 py-1.5 text-cream-100"
        value={period}
        onChange={(e) => go({ period: e.target.value })}
      >
        <option value="2026-07">2026-07</option>
        <option value="2026-08">2026-08</option>
      </select>
      {canConsolidate ? (
        <select
          className="border border-navy-700 bg-navy-800 px-2 py-1.5 text-cream-100"
          value={consolidated ? "combined" : "standalone"}
          onChange={(e) => go({ view: e.target.value })}
        >
          <option value="standalone">Standalone</option>
          <option value="combined">Combined roll-up</option>
        </select>
      ) : null}
    </div>
  );
}
