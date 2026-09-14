import { RCP_CHART_THEMES, RCP_COLORS } from "@rcp/rcp-brand";

/** Office widescreen 16:9 (13.333" × 7.5"). PDF matches the same canvas. */
export const PACK_SLIDE_IN = { w: 13.333, h: 7.5 } as const;
export const PACK_MARGIN_IN = 0.5;
export const PACK_SLIDE_PT = { w: PACK_SLIDE_IN.w * 72, h: PACK_SLIDE_IN.h * 72 } as const;
export const PACK_MARGIN_PT = PACK_MARGIN_IN * 72;

/**
 * Boardroom type scale for the 16:9 pack canvas (projector / 16:9 full screen).
 * Cards stay compact; type and padding fill them — do not stretch empty fills.
 */
export const PACK_TYPE = {
  pptx: {
    chromeKicker: 12,
    chromeTitle: 22,
    coverKicker: 13,
    coverTitle: 36,
    coverSubtitle: 18,
    coverThesis: 20,
    coverProofLabel: 13,
    coverProof: 34,
    coverChip: 13,
    kpiLabel: 13,
    kpiValue: 28,
    kpiSoWhatKicker: 11,
    kpiSoWhat: 15,
    visualTitle: 18,
    visualSoWhat: 14,
    chartAxis: 13,
    calloutKicker: 14,
    calloutValue: 52,
    calloutDetail: 16,
    thesisInsight: 24,
    thesisBullet: 15,
    thesisProofLabel: 12,
    thesisProof: 24,
    riskHeading: 18,
    riskBody: 15,
    askKicker: 12,
    ask: 18,
    appendixTitle: 16,
    appendixBody: 13,
    footer: 10,
  },
  pdf: {
    chromeKicker: 11,
    chromeTitle: 20,
    coverKicker: 12,
    coverTitle: 32,
    coverSubtitle: 16,
    coverThesis: 16,
    coverProofLabel: 12,
    coverProof: 28,
    coverChip: 12,
    kpiLabel: 11,
    kpiValue: 24,
    kpiSoWhatKicker: 10,
    kpiSoWhat: 13,
    visualTitle: 16,
    visualSoWhat: 13,
    chartLabel: 12,
    calloutKicker: 13,
    calloutValue: 44,
    calloutDetail: 14,
    thesisInsight: 20,
    thesisBullet: 13,
    thesisProofLabel: 11,
    thesisProof: 20,
    riskHeading: 16,
    riskBody: 13,
    askKicker: 11,
    ask: 16,
    appendixTitle: 14,
    appendixBody: 11,
    footer: 10,
  },
} as const;

export type PackRect = { x: number; y: number; w: number; h: number };

/**
 * Compact KPI tiles that do not stretch to the footer.
 * ≤4 tiles: one row. 5+: 3-up first row, remainder centered on a second row.
 */
export function kpiTileRects(
  count: number,
  opts: { originX: number; originY: number; usableW: number; gap: number; rowGap?: number; cardH: number },
): PackRect[] {
  const n = Math.max(1, count);
  const gap = opts.gap;
  const rowGap = opts.rowGap ?? opts.gap;
  const topCount = n <= 4 ? n : 3;
  const bottomCount = Math.max(0, n - topCount);
  const colCount = n <= 4 ? n : 3;
  const cardW = (opts.usableW - gap * (colCount - 1)) / colCount;
  const rects: PackRect[] = [];
  for (let i = 0; i < n; i++) {
    const row = i < topCount ? 0 : 1;
    const colInRow = row === 0 ? i : i - topCount;
    const rowCount = row === 0 ? topCount : bottomCount;
    const rowWidth = rowCount * cardW + gap * Math.max(0, rowCount - 1);
    const rowStartX = opts.originX + (opts.usableW - rowWidth) / 2;
    rects.push({
      x: rowStartX + colInRow * (cardW + gap),
      y: opts.originY + row * (opts.cardH + rowGap),
      w: cardW,
      h: opts.cardH,
    });
  }
  return rects;
}

/** Compact hero inside a column — vertically centered, never a full-height color slab. */
export function compactHeroRect(inner: PackRect, maxH: number): PackRect {
  const heroH = Math.min(maxH, inner.h);
  return {
    x: inner.x,
    y: inner.y + Math.max(0, (inner.h - heroH) / 2),
    w: inner.w,
    h: heroH,
  };
}

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
