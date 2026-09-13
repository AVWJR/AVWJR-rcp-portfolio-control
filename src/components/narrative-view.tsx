import type { AudienceId, AudienceNarrative } from "@rcp/reporting";
import { AUDIENCE_LABELS, AUDIENCES } from "@rcp/reporting";
import Link from "next/link";

export function NarrativeView({
  narrative,
  qs,
  compact = false,
}: {
  narrative: AudienceNarrative;
  qs: string;
  compact?: boolean;
}) {
  return (
    <article className="border border-cream-300 bg-white px-5 py-4 shadow-ledger">
      <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">{narrative.audienceLabel}</p>
      <h2 className="font-display text-3xl text-navy-900">{narrative.title}</h2>
      <p className="mt-1 text-sm text-ink-700">{narrative.dek}</p>
      {narrative.tone ? <p className="mt-1 text-xs italic text-ink-500">{narrative.tone}</p> : null}
      {narrative.recommendation ? (
        <p className="mt-3 border border-gold-500 bg-cream-50 px-3 py-2 text-sm text-navy-900">
          <strong>{narrative.recommendation.action}</strong> — {narrative.recommendation.rationale}
        </p>
      ) : null}
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {narrative.citations.slice(0, compact ? 6 : narrative.citations.length).map((c) => (
          <div key={c.id} className="border border-cream-200 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.14em] text-gold-700">{c.label}</p>
            <p className="tabular text-sm font-semibold text-navy-900">{c.value}</p>
            <p className="text-[10px] text-ink-500">
              {c.unit} · {c.source}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-5 space-y-4">
        {narrative.sections.map((section) => (
          <section key={section.heading}>
            <h3 className="font-display text-xl text-navy-900">{section.heading}</h3>
            <p className="mt-1 text-sm leading-6 text-ink-700">{section.body}</p>
          </section>
        ))}
      </div>
      <p className="mt-4 text-xs text-ink-500">
        Regenerated from {narrative.entityName} ({narrative.entityCode}) {narrative.period} · {narrative.viewLabel}.{" "}
        <Link className="underline" href={`/narratives?${qs}&audience=${narrative.audience}`}>
          Open audience
        </Link>
      </p>
    </article>
  );
}

export function AudienceTabs({ active, qs }: { active: AudienceId; qs: string }) {
  return (
    <nav className="flex flex-wrap gap-1 text-[12px] uppercase tracking-[0.12em]">
      {AUDIENCES.map((id) => (
        <Link
          key={id}
          href={`/narratives?${qs}&audience=${id}`}
          className={`px-3 py-1.5 ${active === id ? "bg-navy-900 text-cream-100" : "border border-cream-300 bg-white text-navy-800"}`}
        >
          {AUDIENCE_LABELS[id]}
        </Link>
      ))}
    </nav>
  );
}
