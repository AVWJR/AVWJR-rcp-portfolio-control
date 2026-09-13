import { formatUsd } from "@rcp/ledger";
import type { BrokerT12OverlaySummary } from "@/lib/t12-overlay";

export function BrokerOverlayStrip({ overlay }: { overlay: BrokerT12OverlaySummary | null }) {
  if (!overlay) return null;
  return (
    <section className="border border-gold-400 bg-cream-50 px-5 py-4 shadow-ledger">
      <p className="text-[11px] uppercase tracking-[0.2em] text-gold-700">
        {overlay.postedToGl ? "Broker T12 overlay — imported journals, not audited books" : "Broker T12 overlay — not posted to the GL"}
      </p>
      <h2 className="mt-1 font-display text-2xl text-navy-900">
        T12 EGI {formatUsd(overlay.egi)} · NOI {formatUsd(overlay.noi)}
      </h2>
      <p className="mt-2 max-w-3xl text-sm text-ink-700">
        From <strong>{overlay.filename}</strong>
        {overlay.sheet ? ` · sheet “${overlay.sheet}”` : ""} · {overlay.monthCount} month
        {overlay.monthCount === 1 ? "" : "s"}. Monthly averages were written to the {overlay.budgetPeriod}{" "}
        <strong>budget</strong> (source <code>broker_t12</code>)
        {overlay.postedToGl
          ? " and to labeled journals (source broker_t12_overlay) so period EGI/NOI leave $0."
          : ". Period tiles above are books — they stay $0 until journals are posted."}{" "}
        Cash-book codes are not RCP CoA. Do not read this strip as audited GL.
      </p>
      <dl className="mt-3 grid gap-2 text-sm md:grid-cols-4">
        <div>
          <dt className="text-[11px] uppercase tracking-[0.12em] text-ink-500">GPR</dt>
          <dd className="tabular">{formatUsd(overlay.gpr)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.12em] text-ink-500">Vacancy + concessions</dt>
          <dd className="tabular">{formatUsd(overlay.vacancy + overlay.concessions)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.12em] text-ink-500">Other income</dt>
          <dd className="tabular">{formatUsd(overlay.otherIncome)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.12em] text-ink-500">OpEx</dt>
          <dd className="tabular">{formatUsd(overlay.opex)}</dd>
        </div>
      </dl>
    </section>
  );
}
