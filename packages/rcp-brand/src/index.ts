/** Institutional Roche Capital Partners brand tokens for the Phase A shell. */

export const RCP_NAME = "Roche Capital Partners";
export const RCP_SHORT = "RCP";
export const RCP_PRODUCT = "Portfolio Control";
export const RCP_PRODUCT_LINE = "OpCo Accounting";

export const RCP_LOCALE = "en-US";
export const RCP_CURRENCY = "USD";
export const RCP_TIMEZONE = "America/New_York";

export const RCP_COLORS = {
  navy: "#0B1F3A",
  navyDeep: "#06101C",
  gold: "#C4A46A",
  cream: "#F7F3EA",
  ink: "#1A1F26",
} as const;

export const RCP_CONFIDENTIAL = "Confidential — Internal Use Only";

export type RcpChartThemeName = "light" | "dark";

export type RcpChartTheme = {
  name: RcpChartThemeName;
  background: string;
  surface: string;
  text: string;
  muted: string;
  grid: string;
  axis: string;
  gold: string;
  navy: string;
  inflow: string;
  outflow: string;
  total: string;
  series: string[];
};

export const RCP_CHART_THEMES: Record<RcpChartThemeName, RcpChartTheme> = {
  light: {
    name: "light",
    background: "#F7F3EA",
    surface: "#FFFFFF",
    text: "#1A1F26",
    muted: "#6B7280",
    grid: "#E2D8C4",
    axis: "#3A414B",
    gold: "#C4A46A",
    navy: "#0B1F3A",
    inflow: "#2A5084",
    outflow: "#8A6F3A",
    total: "#0B1F3A",
    series: ["#0B1F3A", "#C4A46A", "#1B3A63", "#8A6F3A", "#2A5084", "#A8884A"],
  },
  dark: {
    name: "dark",
    background: "#06101C",
    surface: "#0B1F3A",
    text: "#F7F3EA",
    muted: "#D4BC8A",
    grid: "#1B3A63",
    axis: "#E2D8C4",
    gold: "#C4A46A",
    navy: "#C4A46A",
    inflow: "#D4BC8A",
    outflow: "#8A6F3A",
    total: "#F7F3EA",
    series: ["#C4A46A", "#F7F3EA", "#D4BC8A", "#8A6F3A", "#A8884A", "#E2D8C4"],
  },
};

export function rcpChartTheme(name: RcpChartThemeName = "light"): RcpChartTheme {
  return RCP_CHART_THEMES[name];
}
