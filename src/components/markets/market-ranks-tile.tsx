import Link from "next/link";
import type { MarketTileModel } from "@/lib/markets/read";

export function MarketRanksTile({ model }: { model: MarketTileModel }) {
  const className = "border border-cream-300 bg-white px-4 py-3 shadow-ledger hover:border-gold-500";
  if (model.state === "locked") {
    return (
      <Link href="/unlock" className={className}>
        <p className="text-[11px] uppercase tracking-[0.16em] text-gold-700">Market Ranks</p>
        <p className="mt-1 font-display text-2xl text-navy-900">Principal</p>
        <p className="mt-1 text-xs text-ink-500">Unlock to open Market Ranks.</p>
      </Link>
    );
  }
  if (model.state === "pending") {
    return (
      <div className="border border-cream-300 bg-white px-4 py-3 shadow-ledger">
        <p className="text-[11px] uppercase tracking-[0.16em] text-gold-700">Market Ranks</p>
        <p className="mt-1 font-display text-2xl text-navy-900">data needed</p>
        <p className="mt-1 text-xs text-ink-500">{model.message}</p>
      </div>
    );
  }
  return (
    <Link href="/markets" className={className}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.16em] text-gold-700">Market Ranks</p>
        <span className="text-[9px] uppercase tracking-[0.12em] text-ink-500">Free public data</span>
      </div>
      <p className="mt-1 font-display text-2xl text-navy-900 tabular">{model.topScore}</p>
      <p className="mt-1 text-xs text-ink-500">
        {model.topName} · rank {model.topRank} of {model.metroCount} · {model.asOfLabel}
      </p>
      <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-gold-700">Scoreboard →</p>
    </Link>
  );
}
