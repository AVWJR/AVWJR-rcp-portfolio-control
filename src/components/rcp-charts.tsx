"use client";

import { rcpChartTheme, type RcpChartThemeName } from "@rcp/rcp-brand";
import type { ChartId, ChartSuite } from "@rcp/reporting";
import { CHART_IDS, formatBpsAsPercent } from "@rcp/reporting";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function ChartFrame({
  title,
  footnote,
  themeName,
  children,
}: {
  title: string;
  footnote?: string;
  themeName: RcpChartThemeName;
  children: React.ReactNode;
}) {
  const theme = rcpChartTheme(themeName);
  return (
    <figure className="border px-4 py-3" style={{ background: theme.surface, borderColor: theme.grid, color: theme.text }}>
      <figcaption className="font-display text-xl" style={{ color: theme.navy }}>
        {title}
      </figcaption>
      <div className="mt-3 h-72 w-full">{children}</div>
      {footnote ? (
        <p className="mt-2 text-xs" style={{ color: theme.muted }}>
          {footnote}
        </p>
      ) : null}
    </figure>
  );
}

export function ChartSuiteView({
  suite,
  initialTheme = "light",
  visibleChartIds,
  audienceLabel,
}: {
  suite: ChartSuite;
  initialTheme?: RcpChartThemeName;
  visibleChartIds?: ChartId[];
  audienceLabel?: string;
}) {
  const [themeName, setThemeName] = useState<RcpChartThemeName>(initialTheme);
  const theme = useMemo(() => rcpChartTheme(themeName), [themeName]);

  const waterfall = suite.waterfall.bars.map((b) => ({
    name: b.label,
    base: b.baseUsd,
    value: b.valueUsd,
    kind: b.kind,
  }));
  const bridge = suite.budgetBridge.bars.map((b) => ({
    name: b.label,
    base: b.baseUsd,
    value: b.valueUsd,
    kind: b.kind,
  }));

  const show = (id: ChartId) => !visibleChartIds || visibleChartIds.includes(id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-[0.14em]">
        <p className="text-ink-600">
          {audienceLabel ? `${audienceLabel} infographics` : "Infographics"}
          {visibleChartIds ? ` · ${visibleChartIds.length} charts` : ` · ${CHART_IDS.length} charts`}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-ink-500">Chart theme</span>
          <button
            type="button"
            className={`px-2 py-1 ${themeName === "light" ? "bg-gold-500 text-navy-950" : "bg-navy-800 text-cream-100"}`}
            onClick={() => setThemeName("light")}
          >
            Light
          </button>
          <button
            type="button"
            className={`px-2 py-1 ${themeName === "dark" ? "bg-gold-500 text-navy-950" : "bg-navy-800 text-cream-100"}`}
            onClick={() => setThemeName("dark")}
          >
            Dark
          </button>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {show("waterfall_gpr_noi_btcf") ? (
          <ChartFrame title={suite.waterfall.title} footnote={suite.waterfall.footnote} themeName={themeName}>
            <ResponsiveContainer>
              <BarChart data={waterfall}>
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: theme.axis, fontSize: 10 }} />
                <YAxis tick={{ fill: theme.axis, fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="base" stackId="w" fill="transparent" />
                <Bar dataKey="value" stackId="w">
                  {waterfall.map((b) => (
                    <Cell
                      key={b.name}
                      fill={b.kind === "total" ? theme.total : b.kind === "outflow" ? theme.outflow : theme.inflow}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        ) : null}
        {show("trends_noi_occupancy_opex_dscr") ? (
          <ChartFrame title={suite.trends.title} footnote={suite.trends.occupancyNote} themeName={themeName}>
            <ResponsiveContainer>
              <ComposedChart data={suite.trends.points}>
                <CartesianGrid stroke={theme.grid} />
                <XAxis dataKey="period" tick={{ fill: theme.axis, fontSize: 10 }} />
                <YAxis yAxisId="usd" tick={{ fill: theme.axis, fontSize: 10 }} />
                <YAxis yAxisId="pct" orientation="right" tick={{ fill: theme.axis, fontSize: 10 }} />
                <Tooltip />
                <Legend />
                <Bar yAxisId="usd" dataKey="noiUsd" name="NOI $" fill={theme.navy} />
                <Line yAxisId="pct" dataKey="occupancyPct" name="Book occ. %" stroke={theme.gold} dot />
                <Line yAxisId="pct" dataKey="opexRatioPct" name="OpEx ratio %" stroke={theme.series[2]} dot />
                <Line yAxisId="usd" dataKey="dscrX" name="DSCR x" stroke={theme.series[3]} dot />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartFrame>
        ) : null}
        {show("opex_composition") ? (
          <ChartFrame title={suite.opexComposition.title} themeName={themeName}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={suite.opexComposition.slices} dataKey="usd" nameKey="label" cx="50%" cy="50%" outerRadius={90}>
                  {suite.opexComposition.slices.map((s, i) => (
                    <Cell key={s.key} fill={theme.series[i % theme.series.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartFrame>
        ) : null}
        {show("capex_vs_reserves") ? (
          <ChartFrame title={suite.capexVsReserves.title} footnote={suite.capexVsReserves.footnote} themeName={themeName}>
            <ResponsiveContainer>
              <BarChart data={suite.capexVsReserves.bars}>
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: theme.axis, fontSize: 10 }} />
                <YAxis tick={{ fill: theme.axis, fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="usd" fill={theme.gold} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        ) : null}
        {show("debt_maturity_wall") ? (
          <ChartFrame title={suite.maturityWall.title} themeName={themeName}>
            <ResponsiveContainer>
              <BarChart data={suite.maturityWall.bars}>
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: theme.axis, fontSize: 10 }} />
                <YAxis tick={{ fill: theme.axis, fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="usd" fill={theme.navy} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        ) : null}
        {show("portfolio_concentration") ? (
          <ChartFrame title={suite.concentration.title} footnote={suite.concentration.footnote} themeName={themeName}>
            <ResponsiveContainer>
              <BarChart data={suite.concentration.slices}>
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: theme.axis, fontSize: 10 }} />
                <YAxis tick={{ fill: theme.axis, fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="usd" name="Period NOI $" fill={theme.navy} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        ) : null}
        {show("actual_vs_budget_bridge") ? (
          <ChartFrame title={suite.budgetBridge.title} footnote={suite.budgetBridge.footnote} themeName={themeName}>
            <ResponsiveContainer>
              <BarChart data={bridge}>
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: theme.axis, fontSize: 10 }} />
                <YAxis tick={{ fill: theme.axis, fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="base" stackId="b" fill="transparent" />
                <Bar dataKey="value" stackId="b">
                  {bridge.map((b) => (
                    <Cell
                      key={b.name}
                      fill={b.kind === "total" ? theme.total : b.kind === "outflow" ? theme.outflow : theme.inflow}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        ) : null}
        {show("bs_composition") ? (
          <ChartFrame title={suite.bsComposition.title} footnote={suite.bsComposition.footnote} themeName={themeName}>
            <ResponsiveContainer>
              <BarChart data={suite.bsComposition.assets}>
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: theme.axis, fontSize: 10 }} />
                <YAxis tick={{ fill: theme.axis, fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="usd" fill={theme.navy} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        ) : null}
        {show("coverage_vs_threshold") ? (
          <ChartFrame title={suite.coverageVsThreshold.title} footnote={suite.coverageVsThreshold.footnote} themeName={themeName}>
            <ResponsiveContainer>
              <BarChart data={suite.coverageVsThreshold.rows}>
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: theme.axis, fontSize: 10 }} />
                <YAxis tick={{ fill: theme.axis, fontSize: 10 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="actual" name="Actual" fill={theme.navy} />
                <Bar dataKey="threshold" name="Threshold" fill={theme.gold} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        ) : null}
        {show("occupancy_breakeven") ? (
          <ChartFrame title={suite.occupancyBreakeven.title} footnote={suite.occupancyBreakeven.footnote} themeName={themeName}>
            <ResponsiveContainer>
              <BarChart data={suite.occupancyBreakeven.rows}>
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: theme.axis, fontSize: 10 }} />
                <YAxis tick={{ fill: theme.axis, fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="pct" name="%" fill={theme.gold} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        ) : null}
        {show("liquidity_runway") ? (
          <ChartFrame title={suite.liquidityRunway.title} footnote={suite.liquidityRunway.footnote} themeName={themeName}>
            <ResponsiveContainer>
              <BarChart data={suite.liquidityRunway.bars}>
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: theme.axis, fontSize: 10 }} />
                <YAxis tick={{ fill: theme.axis, fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="usd" fill={theme.navy} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        ) : null}
        {show("fee_vs_noi") ? (
          <ChartFrame title={suite.feeVsNoi.title} footnote={suite.feeVsNoi.footnote} themeName={themeName}>
            <ResponsiveContainer>
              <BarChart data={suite.feeVsNoi.bars}>
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: theme.axis, fontSize: 10 }} />
                <YAxis tick={{ fill: theme.axis, fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="usd" fill={theme.gold} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        ) : null}
        {show("upb_stack") ? (
          <ChartFrame title={suite.upbStack.title} footnote={suite.upbStack.footnote} themeName={themeName}>
            <ResponsiveContainer>
              <BarChart data={suite.upbStack.bars}>
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: theme.axis, fontSize: 10 }} />
                <YAxis tick={{ fill: theme.axis, fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="usd" name="UPB $" fill={theme.navy} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        ) : null}
      </div>
      {show("covenant_watchlist") ? <WatchlistStrip suite={suite} themeName={themeName} /> : null}
      {show("t12_status") ? <T12Callout suite={suite} themeName={themeName} /> : null}
      {show("decision_posture") ? <DecisionStrip suite={suite} themeName={themeName} /> : null}
      {show("close_control") ? <CloseControlStrip suite={suite} themeName={themeName} /> : null}
      {show("portfolio_heatmap") ? <HeatmapTable suite={suite} themeName={themeName} /> : null}
    </div>
  );
}

function WatchlistStrip({ suite, themeName }: { suite: ChartSuite; themeName: RcpChartThemeName }) {
  const theme = rcpChartTheme(themeName);
  return (
    <figure className="border px-4 py-3" style={{ background: theme.surface, borderColor: theme.grid, color: theme.text }}>
      <figcaption className="font-display text-xl" style={{ color: theme.navy }}>
        {suite.covenantWatchlist.title}
      </figcaption>
      <div className="mt-3 flex flex-wrap gap-2">
        {suite.covenantWatchlist.rows.map((row) => (
          <span
            key={row.key}
            className="px-3 py-1 text-sm"
            style={{
              background: row.tone === "fail" ? "#8A6F3A" : theme.navy,
              color: "#F7F3EA",
            }}
          >
            {row.label}: {row.reason}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs" style={{ color: theme.muted }}>
        {suite.covenantWatchlist.footnote}
      </p>
    </figure>
  );
}

function T12Callout({ suite, themeName }: { suite: ChartSuite; themeName: RcpChartThemeName }) {
  const theme = rcpChartTheme(themeName);
  return (
    <figure className="border px-4 py-3" style={{ background: theme.surface, borderColor: theme.grid, color: theme.text }}>
      <figcaption className="font-display text-xl" style={{ color: theme.navy }}>
        {suite.t12Status.title}
      </figcaption>
      <p className="mt-2 text-lg font-semibold" style={{ color: theme.navy }}>
        {suite.t12Status.complete
          ? `T12 ready · ${suite.t12Status.monthsAvailable}/12`
          : `T12 incomplete · ${suite.t12Status.monthsAvailable}/12 months · not annualized`}
      </p>
      <p className="text-sm">{suite.t12Status.label}</p>
      <p className="mt-2 text-xs" style={{ color: theme.muted }}>
        {suite.t12Status.footnote}
      </p>
    </figure>
  );
}

function DecisionStrip({ suite, themeName }: { suite: ChartSuite; themeName: RcpChartThemeName }) {
  const theme = rcpChartTheme(themeName);
  return (
    <figure className="border px-4 py-3" style={{ background: theme.surface, borderColor: theme.grid, color: theme.text }}>
      <figcaption className="font-display text-xl" style={{ color: theme.navy }}>
        {suite.decisionPosture.title}
      </figcaption>
      <p className="mt-2 text-2xl font-semibold" style={{ color: theme.navy }}>
        {suite.decisionPosture.action}
      </p>
      <p className="mt-1 text-sm">{suite.decisionPosture.rationale}</p>
      <ul className="mt-2 list-disc pl-5 text-xs" style={{ color: theme.muted }}>
        {suite.decisionPosture.conditions.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </figure>
  );
}

function CloseControlStrip({ suite, themeName }: { suite: ChartSuite; themeName: RcpChartThemeName }) {
  const theme = rcpChartTheme(themeName);
  return (
    <figure className="border px-4 py-3" style={{ background: theme.surface, borderColor: theme.grid, color: theme.text }}>
      <figcaption className="font-display text-xl" style={{ color: theme.navy }}>
        {suite.closeControl.title}
      </figcaption>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {suite.closeControl.rows.map((row) => (
          <div key={row.key} className="border px-3 py-2" style={{ borderColor: theme.grid }}>
            <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: theme.gold }}>
              {row.label}
            </p>
            <p className="text-sm font-semibold">{row.display}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs" style={{ color: theme.muted }}>
        {suite.closeControl.footnote}
      </p>
    </figure>
  );
}

function HeatmapTable({ suite, themeName }: { suite: ChartSuite; themeName: RcpChartThemeName }) {
  const theme = rcpChartTheme(themeName);
  const tone = (t: string) => {
    if (t === "fail") return "#8A6F3A";
    if (t === "good") return "#1B3A63";
    if (t === "gated") return "#6B7280";
    if (t === "watch") return "#C4A46A";
    return theme.surface;
  };
  return (
    <figure className="border px-4 py-3" style={{ background: theme.surface, borderColor: theme.grid, color: theme.text }}>
      <figcaption className="font-display text-xl" style={{ color: theme.navy }}>
        {suite.heatmap.title}
      </figcaption>
      <p className="mt-1 text-xs" style={{ color: theme.muted }}>
        SPE scoreboard. Book occupancy is EGI / GPR. Physical occupancy is rent-roll sourced when present. LTV omitted (gated).
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="py-2 text-left">SPE</th>
              {suite.heatmap.spec.cols.map((col) => (
                <th key={col.key} className="py-2 text-right">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {suite.heatmap.spec.rows.map((row) => (
              <tr key={row.key}>
                <td className="py-2 font-semibold">{row.label}</td>
                {suite.heatmap.spec.cols.map((col) => {
                  const cell = suite.heatmap.spec.cells.find((c) => c.rowKey === row.key && c.colKey === col.key);
                  return (
                    <td key={col.key} className="tabular py-2 text-right" style={{ background: tone(cell?.tone ?? "neutral") }}>
                      {cell?.display ?? "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs" style={{ color: theme.muted }}>
        Share column uses {formatBpsAsPercent(10_000)} as a full stack.
      </p>
    </figure>
  );
}
