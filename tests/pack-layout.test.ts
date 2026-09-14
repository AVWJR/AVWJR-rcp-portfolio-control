import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderPdfPack, renderPptxPack, PACK_SLIDE_IN } from "@rcp/documents";
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
