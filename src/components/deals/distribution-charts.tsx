"use client";

import { rcpChartTheme, type RcpChartThemeName } from "@rcp/rcp-brand";
import { formatBpsAsMultiple, formatUsd } from "@rcp/reporting";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type DistributionChartModel = {
  contributedCents: bigint;
  returnedCents: bigint;
  unreturnedCents: bigint;
  dpiBps: number | null;
  position: string;
  tiers: { id: string; label: string; state: "done" | "current" | "ahead" }[];
  points: {
    period: string;
    accruedCents: bigint;
    paidCents: bigint;
    unpaidCents: bigint;
    lpCents: bigint;
    rcpCents: bigint;
    coGpCents: bigint;
  }[];
  soWhat: {
    capital: string;
    pref: string;
    parties: string;
    tier: string;
    dpi: string;
  };
};

function usd(cents: bigint): number {
  return Number(cents) / 100;
}

export function DistributionCharts({
  model,
  themeName = "light",
}: {
  model: DistributionChartModel;
  themeName?: RcpChartThemeName;
}) {
  const theme = rcpChartTheme(themeName);
  const contributed = model.contributedCents > 0n ? model.contributedCents : 0n;
  const returnedShare = contributed > 0n ? Number((model.returnedCents * 10_000n) / contributed) / 100 : 0;
  const prefRows = model.points.map((point) => ({
    period: point.period,
    Accrued: usd(point.accruedCents),
    Paid: usd(point.paidCents),
    Unpaid: usd(point.unpaidCents),
  }));
  const partyRows = model.points.map((point) => ({
    period: point.period,
    "Deal LPs": usd(point.lpCents),
    RCP: usd(point.rcpCents),
    "Co-GP": usd(point.coGpCents),
  }));

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <figure className="border border-cream-300 bg-white px-4 py-3 shadow-ledger">
        <figcaption className="font-display text-xl text-navy-900">Capital returned</figcaption>
        <p className="mt-1 text-sm text-ink-700">{model.soWhat.capital}</p>
        <div className="mt-3 h-3 w-full bg-cream-200">
          <div className="h-3 bg-gold-500" style={{ width: `${Math.min(100, Math.max(0, returnedShare))}%` }} />
        </div>
        <p className="mt-2 text-sm tabular text-navy-900">
          {formatUsd(model.returnedCents)} back of {formatUsd(contributed)} contributed · {returnedShare.toFixed(1)}%
        </p>
        <p className="text-xs text-ink-500">Still invested {formatUsd(model.unreturnedCents)}.</p>
      </figure>

      <figure className="border border-cream-300 bg-white px-4 py-3 shadow-ledger">
        <figcaption className="font-display text-xl text-navy-900">LP multiple to date</figcaption>
        <p className="mt-1 text-sm text-ink-700">{model.soWhat.dpi}</p>
        <p className="mt-3 font-display text-4xl tabular text-navy-900">{formatBpsAsMultiple(model.dpiBps)}</p>
        <p className="text-xs text-ink-500">Distributions to Deal LPs divided by capital contributed.</p>
      </figure>

      <figure className="border border-cream-300 bg-white px-4 py-3 shadow-ledger">
        <figcaption className="font-display text-xl text-navy-900">Pref accrued versus paid</figcaption>
        <p className="mt-1 text-sm text-ink-700">{model.soWhat.pref}</p>
        <div className="mt-3 h-64 w-full">
          <ResponsiveContainer>
            <AreaChart data={prefRows.length ? prefRows : [{ period: "Start", Accrued: 0, Paid: 0, Unpaid: 0 }]}>
              <CartesianGrid stroke={theme.grid} vertical={false} />
              <XAxis dataKey="period" tick={{ fill: theme.axis, fontSize: 11 }} />
              <YAxis tick={{ fill: theme.axis, fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="Accrued" stroke={theme.navy} fill={theme.navy} fillOpacity={0.15} />
              <Area type="monotone" dataKey="Paid" stroke={theme.gold} fill={theme.gold} fillOpacity={0.35} />
              <Line type="monotone" dataKey="Unpaid" stroke={theme.outflow} strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </figure>

      <figure className="border border-cream-300 bg-white px-4 py-3 shadow-ledger">
        <figcaption className="font-display text-xl text-navy-900">Cumulative distributions by party</figcaption>
        <p className="mt-1 text-sm text-ink-700">{model.soWhat.parties}</p>
        <div className="mt-3 h-64 w-full">
          <ResponsiveContainer>
            <AreaChart data={partyRows.length ? partyRows : [{ period: "Start", "Deal LPs": 0, RCP: 0, "Co-GP": 0 }]}>
              <CartesianGrid stroke={theme.grid} vertical={false} />
              <XAxis dataKey="period" tick={{ fill: theme.axis, fontSize: 11 }} />
              <YAxis tick={{ fill: theme.axis, fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="Deal LPs" stackId="p" stroke={theme.navy} fill={theme.navy} />
              <Area type="monotone" dataKey="RCP" stackId="p" stroke={theme.gold} fill={theme.gold} />
              <Area type="monotone" dataKey="Co-GP" stackId="p" stroke={theme.inflow} fill={theme.inflow} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </figure>

      <figure className="border border-cream-300 bg-white px-4 py-3 shadow-ledger xl:col-span-2">
        <figcaption className="font-display text-xl text-navy-900">Where we are in the waterfall</figcaption>
        <p className="mt-1 text-sm text-ink-700">{model.soWhat.tier}</p>
        <ol className="mt-3 grid gap-2 md:grid-cols-4">
          {model.tiers.map((tier) => (
            <li
              key={tier.id}
              className={`border px-3 py-2 text-sm ${
                tier.state === "current"
                  ? "border-gold-500 bg-gold-50 text-navy-900"
                  : tier.state === "done"
                    ? "border-navy-800 bg-navy-900 text-cream-50"
                    : "border-cream-300 bg-cream-50 text-ink-500"
              }`}
            >
              <p className="text-[10px] uppercase tracking-[0.14em]">{tier.state === "current" ? "Now" : tier.state}</p>
              <p className="font-display text-lg">{tier.label}</p>
            </li>
          ))}
        </ol>
      </figure>
    </div>
  );
}
