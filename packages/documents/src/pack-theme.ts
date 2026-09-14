import { RCP_CHART_THEMES, RCP_COLORS } from "@rcp/rcp-brand";

/** Office widescreen 16:9 (13.333" × 7.5"). PDF matches the same canvas. */
export const PACK_SLIDE_IN = { w: 13.333, h: 7.5 } as const;
export const PACK_MARGIN_IN = 0.5;
export const PACK_SLIDE_PT = { w: PACK_SLIDE_IN.w * 72, h: PACK_SLIDE_IN.h * 72 } as const;
export const PACK_MARGIN_PT = PACK_MARGIN_IN * 72;

export const PACK_PALETTE = {
  navy: RCP_COLORS.navy,
  navyDeep: RCP_COLORS.navyDeep,
  gold: RCP_COLORS.gold,
  cream: RCP_COLORS.cream,
  ink: RCP_COLORS.ink,
  muted: "#6B7280",
  rule: "#E2D8C4",
  inflow: RCP_CHART_THEMES.light.inflow,
  outflow: RCP_CHART_THEMES.light.outflow,
  total: RCP_CHART_THEMES.light.total,
  series: RCP_CHART_THEMES.light.series,
  pass: RCP_COLORS.navy,
  watch: RCP_COLORS.gold,
  fail: "#8A6F3A",
} as const;

export function hex(color: string): string {
  return color.replace("#", "");
}

export function seriesColor(i: number): string {
  return PACK_PALETTE.series[i % PACK_PALETTE.series.length]!;
}
