import PptxGenJS from "pptxgenjs";
import { RCP_CONFIDENTIAL, RCP_NAME, RCP_PRODUCT } from "@rcp/rcp-brand";
import type { BuiltPack, PackSlide } from "@rcp/reporting";
import { compactHeroRect, hex, kpiTileRects, PACK_MARGIN_IN, PACK_PALETTE, PACK_SLIDE_IN, PACK_TYPE } from "./pack-theme";
import { toRenderableVisual, type RenderableVisual } from "./pack-visuals";

const NAVY = hex(PACK_PALETTE.navy);
const GOLD = hex(PACK_PALETTE.gold);
const CREAM = hex(PACK_PALETTE.cream);
const INK = hex(PACK_PALETTE.ink);
const MUTED = hex(PACK_PALETTE.muted);
const W = PACK_SLIDE_IN.w;
const H = PACK_SLIDE_IN.h;
const M = PACK_MARGIN_IN;

function addFooter(slide: ReturnType<PptxGenJS["addSlide"]>, pack: BuiltPack, page: number, total: number) {
  slide.addShape("rect", { x: 0, y: H - 0.32, w: W, h: 0.32, fill: { color: NAVY } });
  slide.addText(`${RCP_NAME}  ·  ${pack.entityCode}  ·  ${pack.period}  ·  ${RCP_CONFIDENTIAL}`, {
    x: M,
    y: H - 0.28,
    w: 9.4,
    h: 0.22,
    fontSize: PACK_TYPE.pptx.footer,
    color: GOLD,
    fontFace: "Calibri",
    margin: 0,
  });
  slide.addText(`${page} / ${total}`, {
    x: W - M - 1.2,
    y: H - 0.28,
    w: 1.2,
    h: 0.22,
    fontSize: PACK_TYPE.pptx.footer,
    color: GOLD,
    align: "right",
    fontFace: "Calibri",
    margin: 0,
  });
}

function addContentChrome(pres: PptxGenJS, pack: BuiltPack, title: string) {
  const slide = pres.addSlide();
  slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 0.12, h: H, fill: { color: GOLD } });
  slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.42, fill: { color: NAVY } });
  slide.addText(`${RCP_NAME}  ·  ${pack.meta.title}`, {
    x: M,
    y: 0.08,
    w: W - M * 2,
    h: 0.26,
    fontSize: PACK_TYPE.pptx.chromeKicker,
    color: GOLD,
    fontFace: "Georgia",
    margin: 0,
  });
  slide.addText(title, {
    x: M,
    y: 0.5,
    w: W - M * 2,
    h: 0.42,
    fontSize: PACK_TYPE.pptx.chromeTitle,
    color: NAVY,
    fontFace: "Georgia",
    bold: true,
    margin: 0,
  });
  return slide;
}

function drawCover(pres: PptxGenJS, pack: BuiltPack, slideSpec: Extract<PackSlide, { kind: "cover" }>) {
  const slide = pres.addSlide();
  slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: NAVY } });
  slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: H, fill: { color: GOLD } });
  slide.addText(RCP_NAME.toUpperCase(), {
    x: 0.7,
    y: 0.55,
    w: 11.8,
    h: 0.28,
    fontSize: PACK_TYPE.pptx.coverKicker,
    color: GOLD,
    fontFace: "Calibri",
    charSpacing: 3,
    margin: 0,
  });
  slide.addText(slideSpec.title, {
    x: 0.7,
    y: 1.15,
    w: 11.8,
    h: 0.7,
    fontSize: PACK_TYPE.pptx.coverTitle,
    color: CREAM,
    fontFace: "Georgia",
    bold: true,
    margin: 0,
  });
  slide.addText(slideSpec.subtitle, {
    x: 0.7,
    y: 1.88,
    w: 11.8,
    h: 0.36,
    fontSize: PACK_TYPE.pptx.coverSubtitle,
    color: GOLD,
    fontFace: "Georgia",
    margin: 0,
  });
  slide.addShape(pres.ShapeType.rect, { x: 0.7, y: 2.35, w: 2.2, h: 0.06, fill: { color: GOLD } });
  slide.addText(slideSpec.thesis, {
    x: 0.7,
    y: 2.6,
    w: 11.8,
    h: 0.9,
    fontSize: PACK_TYPE.pptx.coverThesis,
    color: CREAM,
    fontFace: "Georgia",
    margin: 0,
  });
  slide.addShape(pres.ShapeType.rect, {
    x: 0.7,
    y: 3.55,
    w: 5.9,
    h: 2.15,
    fill: { color: hex(PACK_PALETTE.navyDeep) },
  });
  slide.addText(slideSpec.proofLabel.toUpperCase(), {
    x: 0.95,
    y: 3.72,
    w: 5.4,
    h: 0.28,
    fontSize: PACK_TYPE.pptx.coverProofLabel,
    color: GOLD,
    fontFace: "Calibri",
    margin: 0,
  });
  slide.addText(slideSpec.proofValue, {
    x: 0.95,
    y: 4.05,
    w: 5.4,
    h: 1.3,
    fontSize: PACK_TYPE.pptx.coverProof,
    color: CREAM,
    fontFace: "Georgia",
    bold: true,
    valign: "middle",
    margin: 0,
  });
  slideSpec.bullets.forEach((bullet, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 6.9 + col * 3.0;
    const y = 3.55 + row * 1.1;
    slide.addShape(pres.ShapeType.rect, { x, y, w: 2.85, h: 0.98, fill: { color: hex(PACK_PALETTE.navyDeep) } });
    slide.addText(bullet, {
      x: x + 0.14,
      y: y + 0.18,
      w: 2.57,
      h: 0.64,
      fontSize: PACK_TYPE.pptx.coverChip,
      color: CREAM,
      fontFace: "Calibri",
      valign: "middle",
      margin: 0,
    });
  });
  slide.addText(`${slideSpec.audienceLabel}  ·  ${RCP_PRODUCT}  ·  ${RCP_CONFIDENTIAL}`, {
    x: 0.7,
    y: H - 0.55,
    w: 11.8,
    h: 0.28,
    fontSize: PACK_TYPE.pptx.footer,
    color: GOLD,
    fontFace: "Calibri",
    margin: 0,
  });
}

function drawKpis(slide: ReturnType<PptxGenJS["addSlide"]>, kpis: Extract<PackSlide, { kind: "kpis" }>["kpis"]) {
  const n = Math.max(1, kpis.length);
  const twoRow = n >= 5;
  const tiles = kpiTileRects(n, {
    originX: M,
    originY: 1.08,
    usableW: W - M * 2,
    gap: 0.18,
    rowGap: 0.2,
    cardH: twoRow ? 2.62 : 3.12,
  });
  kpis.forEach((k, i) => {
    const tile = tiles[i]!;
    const { x, y, w: cardW, h: cardH } = tile;
    const footerH = cardH * 0.46;
    const creamH = cardH - footerH;
    slide.addShape("rect", { x, y, w: cardW, h: cardH, fill: { color: CREAM } });
    slide.addShape("rect", { x, y, w: cardW, h: 0.07, fill: { color: GOLD } });
    slide.addText(k.label.toUpperCase(), {
      x: x + 0.2,
      y: y + 0.18,
      w: cardW - 0.4,
      h: 0.42,
      fontSize: PACK_TYPE.pptx.kpiLabel,
      color: GOLD,
      fontFace: "Calibri",
      margin: 0,
    });
    slide.addText(k.value, {
      x: x + 0.2,
      y: y + 0.62,
      w: cardW - 0.4,
      h: creamH - 0.74,
      fontSize: PACK_TYPE.pptx.kpiValue,
      color: NAVY,
      fontFace: "Georgia",
      bold: true,
      valign: "bottom",
      margin: 0,
    });
    slide.addShape("rect", { x, y: y + creamH, w: cardW, h: footerH, fill: { color: NAVY } });
    slide.addText("SO WHAT", {
      x: x + 0.2,
      y: y + creamH + 0.1,
      w: cardW - 0.4,
      h: 0.22,
      fontSize: PACK_TYPE.pptx.kpiSoWhatKicker,
      color: GOLD,
      fontFace: "Calibri",
      margin: 0,
    });
    slide.addText(k.soWhat ?? k.hint, {
      x: x + 0.2,
      y: y + creamH + 0.34,
      w: cardW - 0.4,
      h: footerH - 0.46,
      fontSize: PACK_TYPE.pptx.kpiSoWhat,
      color: CREAM,
      fontFace: "Calibri",
      valign: "top",
      margin: 0,
    });
  });
}

function toneFill(tone: "navy" | "gold" | "fail" | "pass" | "watch" | "neutral"): string {
  if (tone === "fail") return hex(PACK_PALETTE.fail);
  if (tone === "gold" || tone === "watch") return GOLD;
  if (tone === "neutral") return hex(PACK_PALETTE.rule);
  return NAVY;
}

function drawRenderable(
  pres: PptxGenJS,
  slide: ReturnType<PptxGenJS["addSlide"]>,
  visual: RenderableVisual,
  box: { x: number; y: number; w: number; h: number },
) {
  slide.addText(visual.title, {
    x: box.x,
    y: box.y,
    w: box.w,
    h: 0.36,
    fontSize: PACK_TYPE.pptx.visualTitle,
    color: NAVY,
    fontFace: "Georgia",
    bold: true,
    margin: 0,
  });
  slide.addText(visual.soWhat, {
    x: box.x,
    y: box.y + 0.38,
    w: box.w,
    h: 0.58,
    fontSize: PACK_TYPE.pptx.visualSoWhat,
    color: INK,
    fontFace: "Calibri",
    italic: true,
    margin: 0,
  });
  const headerH = 1.08;
  const bottomPad = 0.16;
  const inner = { x: box.x, y: box.y + headerH, w: box.w, h: box.h - headerH - bottomPad };

  if (visual.mode === "bars") {
    slide.addChart(pres.ChartType.bar, visual.series, {
      x: inner.x,
      y: inner.y,
      w: inner.w,
      h: inner.h,
      barGrouping: visual.stacked ? "stacked" : "clustered",
      showLegend: Boolean(visual.stacked && visual.series.length > 1),
      legendPos: "b",
      legendFontSize: PACK_TYPE.pptx.chartAxis,
      chartColors: visual.series.map((s) => hex(s.color)),
      showValue: false,
      valAxisHidden: false,
      catAxisLabelFontSize: PACK_TYPE.pptx.chartAxis,
      valAxisLabelFontSize: PACK_TYPE.pptx.chartAxis,
    });
    return;
  }
  if (visual.mode === "pie") {
    slide.addChart(pres.ChartType.pie, [
      { name: visual.title, labels: visual.labels, values: visual.values },
    ], {
      x: inner.x,
      y: inner.y,
      w: inner.w,
      h: inner.h,
      showLegend: true,
      legendPos: "r",
      legendFontSize: PACK_TYPE.pptx.chartAxis,
      chartColors: visual.colors.map(hex),
      showPercent: true,
    });
    return;
  }
  if (visual.mode === "callout") {
    const hero = compactHeroRect(inner, 3.35);
    slide.addShape("rect", { x: hero.x, y: hero.y, w: hero.w, h: hero.h, fill: { color: toneFill(visual.tone) } });
    slide.addText(visual.kicker.toUpperCase(), {
      x: hero.x + 0.32,
      y: hero.y + 0.32,
      w: hero.w - 0.64,
      h: 0.36,
      fontSize: PACK_TYPE.pptx.calloutKicker,
      color: GOLD,
      fontFace: "Calibri",
      margin: 0,
    });
    slide.addText(visual.value, {
      x: hero.x + 0.32,
      y: hero.y + 0.78,
      w: hero.w - 0.64,
      h: 1.15,
      fontSize: PACK_TYPE.pptx.calloutValue,
      color: CREAM,
      fontFace: "Georgia",
      bold: true,
      valign: "middle",
      margin: 0,
    });
    slide.addText(visual.detail, {
      x: hero.x + 0.32,
      y: hero.y + 2.05,
      w: hero.w - 0.64,
      h: hero.h - 2.28,
      fontSize: PACK_TYPE.pptx.calloutDetail,
      color: CREAM,
      fontFace: "Calibri",
      margin: 0,
    });
    return;
  }
  if (visual.mode === "status") {
    const n = visual.items.length || 1;
    const gap = 0.12;
    const itemH = Math.min(0.72, (inner.h - gap * (n - 1)) / n);
    visual.items.forEach((item, i) => {
      const y = inner.y + i * (itemH + gap);
      slide.addShape("rect", { x: inner.x, y, w: 0.1, h: itemH, fill: { color: toneFill(item.tone) } });
      slide.addText(item.label, {
        x: inner.x + 0.25,
        y,
        w: inner.w * 0.32,
        h: itemH,
        fontSize: 14,
        color: NAVY,
        bold: true,
        valign: "middle",
        margin: 0,
      });
      slide.addText(item.value, {
        x: inner.x + inner.w * 0.34,
        y,
        w: inner.w * 0.64,
        h: itemH,
        fontSize: 14,
        color: INK,
        valign: "middle",
        margin: 0,
      });
    });
    return;
  }
  const rows = [visual.headers, ...visual.rows];
  slide.addTable(
    rows.map((row, ri) =>
      row.map((cell) => ({
        text: cell,
        options: {
          fill: { color: ri === 0 ? NAVY : ri % 2 === 0 ? CREAM : "FFFFFF" },
          color: ri === 0 ? CREAM : INK,
          fontSize: 12,
          fontFace: "Calibri",
          bold: ri === 0,
          margin: 6,
        },
      })),
    ),
    { x: inner.x, y: inner.y, w: inner.w, h: Math.min(inner.h, 0.42 * rows.length + 0.2), border: [
      { pt: 0.4, color: hex(PACK_PALETTE.rule) },
      { pt: 0.4, color: hex(PACK_PALETTE.rule) },
      { pt: 0.4, color: hex(PACK_PALETTE.rule) },
      { pt: 0.4, color: hex(PACK_PALETTE.rule) },
    ], colW: visual.headers.map(() => inner.w / visual.headers.length) },
  );
}

function drawVisuals(
  pres: PptxGenJS,
  pack: BuiltPack,
  slide: ReturnType<PptxGenJS["addSlide"]>,
  visuals: Extract<PackSlide, { kind: "visuals" }>["visuals"],
) {
  const n = visuals.length || 1;
  const gap = 0.28;
  const usable = W - M * 2;
  const colW = (usable - gap * (n - 1)) / n;
  const y = 1.08;
  const h = 5.72;
  visuals.forEach((visual, i) => {
    const x = M + i * (colW + gap);
    drawRenderable(pres, slide, toRenderableVisual(pack, visual), { x, y, w: colW, h });
  });
}

function drawThesis(slide: ReturnType<PptxGenJS["addSlide"]>, spec: Extract<PackSlide, { kind: "thesis" }>) {
  slide.addText(spec.insight, {
    x: M,
    y: 1.08,
    w: 8.05,
    h: 1.2,
    fontSize: PACK_TYPE.pptx.thesisInsight,
    color: NAVY,
    fontFace: "Georgia",
    bold: true,
    valign: "top",
    margin: 0,
  });
  const bullets = spec.bullets.slice(0, 4);
  const cols = 2;
  const gap = 0.16;
  const gridW = 8.05;
  const cardW = (gridW - gap) / cols;
  const cardH = 1.28;
  bullets.forEach((b, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = M + col * (cardW + gap);
    const y = 2.42 + row * (cardH + gap);
    slide.addShape("rect", { x, y, w: cardW, h: cardH, fill: { color: CREAM } });
    slide.addShape("rect", { x, y, w: 0.08, h: cardH, fill: { color: GOLD } });
    slide.addText(b, {
      x: x + 0.24,
      y: y + 0.16,
      w: cardW - 0.38,
      h: cardH - 0.32,
      fontSize: PACK_TYPE.pptx.thesisBullet,
      color: INK,
      fontFace: "Calibri",
      valign: "middle",
      margin: 0,
    });
  });
  const proof = { x: 9.05, y: 1.08, w: 3.78, h: 2.05 };
  slide.addShape("rect", { x: proof.x, y: proof.y, w: proof.w, h: proof.h, fill: { color: NAVY } });
  slide.addText("PROOF", {
    x: proof.x + 0.22,
    y: proof.y + 0.22,
    w: proof.w - 0.44,
    h: 0.3,
    fontSize: PACK_TYPE.pptx.thesisProofLabel,
    color: GOLD,
    fontFace: "Calibri",
    margin: 0,
  });
  slide.addText(spec.proof, {
    x: proof.x + 0.22,
    y: proof.y + 0.58,
    w: proof.w - 0.44,
    h: proof.h - 0.82,
    fontSize: PACK_TYPE.pptx.thesisProof,
    color: CREAM,
    fontFace: "Georgia",
    bold: true,
    valign: "middle",
    margin: 0,
  });
}

function drawRisks(slide: ReturnType<PptxGenJS["addSlide"]>, spec: Extract<PackSlide, { kind: "risks" }>) {
  const n = spec.items.length || 1;
  const gap = 0.18;
  const usable = W - M * 2;
  const cardW = (usable - gap * (n - 1)) / n;
  spec.items.forEach((item, i) => {
    const x = M + i * (cardW + gap);
    slide.addShape("rect", { x, y: 1.02, w: cardW, h: 2.72, fill: { color: CREAM } });
    slide.addShape("rect", { x, y: 1.02, w: cardW, h: 0.08, fill: { color: GOLD } });
    slide.addText(item.heading, {
      x: x + 0.22,
      y: 1.18,
      w: cardW - 0.44,
      h: 0.4,
      fontSize: PACK_TYPE.pptx.riskHeading,
      color: NAVY,
      fontFace: "Georgia",
      bold: true,
      margin: 0,
    });
    slide.addText(item.body, {
      x: x + 0.22,
      y: 1.58,
      w: cardW - 0.44,
      h: 1.22,
      fontSize: PACK_TYPE.pptx.riskBody,
      color: INK,
      fontFace: "Calibri",
      margin: 0,
    });
    slide.addShape("rect", { x, y: 2.86, w: cardW, h: 0.88, fill: { color: NAVY } });
    slide.addText(item.proof, {
      x: x + 0.22,
      y: 3.0,
      w: cardW - 0.44,
      h: 0.58,
      fontSize: PACK_TYPE.pptx.riskBody,
      color: CREAM,
      fontFace: "Georgia",
      bold: true,
      valign: "middle",
      margin: 0,
    });
  });
  slide.addShape("rect", { x: M, y: 4.05, w: W - M * 2, h: 1.72, fill: { color: NAVY } });
  slide.addText("THE ASK", {
    x: M + 0.28,
    y: 4.22,
    w: W - M * 2 - 0.56,
    h: 0.28,
    fontSize: PACK_TYPE.pptx.askKicker,
    color: GOLD,
    fontFace: "Calibri",
    margin: 0,
  });
  slide.addText(spec.ask, {
    x: M + 0.28,
    y: 4.52,
    w: W - M * 2 - 0.56,
    h: 1.05,
    fontSize: PACK_TYPE.pptx.ask,
    color: CREAM,
    fontFace: "Georgia",
    margin: 0,
  });
}

function drawAppendix(slide: ReturnType<PptxGenJS["addSlide"]>, spec: Extract<PackSlide, { kind: "appendix" }>) {
  const leftW = 6.2;
  slide.addShape("rect", { x: M, y: 0.98, w: leftW, h: 5.85, fill: { color: CREAM } });
  slide.addText("Disclosures", {
    x: M + 0.18,
    y: 1.1,
    w: leftW - 0.36,
    h: 0.32,
    fontSize: PACK_TYPE.pptx.appendixTitle,
    color: NAVY,
    fontFace: "Georgia",
    bold: true,
    margin: 0,
  });
  slide.addText(
    spec.bullets.map((b) => ({ text: b, options: { bullet: false, breakLine: true } })),
    {
      x: M + 0.18,
      y: 1.48,
      w: leftW - 0.36,
      h: 5.15,
      fontSize: PACK_TYPE.pptx.appendixBody,
      color: INK,
      fontFace: "Calibri",
      paraSpaceAfter: 8,
      valign: "top",
    },
  );
  const rightX = 7.05;
  const rightW = 5.78;
  slide.addShape("rect", { x: rightX, y: 0.98, w: rightW, h: 5.85, fill: { color: CREAM } });
  slide.addText("Remaining KPIs", {
    x: rightX + 0.18,
    y: 1.1,
    w: rightW - 0.36,
    h: 0.32,
    fontSize: PACK_TYPE.pptx.appendixTitle,
    color: NAVY,
    fontFace: "Georgia",
    bold: true,
    margin: 0,
  });
  const shown = spec.extraKpis.slice(0, 10);
  shown.forEach((k, i) => {
    const y = 1.5 + i * 0.34;
    slide.addText(k.label, { x: rightX + 0.18, y, w: 2.5, h: 0.32, fontSize: PACK_TYPE.pptx.appendixBody, color: MUTED, fontFace: "Calibri", margin: 0 });
    slide.addText(k.value, { x: rightX + 2.7, y, w: 2.85, h: 0.32, fontSize: PACK_TYPE.pptx.appendixBody, color: NAVY, fontFace: "Calibri", bold: true, margin: 0 });
  });
  spec.callouts.slice(0, 2).forEach((c, i) => {
    const y = 4.7 + i * 0.95;
    slide.addText(c.title, { x: rightX + 0.18, y, w: rightW - 0.36, h: 0.28, fontSize: 14, color: NAVY, fontFace: "Georgia", bold: true, margin: 0 });
    slide.addText(c.soWhat, { x: rightX + 0.18, y: y + 0.28, w: rightW - 0.36, h: 0.58, fontSize: PACK_TYPE.pptx.appendixBody, color: INK, fontFace: "Calibri", margin: 0 });
  });
}

export async function renderPptxPack(pack: BuiltPack): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.defineLayout({ name: "RCP_WIDE", width: PACK_SLIDE_IN.w, height: PACK_SLIDE_IN.h });
  pres.layout = "RCP_WIDE";
  pres.author = RCP_NAME;
  pres.title = pack.generatedLabel;
  pres.subject = pack.meta.description;

  const total = pack.slides.length;
  pack.slides.forEach((slideSpec, i) => {
    if (slideSpec.kind === "cover") {
      drawCover(pres, pack, slideSpec);
      return;
    }
    const slide = addContentChrome(pres, pack, slideSpec.title);
    if (slideSpec.kind === "kpis") drawKpis(slide, slideSpec.kpis);
    else if (slideSpec.kind === "thesis") drawThesis(slide, slideSpec);
    else if (slideSpec.kind === "visuals") drawVisuals(pres, pack, slide, slideSpec.visuals);
    else if (slideSpec.kind === "risks") drawRisks(slide, slideSpec);
    else drawAppendix(slide, slideSpec);
    addFooter(slide, pack, i + 1, total);
  });

  const out = await pres.write({ outputType: "nodebuffer" });
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}
