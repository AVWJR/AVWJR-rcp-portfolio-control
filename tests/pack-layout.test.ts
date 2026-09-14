import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compactHeroRect, kpiTileRects, renderPdfPack, renderPptxPack, PACK_SLIDE_IN, PACK_TYPE } from "@rcp/documents";
import { LIVE_DECK_MAX_SLIDES, buildPack } from "@rcp/reporting";
import { describe, expect, it } from "vitest";
import { fixtureSnapshot } from "./fixtures/period-snapshot";

function pptxEntry(buf: Buffer, entry: string): string {
  const dir = mkdtempSync(join(tmpdir(), "rcp-pptx-"));
  const file = join(dir, "pack.pptx");
  writeFileSync(file, buf);
  return execFileSync(
    "python3",
    ["-c", "import zipfile,sys; print(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]).decode('utf-8'))", file, entry],
    { encoding: "utf8" },
  );
}

function pptxSlideCount(buf: Buffer): number {
  const xml = pptxEntry(buf, "ppt/presentation.xml");
  return (xml.match(/<p:sldId /g) ?? []).length;
}

describe("LP Monthly pack layout constraints", () => {
  it("emits 16:9 PPTX and matching PDF with a capped live deck", async () => {
    const pack = buildPack(fixtureSnapshot(), "monthly_investor");
    expect(pack.slides.length).toBeLessThanOrEqual(LIVE_DECK_MAX_SLIDES);
    expect(pack.slides.at(-1)?.kind).toBe("appendix");
    expect(pack.slides.filter((s) => s.kind === "kpis")).toHaveLength(1);

    const pptx = await renderPptxPack(pack);
    const presentation = pptxEntry(pptx, "ppt/presentation.xml");
    const size = presentation.match(/sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
    expect(size).toBeTruthy();
    const cx = Number(size![1]);
    const cy = Number(size![2]);
    expect(cx / cy).toBeCloseTo(16 / 9, 2);
    expect(PACK_SLIDE_IN.w / PACK_SLIDE_IN.h).toBeCloseTo(16 / 9, 2);
    expect(pptxSlideCount(pptx)).toBe(pack.slides.length);

    const pdf = await renderPdfPack(pack);
    const latin1 = pdf.toString("latin1");
    expect(latin1.startsWith("%PDF")).toBe(true);
    const box = latin1.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
    expect(box).toBeTruthy();
    const width = Number(box![1]);
    const height = Number(box![2]);
    expect(width / height).toBeCloseTo(16 / 9, 2);
    expect(height).toBeLessThan(700);
    const pageBoxes = latin1.match(/\/MediaBox/g) ?? [];
    expect(pageBoxes.length).toBe(pack.slides.length);
  });

  it("does not emit empty trailing slides beyond the appendix", async () => {
    const pack = buildPack(fixtureSnapshot(), "monthly_investor");
    const pptx = await renderPptxPack(pack);
    expect(pptxSlideCount(pptx)).toBe(pack.slides.length);
    expect(pack.slides.at(-1)?.kind).toBe("appendix");
    const lastCoverOrChromeOnly = pack.slides.slice(pack.slides.findIndex((s) => s.kind === "appendix") + 1);
    expect(lastCoverOrChromeOnly).toHaveLength(0);
  });
});

describe("pack type scale and compact tiles", () => {
  it("keeps KPI values and so-what in a boardroom-readable range", () => {
    expect(PACK_TYPE.pptx.kpiValue).toBeGreaterThanOrEqual(26);
    expect(PACK_TYPE.pptx.kpiSoWhat).toBeGreaterThanOrEqual(14);
    expect(PACK_TYPE.pptx.chartAxis).toBeGreaterThanOrEqual(13);
    expect(PACK_TYPE.pptx.calloutValue).toBeGreaterThanOrEqual(48);
    expect(PACK_TYPE.pptx.chromeTitle).toBeGreaterThanOrEqual(22);
    expect(PACK_TYPE.pdf.kpiValue).toBeGreaterThanOrEqual(22);
    expect(PACK_TYPE.pdf.kpiSoWhat).toBeGreaterThanOrEqual(12);
    expect(PACK_TYPE.pdf.chartLabel).toBeGreaterThanOrEqual(12);
    expect(PACK_TYPE.pdf.calloutValue).toBeGreaterThanOrEqual(40);
  });

  it("lays five KPI tiles in a compact 3+2 grid instead of full-height columns", () => {
    const tiles = kpiTileRects(5, {
      originX: 0.5,
      originY: 1.08,
      usableW: 12.333,
      gap: 0.18,
      rowGap: 0.2,
      cardH: 2.62,
    });
    expect(tiles).toHaveLength(5);
    expect(tiles[0]!.y).toBeCloseTo(1.08, 5);
    expect(tiles[3]!.y).toBeCloseTo(1.08 + 2.62 + 0.2, 5);
    expect(tiles[0]!.w).toBeCloseTo(tiles[3]!.w, 5);
    expect(tiles[3]!.x).toBeGreaterThan(tiles[0]!.x);
    const row1Right = tiles[2]!.x + tiles[2]!.w;
    const row2Right = tiles[4]!.x + tiles[4]!.w;
    expect(tiles[3]!.x - tiles[0]!.x).toBeCloseTo(row1Right - row2Right, 5);
    const gridH = tiles[3]!.y + tiles[3]!.h - tiles[0]!.y;
    expect(gridH).toBeLessThan(5.6);
    expect(tiles[0]!.h).toBeLessThan(3.2);
  });

  it("centers a compact hero inside a tall column instead of filling it", () => {
    const inner = { x: 0.5, y: 1.1, w: 6.0, h: 5.5 };
    const hero = compactHeroRect(inner, 3.35);
    expect(hero.h).toBeCloseTo(3.35, 5);
    expect(hero.y).toBeGreaterThan(inner.y);
    expect(hero.y + hero.h).toBeLessThan(inner.y + inner.h);
    expect(hero.w).toBe(inner.w);
  });
});
