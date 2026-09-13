"use client";

import { rcpChartTheme, type RcpChartThemeName } from "@rcp/rcp-brand";
import type { ChartSuite } from "@rcp/reporting";
import { formatBpsAsPercent } from "@rcp/reporting";
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

export function ChartSuiteView({ suite, initialTheme = "light" }: { suite: ChartSuite; initialTheme?: RcpChartThemeName }) {
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2 text-[11px] uppercase tracking-[0.14em]">
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
      <div className="grid gap-4 xl:grid-cols-2">
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
        <ChartFrame title={suite.concentration.title} footnote={suite.concentration.footnote} themeName={themeName}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={suite.concentration.slices} dataKey="usd" nameKey="label" cx="50%" cy="50%" outerRadius={90}>
                {suite.concentration.slices.map((s, i) => (
                  <Cell key={s.key} fill={theme.series[i % theme.series.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartFrame>
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
      </div>
      <HeatmapTable suite={suite} themeName={themeName} />
    </div>
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
        LTV stays gated. Book occupancy is EGI / GPR. Physical occupancy is rent-roll sourced when present.
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
