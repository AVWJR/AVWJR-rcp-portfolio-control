import PDFDocument from "pdfkit";
import { RCP_CONFIDENTIAL, RCP_NAME, RCP_PRODUCT } from "@rcp/rcp-brand";
import type { BuiltPack, PackSlide, WaterfallBar } from "@rcp/reporting";
import { PACK_MARGIN_PT, PACK_PALETTE, PACK_SLIDE_PT, seriesColor } from "./pack-theme";
import { toRenderableVisual, type RenderableVisual } from "./pack-visuals";

const W = PACK_SLIDE_PT.w;
const H = PACK_SLIDE_PT.h;
const M = PACK_MARGIN_PT;

function drawFooter(doc: PDFKit.PDFDocument, pack: BuiltPack, page: number, total: number) {
  doc.rect(0, H - 22, W, 22).fill(PACK_PALETTE.navy);
  doc.fillColor(PACK_PALETTE.gold).font("Times-Roman").fontSize(8);
  doc.text(`${RCP_NAME}  ·  ${pack.entityCode}  ·  ${pack.period}  ·  ${RCP_CONFIDENTIAL}`, M, H - 16, {
    width: W - M * 2 - 50,
  });
  doc.text(`${page} / ${total}`, W - M - 48, H - 16, { width: 48, align: "right" });
}

function drawChrome(doc: PDFKit.PDFDocument, pack: BuiltPack, title: string) {
  doc.rect(0, 0, 8, H).fill(PACK_PALETTE.gold);
  doc.rect(0, 0, W, 30).fill(PACK_PALETTE.navy);
  doc.fillColor(PACK_PALETTE.gold).font("Times-Bold").fontSize(9).text(`${RCP_NAME}  ·  ${pack.meta.title}`, M, 10, {
    width: W - M * 2,
  });
  doc.fillColor(PACK_PALETTE.navy).font("Times-Bold").fontSize(16).text(title, M, 40, { width: W - M * 2 });
}

function simpleBars(
  doc: PDFKit.PDFDocument,
  items: { label: string; usd: number; color: string }[],
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.usd)));
  const gap = 8;
  const barW = Math.max(10, (w - gap * items.length) / items.length);
  items.forEach((item, i) => {
    const bx = x + i * (barW + gap);
    const bh = (Math.abs(item.usd) / max) * (h - 28);
    doc.rect(bx, y + (h - 28) - bh, barW, Math.max(2, bh)).fill(item.color);
    doc.fillColor(PACK_PALETTE.ink).font("Times-Roman").fontSize(7).text(item.label, bx - 4, y + h - 22, {
      width: barW + 8,
      align: "center",
    });
  });
}

function waterfallBars(doc: PDFKit.PDFDocument, bars: WaterfallBar[], x: number, y: number, w: number, h: number) {
  const max = Math.max(1, ...bars.map((b) => b.baseUsd + b.valueUsd));
  const gap = 6;
  const barW = Math.max(8, (w - gap * bars.length) / bars.length);
  bars.forEach((bar, i) => {
    const bx = x + i * (barW + gap);
    const color = bar.kind === "total" ? PACK_PALETTE.navy : bar.kind === "outflow" ? PACK_PALETTE.outflow : PACK_PALETTE.inflow;
    const bh = (bar.valueUsd / max) * (h - 28);
    const baseH = (bar.baseUsd / max) * (h - 28);
    const by = y + (h - 28) - baseH - bh;
    doc.rect(bx, by, barW, Math.max(2, bh)).fill(color);
    doc.fillColor(PACK_PALETTE.ink).fontSize(6).text(bar.label, bx - 4, y + h - 22, { width: barW + 8, align: "center" });
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
  let ly = y + 8;
  slices.forEach((slice) => {
    doc.rect(x + w * 0.62, ly, 8, 8).fill(slice.color);
    doc.fillColor(PACK_PALETTE.ink).font("Times-Roman").fontSize(8).text(slice.label, x + w * 0.62 + 12, ly - 1, {
      width: w * 0.35,
    });
    ly += 14;
  });
}

function drawRenderable(doc: PDFKit.PDFDocument, pack: BuiltPack, visual: RenderableVisual, box: { x: number; y: number; w: number; h: number }) {
  doc.fillColor(PACK_PALETTE.navy).font("Times-Bold").fontSize(11).text(visual.title, box.x, box.y, { width: box.w });
  doc.fillColor(PACK_PALETTE.ink).font("Times-Italic").fontSize(9).text(visual.soWhat, box.x, box.y + 16, { width: box.w });
  const inner = { x: box.x, y: box.y + 42, w: box.w, h: box.h - 42 };

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
    doc.rect(inner.x, inner.y, inner.w, inner.h).fill(fill);
    doc.fillColor(PACK_PALETTE.cream).font("Times-Roman").fontSize(10).text(visual.kicker.toUpperCase(), inner.x + 16, inner.y + 16, {
      width: inner.w - 32,
    });
    doc.font("Times-Bold").fontSize(28).text(visual.value, inner.x + 16, inner.y + 40, { width: inner.w - 32 });
    doc.font("Times-Roman").fontSize(10).text(visual.detail, inner.x + 16, inner.y + 90, { width: inner.w - 32 });
    return;
  }
  if (visual.mode === "status") {
    let y = inner.y;
    const rowH = inner.h / Math.max(1, visual.items.length);
    for (const item of visual.items) {
      const tone =
        item.tone === "fail" ? PACK_PALETTE.fail : item.tone === "watch" ? PACK_PALETTE.gold : item.tone === "pass" ? PACK_PALETTE.navy : PACK_PALETTE.rule;
      doc.rect(inner.x, y, 6, rowH - 4).fill(tone);
      doc.fillColor(PACK_PALETTE.navy).font("Times-Bold").fontSize(9).text(item.label, inner.x + 14, y + 4, { width: inner.w * 0.32 });
      doc.fillColor(PACK_PALETTE.ink).font("Times-Roman").fontSize(9).text(item.value, inner.x + inner.w * 0.36, y + 4, {
        width: inner.w * 0.6,
      });
      y += rowH;
    }
    return;
  }
  let y = inner.y;
  doc.rect(inner.x, y, inner.w, 16).fill(PACK_PALETTE.navy);
  visual.headers.forEach((h, i) => {
    doc.fillColor(PACK_PALETTE.cream).font("Times-Bold").fontSize(8).text(h, inner.x + 6 + i * (inner.w / visual.headers.length), y + 3, {
      width: inner.w / visual.headers.length - 8,
    });
  });
  y += 16;
  visual.rows.forEach((row, ri) => {
    if (ri % 2 === 0) doc.rect(inner.x, y, inner.w, 14).fill(PACK_PALETTE.cream);
    row.forEach((cell, i) => {
      doc.fillColor(PACK_PALETTE.ink).font("Times-Roman").fontSize(8).text(cell, inner.x + 6 + i * (inner.w / row.length), y + 2, {
        width: inner.w / row.length - 8,
      });
    });
    y += 14;
  });
}

function drawCover(doc: PDFKit.PDFDocument, _pack: BuiltPack, slide: Extract<PackSlide, { kind: "cover" }>) {
  doc.rect(0, 0, W, H).fill(PACK_PALETTE.navy);
  doc.rect(0, 0, 12, H).fill(PACK_PALETTE.gold);
  doc.fillColor(PACK_PALETTE.gold).font("Times-Roman").fontSize(10).text(RCP_NAME.toUpperCase(), M, 48, { width: 500 });
  doc.fillColor(PACK_PALETTE.cream).font("Times-Bold").fontSize(28).text(slide.title, M, 78, { width: W - M * 2 });
  doc.fillColor(PACK_PALETTE.gold).font("Times-Italic").fontSize(13).text(slide.subtitle, M, 122, { width: W - M * 2 });
  doc.rect(M, 148, 140, 4).fill(PACK_PALETTE.gold);
  doc.fillColor(PACK_PALETTE.cream).font("Times-Roman").fontSize(14).text(slide.thesis, M, 168, { width: W - M * 2 });
  doc.rect(M, 230, 360, 140).fill(PACK_PALETTE.navyDeep);
  doc.fillColor(PACK_PALETTE.gold).font("Times-Roman").fontSize(9).text(slide.proofLabel.toUpperCase(), M + 16, 244, { width: 328 });
  doc.fillColor(PACK_PALETTE.cream).font("Times-Bold").fontSize(24).text(slide.proofValue, M + 16, 270, { width: 328 });
  const chipW = 230;
  const chipH = 62;
  slide.bullets.forEach((b, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 430 + col * (chipW + 10);
    const y = 230 + row * (chipH + 12);
    doc.rect(x, y, chipW, chipH).fill(PACK_PALETTE.navyDeep);
    doc.fillColor(PACK_PALETTE.cream).font("Times-Roman").fontSize(10).text(b, x + 12, y + 18, { width: chipW - 24 });
  });
  doc.fillColor(PACK_PALETTE.gold).font("Times-Roman").fontSize(10).text(
    `${slide.audienceLabel}  ·  ${RCP_PRODUCT}  ·  ${RCP_CONFIDENTIAL}`,
    M,
    H - 40,
    { width: W - M * 2 },
  );
}

function drawKpis(doc: PDFKit.PDFDocument, slide: Extract<PackSlide, { kind: "kpis" }>) {
  const n = Math.max(1, slide.kpis.length);
  const gap = 10;
  const usable = W - M * 2;
  const cardW = (usable - gap * (n - 1)) / n;
  const y = 70;
  const cardH = H - y - 36;
  const footerH = 150;
  slide.kpis.forEach((k, i) => {
    const x = M + i * (cardW + gap);
    doc.rect(x, y, cardW, cardH).fill(PACK_PALETTE.cream);
    doc.rect(x, y, cardW, 6).fill(PACK_PALETTE.gold);
    doc.fillColor(PACK_PALETTE.gold).font("Times-Roman").fontSize(8).text(k.label.toUpperCase(), x + 10, y + 16, { width: cardW - 20 });
    doc.fillColor(PACK_PALETTE.navy).font("Times-Bold").fontSize(n > 4 ? 14 : 16).text(k.value, x + 10, y + 70, { width: cardW - 20 });
    doc.rect(x, y + cardH - footerH, cardW, footerH).fill(PACK_PALETTE.navy);
    doc.fillColor(PACK_PALETTE.gold).font("Times-Roman").fontSize(7).text("SO WHAT", x + 10, y + cardH - footerH + 12, { width: cardW - 20 });
    doc.fillColor(PACK_PALETTE.cream).font("Times-Roman").fontSize(8).text(k.soWhat ?? k.hint, x + 10, y + cardH - footerH + 28, {
      width: cardW - 20,
    });
  });
}

function drawThesis(doc: PDFKit.PDFDocument, slide: Extract<PackSlide, { kind: "thesis" }>) {
  doc.fillColor(PACK_PALETTE.navy).font("Times-Bold").fontSize(16).text(slide.insight, M, 68, { width: 540 });
  const bullets = slide.bullets.slice(0, 4);
  const cols = 2;
  const rows = Math.max(1, Math.ceil(bullets.length / cols));
  const gap = 10;
  const gridW = 540;
  const gridH = 300;
  const cardW = (gridW - gap) / cols;
  const cardH = (gridH - gap * (rows - 1)) / rows;
  bullets.forEach((b, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = M + col * (cardW + gap);
    const y = 150 + row * (cardH + gap);
    doc.rect(x, y, cardW, cardH).fill(PACK_PALETTE.cream);
    doc.rect(x, y, 5, cardH).fill(PACK_PALETTE.gold);
    doc.fillColor(PACK_PALETTE.ink).font("Times-Roman").fontSize(11).text(b, x + 16, y + 16, { width: cardW - 28 });
  });
  doc.rect(W - M - 230, 68, 230, H - 68 - 36).fill(PACK_PALETTE.navy);
  doc.fillColor(PACK_PALETTE.gold).font("Times-Roman").fontSize(9).text("PROOF", W - M - 214, 86, { width: 198 });
  doc.fillColor(PACK_PALETTE.cream).font("Times-Bold").fontSize(16).text(slide.proof, W - M - 214, 140, { width: 198 });
}

function drawVisuals(doc: PDFKit.PDFDocument, pack: BuiltPack, slide: Extract<PackSlide, { kind: "visuals" }>) {
  const n = slide.visuals.length || 1;
  const gap = 16;
  const usable = W - M * 2;
  const colW = (usable - gap * (n - 1)) / n;
  const y = 68;
  const h = H - y - 36;
  slide.visuals.forEach((visual, i) => {
    const x = M + i * (colW + gap);
    drawRenderable(doc, pack, toRenderableVisual(pack, visual), { x, y, w: colW, h });
  });
}

function drawRisks(doc: PDFKit.PDFDocument, slide: Extract<PackSlide, { kind: "risks" }>) {
  const n = slide.items.length || 1;
  const gap = 12;
  const usable = W - M * 2;
  const cardW = (usable - gap * (n - 1)) / n;
  const y = 70;
  const cardH = 250;
  slide.items.forEach((item, i) => {
    const x = M + i * (cardW + gap);
    doc.rect(x, y, cardW, cardH).fill(PACK_PALETTE.cream);
    doc.rect(x, y, cardW, 6).fill(PACK_PALETTE.gold);
    doc.fillColor(PACK_PALETTE.navy).font("Times-Bold").fontSize(13).text(item.heading, x + 12, y + 18, { width: cardW - 24 });
    doc.fillColor(PACK_PALETTE.ink).font("Times-Roman").fontSize(10).text(item.body, x + 12, y + 48, { width: cardW - 24 });
    doc.rect(x, y + cardH - 48, cardW, 48).fill(PACK_PALETTE.navy);
    doc.fillColor(PACK_PALETTE.cream).font("Times-Bold").fontSize(11).text(item.proof, x + 12, y + cardH - 34, { width: cardW - 24 });
  });
  doc.rect(M, 338, W - M * 2, 164).fill(PACK_PALETTE.navy);
  doc.fillColor(PACK_PALETTE.gold).font("Times-Roman").fontSize(9).text("THE ASK", M + 16, 352, { width: W - M * 2 - 32 });
  doc.fillColor(PACK_PALETTE.cream).font("Times-Bold").fontSize(13).text(slide.ask, M + 16, 376, { width: W - M * 2 - 32 });
}

function drawAppendix(doc: PDFKit.PDFDocument, slide: Extract<PackSlide, { kind: "appendix" }>) {
  const leftW = 460;
  doc.rect(M, 64, leftW, H - 64 - 32).fill(PACK_PALETTE.cream);
  doc.fillColor(PACK_PALETTE.navy).font("Times-Bold").fontSize(12).text("Disclosures", M + 12, 74, { width: leftW - 24 });
  let y = 96;
  for (const bullet of slide.bullets) {
    doc.fillColor(PACK_PALETTE.ink).font("Times-Roman").fontSize(8).text(bullet, M + 12, y, { width: leftW - 24 });
    y = doc.y + 8;
    if (y > H - 48) break;
  }
  const rightX = 520;
  const rightW = W - M - rightX;
  doc.rect(rightX, 64, rightW, H - 64 - 32).fill(PACK_PALETTE.cream);
  doc.fillColor(PACK_PALETTE.navy).font("Times-Bold").fontSize(12).text("Remaining KPIs", rightX + 12, 74, { width: rightW - 24 });
  let ky = 96;
  for (const k of slide.extraKpis.slice(0, 10)) {
    doc.fillColor(PACK_PALETTE.muted).font("Times-Roman").fontSize(8).text(k.label, rightX + 12, ky, { width: 170 });
    doc.fillColor(PACK_PALETTE.navy).font("Times-Bold").fontSize(8).text(k.value, rightX + 182, ky, { width: rightW - 200 });
    ky += 18;
  }
  for (const c of slide.callouts.slice(0, 2)) {
    ky += 8;
    doc.fillColor(PACK_PALETTE.navy).font("Times-Bold").fontSize(10).text(c.title, rightX + 12, ky, { width: rightW - 24 });
    ky += 14;
    doc.fillColor(PACK_PALETTE.ink).font("Times-Italic").fontSize(8).text(c.soWhat, rightX + 12, ky, { width: rightW - 24 });
    ky = doc.y + 10;
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
