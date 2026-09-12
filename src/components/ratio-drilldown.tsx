import type { LiveRatio } from "@/lib/dashboards";
import { ContributorTable } from "./dashboard-tiles";
import Link from "next/link";

export function RatioDrilldown({
  tile,
  entityCode,
  period,
}: {
  tile: LiveRatio;
  entityCode: string;
  period: string;
}) {
  const def = tile.definition;
  return (
    <div className="space-y-5">
      <div className="border border-cream-300 bg-white px-5 py-4 shadow-ledger">
        <div className="flex flex-wrap items-center gap-2">
          <span className="bg-navy-900 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-gold-400">
            {def.status}
          </span>
          <span className="text-[10px] uppercase tracking-[0.16em] text-ink-500">
            Phase {def.phase} · {def.source.replaceAll("_", " ")} · {def.unit.replaceAll("_", " ")}
          </span>
          {tile.noiLabel ? (
            <span className="text-[10px] uppercase tracking-[0.16em] text-navy-700">{tile.noiLabel}</span>
          ) : null}
        </div>
        <h2 className="mt-2 font-display text-3xl text-navy-900">{def.label}</h2>
        <p className="mt-2 font-mono text-sm text-ink-700">{def.formula}</p>
        <p className="mt-3 font-display text-4xl text-navy-900 tabular">{tile.display}</p>
        <p className="mt-1 text-sm text-ink-700">{tile.hint}</p>
        <p className="mt-3 text-sm text-ink-700">{def.description}</p>
        {tile.notes.map((note) => (
          <p key={note} className="mt-2 text-xs text-ink-500">
            {note}
          </p>
        ))}
      </div>
      <div>
        <h3 className="mb-2 font-display text-2xl text-navy-900">Contributing rows</h3>
        <p className="mb-3 text-sm text-ink-700">
          Accounts, rent-roll fields, or loan-file inputs used in the formula. Links open the
          source statement.
        </p>
        <ContributorTable contributors={tile.contributors} />
      </div>
      <p className="text-xs text-ink-500">
        Dictionary source of truth:{" "}
        <Link className="underline" href="/dashboard/ratios">
          RCP Ratio Dictionary
        </Link>
        {" · "}
        {entityCode} {period}
      </p>
    </div>
  );
}
