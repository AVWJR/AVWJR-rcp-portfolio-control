import PDFDocument from "pdfkit";
import { RCP_COLORS, RCP_CONFIDENTIAL, RCP_NAME, RCP_PRODUCT } from "@rcp/rcp-brand";
import type { BuiltPack, ChartSuite, PackSlide, WaterfallBar } from "@rcp/reporting";

function hex(doc: PDFKit.PDFDocument, color: string) {
  doc.fillColor(color).strokeColor(color);
}

function drawHeader(doc: PDFKit.PDFDocument, pack: BuiltPack) {
  doc.rect(0, 0, doc.page.width, 56).fill(RCP_COLORS.navy);
  doc.fillColor(RCP_COLORS.gold).font("Times-Bold").fontSize(11).text(RCP_NAME, 48, 16, { width: 320 });
  doc.fillColor(RCP_COLORS.cream).font("Times-Roman").fontSize(9).text(`${RCP_PRODUCT} · ${pack.meta.title}`, 48, 32, {
    width: 400,
  });
  doc.fillColor(RCP_COLORS.gold).fontSize(8).text(`${pack.entityCode} · ${pack.period}`, doc.page.width - 200, 24, {
    width: 152,
    align: "right",
  });
}

function drawFooter(doc: PDFKit.PDFDocument, page: number, total: number) {
  const y = doc.page.height - 36;
  doc.moveTo(48, y).lineTo(doc.page.width - 48, y).strokeColor(RCP_COLORS.gold).lineWidth(0.6).stroke();
  doc.fillColor(RCP_COLORS.ink).font("Times-Roman").fontSize(8);
  doc.text(RCP_CONFIDENTIAL, 48, y + 8, { width: 280 });
  doc.text(`Page ${page} of ${total}`, doc.page.width - 200, y + 8, { width: 152, align: "right" });
}

function waterfallBars(doc: PDFKit.PDFDocument, bars: WaterfallBar[], x: number, y: number, w: number, h: number) {
  const max = Math.max(1, ...bars.map((b) => b.baseUsd + b.valueUsd));
  const gap = 8;
  const barW = Math.max(10, (w - gap * bars.length) / bars.length);
  bars.forEach((bar, i) => {
    const bx = x + i * (barW + gap);
    const color = bar.kind === "total" ? RCP_COLORS.navy : bar.kind === "outflow" ? "#8A6F3A" : "#2A5084";
    const bh = (bar.valueUsd / max) * (h - 28);
    const baseH = (bar.baseUsd / max) * (h - 28);
    const by = y + (h - 28) - baseH - bh;
    doc.rect(bx, by, barW, Math.max(2, bh)).fill(color);
    doc.fillColor(RCP_COLORS.ink).fontSize(6).text(bar.label, bx - 4, y + h - 22, { width: barW + 8, align: "center" });
  });
}

function simpleBars(
  doc: PDFKit.PDFDocument,
  items: { label: string; usd: number }[],
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.usd)));
  const gap = 10;
  const barW = Math.max(12, (w - gap * items.length) / items.length);
  items.forEach((item, i) => {
    const bx = x + i * (barW + gap);
    const bh = (Math.abs(item.usd) / max) * (h - 28);
    doc.rect(bx, y + (h - 28) - bh, barW, Math.max(2, bh)).fill(i % 2 === 0 ? RCP_COLORS.navy : RCP_COLORS.gold);
    doc.fillColor(RCP_COLORS.ink).fontSize(7).text(item.label, bx - 6, y + h - 22, { width: barW + 12, align: "center" });
  });
}

function drawChart(doc: PDFKit.PDFDocument, pack: BuiltPack, chartId: string, y: number) {
  const suite: ChartSuite = pack.charts;
  const x = 48;
  const w = doc.page.width - 96;
  const h = 168;
  doc.fillColor(RCP_COLORS.navy).font("Times-Bold").fontSize(13);
  if (chartId === "waterfall_gpr_noi_btcf") {
    doc.text(suite.waterfall.title, x, y);
    waterfallBars(doc, suite.waterfall.bars, x, y + 20, w, h);
    doc.fillColor("#6B7280").font("Times-Roman").fontSize(8).text(suite.waterfall.footnote, x, y + h + 8, { width: w });
    return;
  }
  if (chartId === "actual_vs_budget_bridge") {
    doc.text(suite.budgetBridge.title, x, y);
    waterfallBars(doc, suite.budgetBridge.bars, x, y + 20, w, h);
    doc.fillColor("#6B7280").font("Times-Roman").fontSize(8).text(suite.budgetBridge.footnote, x, y + h + 8, { width: w });
    return;
  }
  if (chartId === "trends_noi_occupancy_opex_dscr") {
    doc.text(suite.trends.title, x, y);
    simpleBars(
      doc,
      suite.trends.points.map((p) => ({ label: p.period, usd: p.noiUsd })),
      x,
      y + 20,
      w,
      h,
    );
    doc.fillColor("#6B7280").font("Times-Roman").fontSize(8).text(suite.trends.occupancyNote, x, y + h + 8, { width: w });
    return;
  }
  if (chartId === "opex_composition") {
    doc.text(suite.opexComposition.title, x, y);
    simpleBars(
      doc,
      suite.opexComposition.slices.map((s) => ({ label: s.label, usd: s.usd })),
      x,
      y + 20,
      w,
      h,
    );
    return;
  }
  if (chartId === "capex_vs_reserves") {
    doc.text(suite.capexVsReserves.title, x, y);
    simpleBars(
      doc,
      suite.capexVsReserves.bars.map((s) => ({ label: s.label, usd: s.usd })),
      x,
      y + 20,
      w,
      h,
    );
    doc.fillColor("#6B7280").font("Times-Roman").fontSize(8).text(suite.capexVsReserves.footnote, x, y + h + 8, { width: w });
    return;
  }
  if (chartId === "debt_maturity_wall") {
    doc.text(suite.maturityWall.title, x, y);
    simpleBars(
      doc,
      suite.maturityWall.bars.map((s) => ({ label: s.label, usd: s.usd })),
      x,
      y + 20,
      w,
      h,
    );
    return;
  }
  if (chartId === "portfolio_concentration") {
    doc.text(suite.concentration.title, x, y);
    simpleBars(
      doc,
      suite.concentration.slices.map((s) => ({ label: s.label, usd: s.usd })),
      x,
      y + 20,
      w,
      h,
    );
    doc.fillColor("#6B7280").font("Times-Roman").fontSize(8).text(suite.concentration.footnote, x, y + h + 8, { width: w });
    return;
  }
  if (chartId === "bs_composition") {
    doc.text(suite.bsComposition.title, x, y);
    simpleBars(
      doc,
      suite.bsComposition.assets.map((s) => ({ label: s.label, usd: s.usd })),
      x,
      y + 20,
      w,
      h,
    );
    doc.fillColor("#6B7280").font("Times-Roman").fontSize(8).text(suite.bsComposition.footnote, x, y + h + 8, { width: w });
    return;
  }
  if (chartId === "coverage_vs_threshold") {
    doc.text(suite.coverageVsThreshold.title, x, y);
    simpleBars(
      doc,
      suite.coverageVsThreshold.rows.map((r) => ({ label: `${r.label} ${r.unit}`, usd: r.actual })),
      x,
      y + 20,
      w,
      h,
    );
    doc.fillColor("#6B7280").font("Times-Roman").fontSize(8).text(suite.coverageVsThreshold.footnote, x, y + h + 8, { width: w });
    return;
  }
  if (chartId === "occupancy_breakeven") {
    doc.text(suite.occupancyBreakeven.title, x, y);
    simpleBars(
      doc,
      suite.occupancyBreakeven.rows.map((r) => ({ label: r.label, usd: r.pct ?? 0 })),
      x,
      y + 20,
      w,
      h,
    );
    doc.fillColor("#6B7280").font("Times-Roman").fontSize(8).text(suite.occupancyBreakeven.footnote, x, y + h + 8, { width: w });
    return;
  }
  if (chartId === "liquidity_runway") {
    doc.text(suite.liquidityRunway.title, x, y);
    simpleBars(
      doc,
      suite.liquidityRunway.bars.map((s) => ({ label: s.label, usd: s.usd })),
      x,
      y + 20,
      w,
      h,
    );
    doc.fillColor("#6B7280").font("Times-Roman").fontSize(8).text(suite.liquidityRunway.footnote, x, y + h + 8, { width: w });
    return;
  }
  if (chartId === "fee_vs_noi") {
    doc.text(suite.feeVsNoi.title, x, y);
    simpleBars(
      doc,
      suite.feeVsNoi.bars.map((s) => ({ label: s.label, usd: s.usd })),
      x,
      y + 20,
      w,
      h,
    );
    doc.fillColor("#6B7280").font("Times-Roman").fontSize(8).text(suite.feeVsNoi.footnote, x, y + h + 8, { width: w });
    return;
  }
  if (chartId === "portfolio_heatmap") {
    doc.text(suite.heatmap.title, x, y);
    let rowY = y + 28;
    doc.font("Times-Bold").fontSize(8).fillColor(RCP_COLORS.navy);
    doc.text("SPE", x, rowY);
    suite.heatmap.spec.cols.forEach((col, i) => doc.text(col.label, x + 80 + i * 80, rowY, { width: 76 }));
    rowY += 16;
    doc.font("Times-Roman");
    for (const row of suite.heatmap.spec.rows) {
      doc.fillColor(RCP_COLORS.ink).text(row.label, x, rowY);
      suite.heatmap.spec.cols.forEach((col, i) => {
        const cell = suite.heatmap.spec.cells.find((c) => c.rowKey === row.key && c.colKey === col.key);
        doc.text(cell?.display ?? "—", x + 80 + i * 80, rowY, { width: 76 });
      });
      rowY += 14;
    }
    return;
  }
  hex(doc, RCP_COLORS.navy);
  doc.text(chartId, x, y);
}

function renderSlide(doc: PDFKit.PDFDocument, pack: BuiltPack, slide: PackSlide) {
  drawHeader(doc, pack);
  let y = 72;
  if (slide.kind === "cover") {
    doc.fillColor(RCP_COLORS.gold).font("Times-Roman").fontSize(10).text("ROCHE CAPITAL PARTNERS", 48, y);
    doc.fillColor(RCP_COLORS.navy).font("Times-Bold").fontSize(26).text(slide.title, 48, y + 18, { width: 500 });
    doc.font("Times-Italic").fontSize(13).fillColor("#3A414B").text(slide.subtitle, 48, y + 56, { width: 500 });
    let by = y + 88;
    for (const bullet of slide.bullets) {
      doc.font("Times-Roman").fontSize(11).fillColor(RCP_COLORS.ink).text(`•  ${bullet}`, 48, by, { width: 500 });
      by += 18;
    }
    return;
  }
  if (slide.kind === "kpis") {
    doc.fillColor(RCP_COLORS.navy).font("Times-Bold").fontSize(16).text(slide.title, 48, y);
    slide.kpis.forEach((k, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 48 + col * 172;
      const ky = y + 28 + row * 72;
      doc.rect(x, ky, 160, 60).fill("#FFFFFF").strokeColor("#E2D8C4").lineWidth(0.8).stroke();
      doc.fillColor("#8A6F3A").font("Times-Roman").fontSize(8).text(k.label.toUpperCase(), x + 10, ky + 8, { width: 140 });
      doc.fillColor(RCP_COLORS.navy).font("Times-Bold").fontSize(14).text(k.value, x + 10, ky + 22, { width: 140 });
      doc.fillColor("#6B7280").font("Times-Roman").fontSize(7).text(k.hint, x + 10, ky + 42, { width: 140 });
    });
    return;
  }
  if (slide.kind === "chart") {
    drawChart(doc, pack, slide.chartId, y);
    return;
  }
  if (slide.kind === "narrative") {
    doc.fillColor(RCP_COLORS.navy).font("Times-Bold").fontSize(16).text(slide.title, 48, y);
    y += 24;
    for (const section of slide.narrative.sections) {
      doc.font("Times-Bold").fontSize(12).fillColor(RCP_COLORS.navy).text(section.heading, 48, y, { width: 516 });
      y = doc.y + 4;
      doc.font("Times-Roman").fontSize(10).fillColor(RCP_COLORS.ink).text(section.body, 48, y, { width: 516, align: "justify" });
      y = doc.y + 12;
      if (y > doc.page.height - 90) break;
    }
    if (slide.narrative.recommendation) {
      doc.font("Times-Bold").fontSize(11).fillColor(RCP_COLORS.navy).text(
        `${slide.narrative.recommendation.action}: ${slide.narrative.recommendation.rationale}`,
        48,
        Math.min(y, doc.page.height - 80),
        { width: 516 },
      );
    }
    return;
  }
  doc.fillColor(RCP_COLORS.navy).font("Times-Bold").fontSize(16).text(slide.title, 48, y);
  y += 22;
  for (const bullet of slide.bullets) {
    doc.font("Times-Roman").fontSize(10).fillColor(RCP_COLORS.ink).text(`•  ${bullet}`, 48, y, { width: 516 });
    y = doc.y + 8;
  }
}

export async function renderPdfPack(pack: BuiltPack): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 48, info: { Title: pack.generatedLabel, Author: RCP_NAME } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const total = pack.slides.length;
    pack.slides.forEach((slide, i) => {
      if (i > 0) doc.addPage();
      renderSlide(doc, pack, slide);
      drawFooter(doc, i + 1, total);
    });
    doc.end();
  });
}
