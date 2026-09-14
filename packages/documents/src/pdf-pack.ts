import PDFDocument from "pdfkit";
import { RCP_CONFIDENTIAL, RCP_NAME, RCP_PRODUCT } from "@rcp/rcp-brand";
import type { BuiltPack, PackSlide, WaterfallBar } from "@rcp/reporting";
import { compactHeroRect, kpiTileRects, PACK_MARGIN_PT, PACK_PALETTE, PACK_SLIDE_PT, PACK_TYPE, seriesColor } from "./pack-theme";
import { toRenderableVisual, type RenderableVisual } from "./pack-visuals";

const W = PACK_SLIDE_PT.w;
const H = PACK_SLIDE_PT.h;
const M = PACK_MARGIN_PT;

function drawFooter(doc: PDFKit.PDFDocument, pack: BuiltPack, page: number, total: number) {
  doc.rect(0, H - 24, W, 24).fill(PACK_PALETTE.navy);
  doc.fillColor(PACK_PALETTE.gold).font("Times-Roman").fontSize(PACK_TYPE.pdf.footer);
  doc.text(`${RCP_NAME}  ·  ${pack.entityCode}  ·  ${pack.period}  ·  ${RCP_CONFIDENTIAL}`, M, H - 17, {
    width: W - M * 2 - 50,
  });
  doc.text(`${page} / ${total}`, W - M - 48, H - 17, { width: 48, align: "right" });
}

function drawChrome(doc: PDFKit.PDFDocument, pack: BuiltPack, title: string) {
  doc.rect(0, 0, 8, H).fill(PACK_PALETTE.gold);
  doc.rect(0, 0, W, 32).fill(PACK_PALETTE.navy);
  doc.fillColor(PACK_PALETTE.gold).font("Times-Bold").fontSize(PACK_TYPE.pdf.chromeKicker).text(`${RCP_NAME}  ·  ${pack.meta.title}`, M, 10, {
    width: W - M * 2,
  });
  doc.fillColor(PACK_PALETTE.navy).font("Times-Bold").fontSize(PACK_TYPE.pdf.chromeTitle).text(title, M, 42, { width: W - M * 2 });
}

const CHART_LABEL_BAND = 52;

function simpleBars(
  doc: PDFKit.PDFDocument,
  items: { label: string; usd: number; color: string }[],
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.usd)));
  const gap = 12;
  const labelH = CHART_LABEL_BAND;
  const barW = Math.max(12, (w - gap * items.length) / items.length);
  items.forEach((item, i) => {
    const bx = x + i * (barW + gap);
    const bh = (Math.abs(item.usd) / max) * (h - labelH);
    doc.rect(bx, y + (h - labelH) - bh, barW, Math.max(2, bh)).fill(item.color);
    doc.fillColor(PACK_PALETTE.ink).font("Times-Roman").fontSize(PACK_TYPE.pdf.chartLabel).text(item.label, bx - 4, y + h - labelH + 8, {
      width: barW + 8,
      align: "center",
    });
  });
}

function waterfallBars(doc: PDFKit.PDFDocument, bars: WaterfallBar[], x: number, y: number, w: number, h: number) {
  const max = Math.max(1, ...bars.map((b) => b.baseUsd + b.valueUsd));
  const gap = 8;
  const labelH = CHART_LABEL_BAND;
  const barW = Math.max(10, (w - gap * bars.length) / bars.length);
  bars.forEach((bar, i) => {
    const bx = x + i * (barW + gap);
    const color = bar.kind === "total" ? PACK_PALETTE.navy : bar.kind === "outflow" ? PACK_PALETTE.outflow : PACK_PALETTE.inflow;
    const bh = (bar.valueUsd / max) * (h - labelH);
    const baseH = (bar.baseUsd / max) * (h - labelH);
    const by = y + (h - labelH) - baseH - bh;
    doc.rect(bx, by, barW, Math.max(2, bh)).fill(color);
    doc.fillColor(PACK_PALETTE.ink).font("Times-Roman").fontSize(PACK_TYPE.pdf.chartLabel).text(bar.label, bx - 4, y + h - labelH + 8, {
      width: barW + 8,
      align: "center",
    });
  });
}

function pieChart(
  doc: PDFKit.PDFDocument,
  slices: { label: string; value: number; color: string }[],
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const cx = x + Math.min(w, h) * 0.38;
  const cy = y + h / 2;
  const r = Math.min(w, h) * 0.36;
  const total = slices.reduce((s, sl) => s + Math.abs(sl.value), 0) || 1;
  let start = -Math.PI / 2;
  slices.forEach((slice) => {
    const sweep = (Math.abs(slice.value) / total) * Math.PI * 2;
    const end = start + sweep;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const large = sweep > Math.PI ? 1 : 0;
    doc
      .path(`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`)
      .fill(slice.color);
    start = end;
  });
  let ly = y + 10;
  slices.forEach((slice) => {
    doc.rect(x + w * 0.62, ly, 10, 10).fill(slice.color);
    doc.fillColor(PACK_PALETTE.ink).font("Times-Roman").fontSize(PACK_TYPE.pdf.chartLabel).text(slice.label, x + w * 0.62 + 16, ly - 1, {
      width: w * 0.35,
    });
    ly += 20;
  });
}

function drawRenderable(doc: PDFKit.PDFDocument, pack: BuiltPack, visual: RenderableVisual, box: { x: number; y: number; w: number; h: number }) {
  doc.fillColor(PACK_PALETTE.navy).font("Times-Bold").fontSize(PACK_TYPE.pdf.visualTitle).text(visual.title, box.x, box.y, { width: box.w });
  doc.fillColor(PACK_PALETTE.ink).font("Times-Italic").fontSize(PACK_TYPE.pdf.visualSoWhat).text(visual.soWhat, box.x, box.y + 24, { width: box.w });
  const headerH = 72;
  const bottomPad = 12;
  const inner = { x: box.x, y: box.y + headerH, w: box.w, h: box.h - headerH - bottomPad };

  if (visual.mode === "bars") {
    const labels = visual.labels;
    const totals = labels.map((_, i) => visual.series.reduce((s, ser) => s + (ser.values[i] ?? 0), 0));
    const colors = labels.map((_, i) => {
      const hit = visual.series.find((ser) => (ser.values[i] ?? 0) !== 0);
      return hit?.color ?? PACK_PALETTE.navy;
    });
    if (visual.series.length === 3 && visual.stacked && pack.charts) {
      const maybeWaterfall =
        visual.title.includes("waterfall") || visual.title.includes("bridge") || visual.title.includes("GPR") || visual.title.includes("budget");
      if (maybeWaterfall && visual.series[0]?.name === "Inflow") {
        const bars: WaterfallBar[] = labels.map((label, i) => {
          const inflow = visual.series[0]?.values[i] ?? 0;
          const outflow = visual.series[1]?.values[i] ?? 0;
          const total = visual.series[2]?.values[i] ?? 0;
          const kind = total ? "total" : outflow ? "outflow" : "inflow";
          const valueUsd = total || outflow || inflow;
          return { key: label, label, valueUsd, baseUsd: 0, signedCents: 0n, kind };
        });
        waterfallBars(doc, bars, inner.x, inner.y, inner.w, inner.h);
        return;
      }
    }
    simpleBars(
      doc,
      labels.map((label, i) => ({ label, usd: totals[i] ?? 0, color: colors[i]! })),
      inner.x,
      inner.y,
      inner.w,
      inner.h,
    );
    return;
  }
  if (visual.mode === "pie") {
    pieChart(
      doc,
      visual.labels.map((label, i) => ({ label, value: visual.values[i] ?? 0, color: visual.colors[i] ?? seriesColor(i) })),
      inner.x,
      inner.y,
      inner.w,
      inner.h,
    );
    return;
  }
  if (visual.mode === "callout") {
    const fill =
      visual.tone === "fail" ? PACK_PALETTE.fail : visual.tone === "gold" ? PACK_PALETTE.gold : PACK_PALETTE.navy;
    const hero = compactHeroRect(inner, 245);
    doc.rect(hero.x, hero.y, hero.w, hero.h).fill(fill);
    doc.fillColor(PACK_PALETTE.cream).font("Times-Roman").fontSize(PACK_TYPE.pdf.calloutKicker).text(visual.kicker.toUpperCase(), hero.x + 22, hero.y + 22, {
      width: hero.w - 44,
    });
    doc.font("Times-Bold").fontSize(PACK_TYPE.pdf.calloutValue).text(visual.value, hero.x + 22, hero.y + 48, { width: hero.w - 44 });
    doc.font("Times-Roman").fontSize(PACK_TYPE.pdf.calloutDetail).text(visual.detail, hero.x + 22, hero.y + 118, { width: hero.w - 44 });
    return;
  }
  if (visual.mode === "status") {
    let y = inner.y;
    const rowH = Math.min(48, inner.h / Math.max(1, visual.items.length));
    for (const item of visual.items) {
      const tone =
        item.tone === "fail" ? PACK_PALETTE.fail : item.tone === "watch" ? PACK_PALETTE.gold : item.tone === "pass" ? PACK_PALETTE.navy : PACK_PALETTE.rule;
      doc.rect(inner.x, y, 6, rowH - 6).fill(tone);
      doc.fillColor(PACK_PALETTE.navy).font("Times-Bold").fontSize(12).text(item.label, inner.x + 16, y + 8, { width: inner.w * 0.32 });
      doc.fillColor(PACK_PALETTE.ink).font("Times-Roman").fontSize(12).text(item.value, inner.x + inner.w * 0.36, y + 8, {
        width: inner.w * 0.6,
      });
      y += rowH;
    }
    return;
  }
  let y = inner.y;
  const rowH = 18;
  doc.rect(inner.x, y, inner.w, rowH).fill(PACK_PALETTE.navy);
  visual.headers.forEach((h, i) => {
    doc.fillColor(PACK_PALETTE.cream).font("Times-Bold").fontSize(10).text(h, inner.x + 8 + i * (inner.w / visual.headers.length), y + 4, {
      width: inner.w / visual.headers.length - 10,
    });
  });
  y += rowH;
  visual.rows.forEach((row, ri) => {
    if (ri % 2 === 0) doc.rect(inner.x, y, inner.w, rowH).fill(PACK_PALETTE.cream);
    row.forEach((cell, i) => {
      doc.fillColor(PACK_PALETTE.ink).font("Times-Roman").fontSize(10).text(cell, inner.x + 8 + i * (inner.w / row.length), y + 3, {
        width: inner.w / row.length - 10,
      });
    });
    y += rowH;
  });
}

function drawCover(doc: PDFKit.PDFDocument, _pack: BuiltPack, slide: Extract<PackSlide, { kind: "cover" }>) {
  doc.rect(0, 0, W, H).fill(PACK_PALETTE.navy);
  doc.rect(0, 0, 12, H).fill(PACK_PALETTE.gold);
  doc.fillColor(PACK_PALETTE.gold).font("Times-Roman").fontSize(PACK_TYPE.pdf.coverKicker).text(RCP_NAME.toUpperCase(), M, 48, { width: 500 });
  doc.fillColor(PACK_PALETTE.cream).font("Times-Bold").fontSize(PACK_TYPE.pdf.coverTitle).text(slide.title, M, 78, { width: W - M * 2 });
  doc.fillColor(PACK_PALETTE.gold).font("Times-Italic").fontSize(PACK_TYPE.pdf.coverSubtitle).text(slide.subtitle, M, 126, { width: W - M * 2 });
  doc.rect(M, 154, 140, 4).fill(PACK_PALETTE.gold);
  doc.fillColor(PACK_PALETTE.cream).font("Times-Roman").fontSize(PACK_TYPE.pdf.coverThesis).text(slide.thesis, M, 172, { width: W - M * 2 });
  doc.rect(M, 230, 360, 140).fill(PACK_PALETTE.navyDeep);
  doc.fillColor(PACK_PALETTE.gold).font("Times-Roman").fontSize(PACK_TYPE.pdf.coverProofLabel).text(slide.proofLabel.toUpperCase(), M + 16, 244, { width: 328 });
  doc.fillColor(PACK_PALETTE.cream).font("Times-Bold").fontSize(PACK_TYPE.pdf.coverProof).text(slide.proofValue, M + 16, 270, { width: 328 });
  const chipW = 230;
  const chipH = 62;
  slide.bullets.forEach((b, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 430 + col * (chipW + 10);
    const y = 230 + row * (chipH + 12);
    doc.rect(x, y, chipW, chipH).fill(PACK_PALETTE.navyDeep);
    doc.fillColor(PACK_PALETTE.cream).font("Times-Roman").fontSize(PACK_TYPE.pdf.coverChip).text(b, x + 12, y + 16, { width: chipW - 24 });
  });
  doc.fillColor(PACK_PALETTE.gold).font("Times-Roman").fontSize(PACK_TYPE.pdf.footer).text(
    `${slide.audienceLabel}  ·  ${RCP_PRODUCT}  ·  ${RCP_CONFIDENTIAL}`,
    M,
    H - 40,
    { width: W - M * 2 },
  );
}

function drawKpis(doc: PDFKit.PDFDocument, slide: Extract<PackSlide, { kind: "kpis" }>) {
  const n = Math.max(1, slide.kpis.length);
  const twoRow = n >= 5;
  const tiles = kpiTileRects(n, {
    originX: M,
    originY: 78,
    usableW: W - M * 2,
    gap: 14,
    rowGap: 14,
    cardH: twoRow ? 186 : 224,
  });
  slide.kpis.forEach((k, i) => {
    const { x, y, w: cardW, h: cardH } = tiles[i]!;
    const footerH = cardH * 0.46;
    const creamH = cardH - footerH;
    doc.rect(x, y, cardW, cardH).fill(PACK_PALETTE.cream);
    doc.rect(x, y, cardW, 5).fill(PACK_PALETTE.gold);
    doc.fillColor(PACK_PALETTE.gold).font("Times-Roman").fontSize(PACK_TYPE.pdf.kpiLabel).text(k.label.toUpperCase(), x + 14, y + 14, {
      width: cardW - 28,
    });
    doc.fillColor(PACK_PALETTE.navy).font("Times-Bold").fontSize(PACK_TYPE.pdf.kpiValue).text(k.value, x + 14, y + creamH / 2 - 4, {
      width: cardW - 28,
    });
    doc.rect(x, y + creamH, cardW, footerH).fill(PACK_PALETTE.navy);
    doc.fillColor(PACK_PALETTE.gold).font("Times-Roman").fontSize(PACK_TYPE.pdf.kpiSoWhatKicker).text("SO WHAT", x + 14, y + creamH + 10, {
      width: cardW - 28,
    });
    doc.fillColor(PACK_PALETTE.cream).font("Times-Roman").fontSize(PACK_TYPE.pdf.kpiSoWhat).text(k.soWhat ?? k.hint, x + 14, y + creamH + 28, {
      width: cardW - 28,
      height: footerH - 40,
    });
  });
}

function drawThesis(doc: PDFKit.PDFDocument, slide: Extract<PackSlide, { kind: "thesis" }>) {
  doc.fillColor(PACK_PALETTE.navy).font("Times-Bold").fontSize(PACK_TYPE.pdf.thesisInsight).text(slide.insight, M, 72, { width: 540 });
  const bullets = slide.bullets.slice(0, 4);
  const cols = 2;
  const gap = 12;
  const gridW = 540;
  const cardW = (gridW - gap) / cols;
  const cardH = 128;
  bullets.forEach((b, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = M + col * (cardW + gap);
    const y = 168 + row * (cardH + gap);
    doc.rect(x, y, cardW, cardH).fill(PACK_PALETTE.cream);
    doc.rect(x, y, 5, cardH).fill(PACK_PALETTE.gold);
    doc.fillColor(PACK_PALETTE.ink).font("Times-Roman").fontSize(PACK_TYPE.pdf.thesisBullet).text(b, x + 16, y + 18, { width: cardW - 28 });
  });
  const proof = compactHeroRect({ x: W - M - 230, y: 72, w: 230, h: H - 72 - 40 }, 300);
  doc.rect(proof.x, proof.y, proof.w, proof.h).fill(PACK_PALETTE.navy);
  doc.fillColor(PACK_PALETTE.gold).font("Times-Roman").fontSize(PACK_TYPE.pdf.thesisProofLabel).text("PROOF", proof.x + 16, proof.y + 20, { width: proof.w - 32 });
  doc.fillColor(PACK_PALETTE.cream).font("Times-Bold").fontSize(PACK_TYPE.pdf.thesisProof).text(slide.proof, proof.x + 16, proof.y + 52, { width: proof.w - 32 });
}

function drawVisuals(doc: PDFKit.PDFDocument, pack: BuiltPack, slide: Extract<PackSlide, { kind: "visuals" }>) {
  const n = slide.visuals.length || 1;
  const gap = 22;
  const usable = W - M * 2;
  const colW = (usable - gap * (n - 1)) / n;
  const y = 76;
  const h = H - y - 40;
  slide.visuals.forEach((visual, i) => {
    const x = M + i * (colW + gap);
    drawRenderable(doc, pack, toRenderableVisual(pack, visual), { x, y, w: colW, h });
  });
}

function drawRisks(doc: PDFKit.PDFDocument, slide: Extract<PackSlide, { kind: "risks" }>) {
  const n = slide.items.length || 1;
  const gap = 14;
  const usable = W - M * 2;
  const cardW = (usable - gap * (n - 1)) / n;
  const y = 76;
  const cardH = 248;
  slide.items.forEach((item, i) => {
    const x = M + i * (cardW + gap);
    doc.rect(x, y, cardW, cardH).fill(PACK_PALETTE.cream);
    doc.rect(x, y, cardW, 5).fill(PACK_PALETTE.gold);
    doc.fillColor(PACK_PALETTE.navy).font("Times-Bold").fontSize(PACK_TYPE.pdf.riskHeading).text(item.heading, x + 14, y + 18, { width: cardW - 28 });
    doc.fillColor(PACK_PALETTE.ink).font("Times-Roman").fontSize(PACK_TYPE.pdf.riskBody).text(item.body, x + 14, y + 50, { width: cardW - 28 });
    doc.rect(x, y + cardH - 52, cardW, 52).fill(PACK_PALETTE.navy);
    doc.fillColor(PACK_PALETTE.cream).font("Times-Bold").fontSize(PACK_TYPE.pdf.riskBody).text(item.proof, x + 14, y + cardH - 36, { width: cardW - 28 });
  });
  doc.rect(M, 344, W - M * 2, 152).fill(PACK_PALETTE.navy);
  doc.fillColor(PACK_PALETTE.gold).font("Times-Roman").fontSize(PACK_TYPE.pdf.askKicker).text("THE ASK", M + 18, 360, { width: W - M * 2 - 36 });
  doc.fillColor(PACK_PALETTE.cream).font("Times-Bold").fontSize(PACK_TYPE.pdf.ask).text(slide.ask, M + 18, 386, { width: W - M * 2 - 36 });
}

function drawAppendix(doc: PDFKit.PDFDocument, slide: Extract<PackSlide, { kind: "appendix" }>) {
  const leftW = 460;
  doc.rect(M, 70, leftW, H - 70 - 36).fill(PACK_PALETTE.cream);
  doc.fillColor(PACK_PALETTE.navy).font("Times-Bold").fontSize(PACK_TYPE.pdf.appendixTitle).text("Disclosures", M + 14, 82, { width: leftW - 28 });
  let y = 108;
  for (const bullet of slide.bullets) {
    doc.fillColor(PACK_PALETTE.ink).font("Times-Roman").fontSize(PACK_TYPE.pdf.appendixBody).text(bullet, M + 14, y, { width: leftW - 28 });
    y = doc.y + 10;
    if (y > H - 52) break;
  }
  const rightX = 520;
  const rightW = W - M - rightX;
  doc.rect(rightX, 70, rightW, H - 70 - 36).fill(PACK_PALETTE.cream);
  doc.fillColor(PACK_PALETTE.navy).font("Times-Bold").fontSize(PACK_TYPE.pdf.appendixTitle).text("Remaining KPIs", rightX + 14, 82, { width: rightW - 28 });
  let ky = 108;
  for (const k of slide.extraKpis.slice(0, 10)) {
    doc.fillColor(PACK_PALETTE.muted).font("Times-Roman").fontSize(PACK_TYPE.pdf.appendixBody).text(k.label, rightX + 14, ky, { width: 170 });
    doc.fillColor(PACK_PALETTE.navy).font("Times-Bold").fontSize(PACK_TYPE.pdf.appendixBody).text(k.value, rightX + 186, ky, { width: rightW - 210 });
    ky += 22;
  }
  for (const c of slide.callouts.slice(0, 2)) {
    ky += 10;
    doc.fillColor(PACK_PALETTE.navy).font("Times-Bold").fontSize(12).text(c.title, rightX + 14, ky, { width: rightW - 28 });
    ky += 18;
    doc.fillColor(PACK_PALETTE.ink).font("Times-Italic").fontSize(PACK_TYPE.pdf.appendixBody).text(c.soWhat, rightX + 14, ky, { width: rightW - 28 });
    ky = doc.y + 12;
  }
}

function renderSlide(doc: PDFKit.PDFDocument, pack: BuiltPack, slide: PackSlide) {
  if (slide.kind === "cover") {
    drawCover(doc, pack, slide);
    return;
  }
  drawChrome(doc, pack, slide.title);
  if (slide.kind === "kpis") drawKpis(doc, slide);
  else if (slide.kind === "thesis") drawThesis(doc, slide);
  else if (slide.kind === "visuals") drawVisuals(doc, pack, slide);
  else if (slide.kind === "risks") drawRisks(doc, slide);
  else drawAppendix(doc, slide);
}

export async function renderPdfPack(pack: BuiltPack): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [W, H],
      margin: M,
      bufferPages: true,
      info: { Title: pack.generatedLabel, Author: RCP_NAME },
    });
    const nativeAddPage = doc.addPage.bind(doc);
    let allowAddPage = true;
    doc.addPage = ((options?: PDFKit.PDFDocumentOptions) => {
      if (!allowAddPage) return doc;
      return nativeAddPage(options);
    }) as typeof doc.addPage;

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const total = pack.slides.length;
    pack.slides.forEach((slide, i) => {
      if (i > 0) {
        allowAddPage = true;
        doc.addPage({ size: [W, H], margin: M });
      }
      allowAddPage = false;
      renderSlide(doc, pack, slide);
      if (slide.kind !== "cover") drawFooter(doc, pack, i + 1, total);
    });
    doc.end();
  });
}
