import PptxGenJS from "pptxgenjs";
import { RCP_COLORS, RCP_CONFIDENTIAL, RCP_NAME, RCP_PRODUCT } from "@rcp/rcp-brand";
import type { BuiltPack, ChartSuite } from "@rcp/reporting";

const NAVY = RCP_COLORS.navy;
const GOLD = RCP_COLORS.gold;
const CREAM = RCP_COLORS.cream;

function themeSlide(pres: PptxGenJS, pack: BuiltPack) {
  const slide = pres.addSlide();
  slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: NAVY.replace("#", "") } });
  slide.addText(RCP_NAME, { x: 0.6, y: 0.35, w: 8, h: 0.3, fontSize: 12, color: GOLD.replace("#", ""), fontFace: "Georgia" });
  slide.addText(pack.meta.title, {
    x: 0.6,
    y: 2.4,
    w: 12,
    h: 0.8,
    fontSize: 32,
    color: CREAM.replace("#", ""),
    fontFace: "Georgia",
    bold: true,
  });
  slide.addText(`${pack.entityName}  ·  ${pack.period}  ·  ${pack.viewLabel}`, {
    x: 0.6,
    y: 3.3,
    w: 12,
    h: 0.4,
    fontSize: 14,
    color: GOLD.replace("#", ""),
    fontFace: "Calibri",
  });
  slide.addText(`${RCP_PRODUCT}  ·  ${RCP_CONFIDENTIAL}`, {
    x: 0.6,
    y: 6.9,
    w: 12,
    h: 0.3,
    fontSize: 10,
    color: GOLD.replace("#", ""),
  });
  return slide;
}

function addFooter(slide: ReturnType<PptxGenJS["addSlide"]>, pack: BuiltPack) {
  slide.addText(`${RCP_NAME} · ${pack.entityCode} · ${pack.period} · ${RCP_CONFIDENTIAL}`, {
    x: 0.5,
    y: 7.1,
    w: 12.3,
    h: 0.25,
    fontSize: 9,
    color: "6B7280",
  });
}

function chartData(pack: BuiltPack, chartId: string): { labels: string[]; values: number[]; title: string } {
  const suite: ChartSuite = pack.charts;
  if (chartId === "waterfall_gpr_noi_btcf") {
    return {
      title: suite.waterfall.title,
      labels: suite.waterfall.bars.map((b) => b.label),
      values: suite.waterfall.bars.map((b) => (b.kind === "outflow" ? -b.valueUsd : b.valueUsd)),
    };
  }
  if (chartId === "actual_vs_budget_bridge") {
    return {
      title: suite.budgetBridge.title,
      labels: suite.budgetBridge.bars.map((b) => b.label),
      values: suite.budgetBridge.bars.map((b) => (b.kind === "outflow" ? -b.valueUsd : b.valueUsd)),
    };
  }
  if (chartId === "trends_noi_occupancy_opex_dscr") {
    return {
      title: suite.trends.title,
      labels: suite.trends.points.map((p) => p.period),
      values: suite.trends.points.map((p) => p.noiUsd),
    };
  }
  if (chartId === "opex_composition") {
    return {
      title: suite.opexComposition.title,
      labels: suite.opexComposition.slices.map((s) => s.label),
      values: suite.opexComposition.slices.map((s) => s.usd),
    };
  }
  if (chartId === "capex_vs_reserves") {
    return {
      title: suite.capexVsReserves.title,
      labels: suite.capexVsReserves.bars.map((s) => s.label),
      values: suite.capexVsReserves.bars.map((s) => s.usd),
    };
  }
  if (chartId === "debt_maturity_wall") {
    return {
      title: suite.maturityWall.title,
      labels: suite.maturityWall.bars.map((s) => s.label),
      values: suite.maturityWall.bars.map((s) => s.usd),
    };
  }
  if (chartId === "portfolio_concentration") {
    return {
      title: suite.concentration.title,
      labels: suite.concentration.slices.map((s) => s.label),
      values: suite.concentration.slices.map((s) => s.usd),
    };
  }
  if (chartId === "bs_composition") {
    return {
      title: suite.bsComposition.title,
      labels: suite.bsComposition.assets.map((s) => s.label),
      values: suite.bsComposition.assets.map((s) => s.usd),
    };
  }
  if (chartId === "coverage_vs_threshold") {
    return {
      title: suite.coverageVsThreshold.title,
      labels: suite.coverageVsThreshold.rows.map((r) => r.label),
      values: suite.coverageVsThreshold.rows.map((r) => r.actual),
    };
  }
  if (chartId === "occupancy_breakeven") {
    return {
      title: suite.occupancyBreakeven.title,
      labels: suite.occupancyBreakeven.rows.map((r) => r.label),
      values: suite.occupancyBreakeven.rows.map((r) => r.pct ?? 0),
    };
  }
  if (chartId === "liquidity_runway") {
    return {
      title: suite.liquidityRunway.title,
      labels: suite.liquidityRunway.bars.map((s) => s.label),
      values: suite.liquidityRunway.bars.map((s) => s.usd),
    };
  }
  if (chartId === "fee_vs_noi") {
    return {
      title: suite.feeVsNoi.title,
      labels: suite.feeVsNoi.bars.map((s) => s.label),
      values: suite.feeVsNoi.bars.map((s) => s.usd),
    };
  }
  if (chartId === "upb_stack") {
    return {
      title: suite.upbStack.title,
      labels: suite.upbStack.bars.map((s) => s.label),
      values: suite.upbStack.bars.map((s) => s.usd),
    };
  }
  if (chartId === "covenant_watchlist") {
    return {
      title: suite.covenantWatchlist.title,
      labels: suite.covenantWatchlist.rows.map((r) => r.label),
      values: suite.covenantWatchlist.rows.map((r) => (r.tone === "fail" ? 1 : 0)),
    };
  }
  if (chartId === "t12_status") {
    return {
      title: suite.t12Status.title,
      labels: ["Months"],
      values: [suite.t12Status.monthsAvailable],
    };
  }
  if (chartId === "decision_posture") {
    return {
      title: suite.decisionPosture.title,
      labels: [suite.decisionPosture.action],
      values: [suite.decisionPosture.action === "GO" ? 3 : suite.decisionPosture.action === "HOLD" ? 2 : 1],
    };
  }
  if (chartId === "close_control") {
    return {
      title: suite.closeControl.title,
      labels: suite.closeControl.rows.map((r) => r.label),
      values: suite.closeControl.rows.map((_, i) => i + 1),
    };
  }
  if (chartId === "portfolio_heatmap") {
    return {
      title: suite.heatmap.title,
      labels: suite.heatmap.spec.rows.map((r) => r.label),
      values: suite.heatmap.spec.rows.map((r) => {
        const cell = suite.heatmap.spec.cells.find((c) => c.rowKey === r.key && c.colKey === "noi");
        const n = Number(String(cell?.display ?? "0").replace(/[^0-9.-]/g, ""));
        return Number.isFinite(n) ? n : 0;
      }),
    };
  }
  return { title: chartId, labels: ["n/a"], values: [0] };
}

export async function renderPptxPack(pack: BuiltPack): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.defineLayout({ name: "RCP_WIDE", width: 13.33, height: 7.5 });
  pres.layout = "RCP_WIDE";
  pres.author = RCP_NAME;
  pres.title = pack.generatedLabel;
  pres.subject = pack.meta.description;

  for (const slideSpec of pack.slides) {
    if (slideSpec.kind === "cover") {
      themeSlide(pres, pack);
      continue;
    }
    const slide = pres.addSlide();
    slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.55, fill: { color: NAVY.replace("#", "") } });
    slide.addText(`${RCP_NAME}  ·  ${pack.meta.title}`, {
      x: 0.4,
      y: 0.12,
      w: 12.5,
      h: 0.32,
      fontSize: 12,
      color: GOLD.replace("#", ""),
      fontFace: "Georgia",
    });
    slide.addText(slideSpec.title, {
      x: 0.5,
      y: 0.7,
      w: 12.3,
      h: 0.4,
      fontSize: 20,
      color: NAVY.replace("#", ""),
      fontFace: "Georgia",
      bold: true,
    });

    if (slideSpec.kind === "kpis") {
      slideSpec.kpis.forEach((k, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = 0.5 + col * 4.2;
        const y = 1.3 + row * 2.2;
        slide.addShape(pres.ShapeType.rect, {
          x,
          y,
          w: 3.95,
          h: 1.9,
          fill: { color: "FFFFFF" },
          line: { color: "E2D8C4", width: 1 },
        });
        slide.addText(k.label.toUpperCase(), { x: x + 0.2, y: y + 0.2, w: 3.5, h: 0.3, fontSize: 10, color: "8A6F3A" });
        slide.addText(k.value, {
          x: x + 0.2,
          y: y + 0.55,
          w: 3.5,
          h: 0.55,
          fontSize: 20,
          color: NAVY.replace("#", ""),
          bold: true,
        });
        slide.addText(k.hint, { x: x + 0.2, y: y + 1.25, w: 3.5, h: 0.4, fontSize: 11, color: "6B7280" });
      });
    } else if (slideSpec.kind === "chart") {
      const data = chartData(pack, slideSpec.chartId);
      slide.addChart(pres.ChartType.bar, [
        {
          name: data.title,
          labels: data.labels,
          values: data.values,
        },
      ], {
        x: 0.5,
        y: 1.2,
        w: 12.3,
        h: 5.5,
        barGrouping: "clustered",
        showLegend: false,
        chartColors: [NAVY.replace("#", ""), GOLD.replace("#", "")],
      });
    } else if (slideSpec.kind === "narrative") {
      const blocks = slideSpec.narrative.sections.map((s) => ({
        text: `${s.heading}\n${s.body}`,
        options: { fontSize: 12, color: "1A1F26", breakLine: true },
      }));
      slide.addText(blocks, { x: 0.5, y: 1.2, w: 12.3, h: 5.4, valign: "top" });
      if (slideSpec.narrative.recommendation) {
        slide.addText(`${slideSpec.narrative.recommendation.action}: ${slideSpec.narrative.recommendation.rationale}`, {
          x: 0.5,
          y: 6.55,
          w: 12.3,
          h: 0.4,
          fontSize: 12,
          bold: true,
          color: NAVY.replace("#", ""),
        });
      }
    } else if (slideSpec.kind === "disclosures") {
      slide.addText(slideSpec.bullets.map((b) => ({ text: b, options: { bullet: true, fontSize: 13, color: "1A1F26" } })), {
        x: 0.5,
        y: 1.2,
        w: 12.3,
        h: 5.5,
      });
    }
    addFooter(slide, pack);
  }

  const out = await pres.write({ outputType: "nodebuffer" });
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}
