import { execFileSync } from "node:child_process";
import { inflateSync } from "node:zlib";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import { dollars } from "@rcp/ledger";
import { renderPdfPack, renderPptxPack } from "@rcp/documents";
import { buildChartSuite, buildPack, emptyDistributionActuals, type BuiltPack, type DistributionActuals } from "@rcp/reporting";
import { describe, expect, it } from "vitest";
import { fixtureSnapshot } from "./fixtures/period-snapshot";

function pdfContents(buf: Buffer): string {
  const src = buf.toString("latin1");
  const parts = [src];
  for (const match of src.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const raw = Buffer.from(match[1]!, "latin1");
    try {
      parts.push(inflateSync(raw).toString("latin1"));
    } catch {
      parts.push(raw.toString("latin1"));
    }
  }
  return parts.join("\n");
}

/** One PDFKit text showing. Kerning chunks inside a single TJ stay one label. */
function pdfTextRuns(buf: Buffer): string[] {
  const src = pdfContents(buf);
  const runs: string[] = [];
  const arrays = src.matchAll(/\[([\s\S]*?)\]\s*TJ/g);
  for (const match of arrays) {
    runs.push(decodePdfChunks(match[1]!));
  }
  for (const match of src.matchAll(/\((?:\\[()\\nrt]|[^\\)])*\)\s*Tj/g)) {
    runs.push(decodePdfChunks(match[0]));
  }
  return runs.filter((run) => run.length > 0);
}

function decodePdfChunks(body: string): string {
  let out = "";
  for (const match of body.matchAll(/<([0-9A-Fa-f]+)>|\((?:\\[()\\nrt]|[^\\)])*\)/g)) {
    if (match[1]) {
      const hex = match[1];
      for (let i = 0; i + 1 < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    } else {
      out += match[0].slice(1, -1).replace(/\\([()\\])/g, "$1");
    }
  }
  return out;
}

function timesWidth(text: string, size: number): number {
  const doc = new PDFDocument({ size: [200, 200] });
  doc.font("Times-Roman").fontSize(size);
  return doc.widthOfString(text);
}

function pptxXml(buf: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), "rcp-dist-pptx-"));
  const file = join(dir, "pack.pptx");
  writeFileSync(file, buf);
  return execFileSync(
    "python3",
    [
      "-c",
      "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print('\\n'.join(z.read(n).decode('utf-8','replace') for n in z.namelist() if n.endswith('.xml')))",
      file,
    ],
    { encoding: "utf8", maxBuffer: 20_000_000 },
  );
}

function partyActuals(points: DistributionActuals["points"]): DistributionActuals {
  const last = points.at(-1);
  return {
    ...emptyDistributionActuals(),
    hasEvents: points.length > 0,
    position: "PROMOTE",
    capitalContributedCents: dollars(3_000_000),
    capitalReturnedCents: dollars(3_000_000),
    unreturnedCapitalCents: 0n,
    prefAccruedCents: last?.accruedCents ?? 0n,
    prefPaidCents: last?.paidCents ?? 0n,
    prefUnpaidCents: 0n,
    cumulativeLpCents: last?.lpCents ?? 0n,
    cumulativeRcpCents: last?.rcpCents ?? 0n,
    cumulativeCoGpCents: last?.coGpCents ?? 0n,
    points,
  };
}

const DISTRIBUTED_POINTS: DistributionActuals["points"] = [
  {
    period: "2025-11",
    accruedCents: dollars(10_000),
    paidCents: dollars(4_000),
    unpaidCents: dollars(6_000),
    lpCents: dollars(40_000),
    rcpCents: dollars(10_000),
    coGpCents: dollars(2_000),
  },
  {
    period: "2026-08",
    accruedCents: dollars(24_000),
    paidCents: dollars(24_000),
    unpaidCents: 0n,
    lpCents: dollars(120_000),
    rcpCents: dollars(30_000),
    coGpCents: dollars(8_000),
  },
];

/** One-visual page so the party chart is the only bar chart on the slide. */
function partyChartPack(snap: ReturnType<typeof fixtureSnapshot>): BuiltPack {
  const pack = buildPack(snap, "monthly_investor");
  const visual = pack.slides
    .flatMap((slide) => (slide.kind === "visuals" ? slide.visuals : []))
    .find((item) => item.chartId === "dist_by_party");
  if (!visual) throw new Error("monthly investor pack is missing Cumulative distributions by party");
  return {
    ...pack,
    slides: [{ kind: "visuals", title: "Cumulative distributions", visuals: [visual] }],
  };
}

describe("distribution pack charts", () => {
  it("keeps month labels whole, splits Deal LPs, RCP, and Co-GP, and captions unpaid bars", async () => {
    const snap = fixtureSnapshot({ distributionActuals: partyActuals(DISTRIBUTED_POINTS) });
    const suite = buildChartSuite(snap);
    expect(suite.distribution.parties.points.map((point) => point.period)).toEqual(["Nov 25", "Aug 26"]);
    expect(suite.distribution.parties.footnote).toBe(
      "Deal LPs have received $120,000.00; RCP has received $30,000.00; Co-GP has received $8,000.00.",
    );
    expect(suite.distribution.pref.footnote).toBe(
      "Preferred return accrued so far has been paid. The unpaid bars are the balance still owed.",
    );
    expect(suite.distribution.pref.footnote).not.toContain("unpaid line");
    expect(suite.distribution.parties.footnote).not.toContain("unpaid line");

    const pack = buildPack(snap, "monthly_investor");
    const party = pack.slides
      .flatMap((slide) => (slide.kind === "visuals" ? slide.visuals : []))
      .find((item) => item.chartId === "dist_by_party");
    const pref = pack.slides
      .flatMap((slide) => (slide.kind === "visuals" ? slide.visuals : []))
      .find((item) => item.chartId === "dist_pref_over_time");
    expect(party?.soWhat).toContain("Co-GP has received $8,000");
    expect(pref?.soWhat).toContain("unpaid bars");
    expect(pref?.soWhat).not.toContain("unpaid line");

    const pdf = await renderPdfPack(pack);
    const runs = pdfTextRuns(pdf);
    const joined = runs.join("\n");
    expect(runs).toContain("Nov 25");
    expect(runs).toContain("Aug 26");
    expect(runs).toContain("Deal LPs");
    expect(runs).toContain("RCP");
    expect(runs).toContain("Co-GP");
    expect(runs.some((text) => text === "Au" || text === "No" || text.includes("Au g") || text.includes("No v"))).toBe(false);
    const flat = joined.replace(/\n/g, "");
    expect(flat).toContain("unpaid bars");
    expect(flat).not.toContain("unpaid line");
    expect(flat).toContain("Co-GP has received");

    const xml = pptxXml(await renderPptxPack(pack));
    expect(xml).toContain("Nov 25");
    expect(xml).toContain("Aug 26");
    expect(xml).toContain("Deal LPs");
    expect(xml).toContain("Co-GP");
    expect(xml).toContain("Co-GP has received");
    expect(xml).toContain("unpaid bars");
    expect(xml).not.toContain("unpaid line");
    expect(xml).toContain("<c:legend");
    expect(xml).toMatch(/sz="1000"/);
    expect(xml).toContain("Calibri");
  });

  it("lines the Start bar up with its label when no distributions have been posted", async () => {
    const snap = fixtureSnapshot();
    const suite = buildChartSuite(snap);
    expect(suite.distribution.parties.points.map((point) => point.period)).toEqual(["Start"]);
    expect(suite.distribution.parties.footnote).toContain("Co-GP has received");

    const pdf = await renderPdfPack(partyChartPack(snap));
    const runs = pdfTextRuns(pdf);
    expect(runs).toContain("Start");
    expect(runs).toContain("Deal LPs");
    expect(runs).toContain("RCP");
    expect(runs).toContain("Co-GP");

    const src = pdfContents(pdf);
    const startAt = src.indexOf("<5374617274>");
    expect(startAt).toBeGreaterThan(0);
    const placed = [...src.slice(Math.max(0, startAt - 220), startAt).matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm/g)].at(-1);
    expect(placed).toBeTruthy();
    const textX = Number(placed![1]);
    const rects = [...src.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re/g)].map((match) => ({
      x: Number(match[1]),
      y: Number(match[2]),
      w: Number(match[3]),
      h: Number(match[4]),
    }));
    const bar = rects.find((rect) => rect.w >= 36 && rect.w <= 80 && rect.h >= 1.5 && rect.h <= 8);
    expect(bar).toBeTruthy();
    const labelCenter = textX + timesWidth("Start", 12) / 2;
    const barCenter = bar!.x + bar!.w / 2;
    expect(Math.abs(labelCenter - barCenter)).toBeLessThan(1);
    expect(bar!.w).toBeLessThan(80);
  });
});
