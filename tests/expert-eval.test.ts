import { readFileSync } from "node:fs";
import path from "node:path";
import { answerOffline, type OfflineBundle } from "@/lib/expert/offline-coach";
import { findHowTos } from "@/lib/expert/howtos";
import { describePage, readExpertContext } from "@/lib/expert/nav";
import { buildSystemForTurn } from "@/lib/expert/snapshot";
import { describe, expect, it } from "vitest";

type EvalItem = {
  id: string;
  feature: string;
  route: string;
  entity: string;
  period: string;
  question: string;
  must_include: string[];
  must_not_include: string[];
};

const emptyBundle: OfflineBundle = {
  entity: { ok: false, error: "skip" },
  period: { ok: false, error: "skip" },
  completeness: { ok: false, error: "skip" },
  anomalies: { ok: false, error: "skip" },
  kpis: { ok: false, error: "skip" },
};

const items = JSON.parse(readFileSync(path.join(process.cwd(), "tests/fixtures/expert-eval.json"), "utf8")) as EvalItem[];

function normalize(text: string): string {
  return text.toLowerCase().replace(/[`*]/g, "").replace(/\s+/g, " ").trim();
}

function howToText(question: string, route: string): string {
  const hits = findHowTos(question, route, 3);
  const parts = [question];
  for (const entry of hits) {
    parts.push(entry.navPath, ...entry.steps, ...entry.facts);
    for (const row of entry.troubleshooting) parts.push(row.symptom, row.cause, row.fix);
  }
  parts.push(...describePage(route).hints);
  return normalize(parts.join("\n"));
}

function misses(haystack: string, patterns: string[]): string[] {
  return patterns.filter((pattern) => !new RegExp(pattern, "i").test(haystack));
}

function hits(haystack: string, patterns: string[]): string[] {
  return patterns.filter((pattern) => new RegExp(pattern, "i").test(haystack));
}

describe("Expert offline eval set", () => {
  it("loads the 45-question set", () => {
    expect(items).toHaveLength(45);
    expect(new Set(items.map((item) => item.id)).size).toBe(45);
  });

  it("matches how-to haystacks for every question", () => {
    const failures: string[] = [];
    for (const item of items) {
      const found = findHowTos(item.question, item.route);
      if (found.length < 1) failures.push(`${item.id} found no how-to`);
      const haystack = howToText(item.question, item.route);
      for (const pattern of misses(haystack, item.must_include)) failures.push(`${item.id} missing /${pattern}/`);
      for (const pattern of hits(haystack, item.must_not_include)) failures.push(`${item.id} forbidden /${pattern}/`);
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("puts a How-to reference block on every eval turn", () => {
    for (const item of items) {
      const ctx = readExpertContext(item.route, new URLSearchParams(`entity=${item.entity}&period=${item.period}`));
      const packed = buildSystemForTurn(ctx, emptyBundle, item.question);
      expect(packed, item.id).toContain("## How-to reference");
    }
  });

  it("keeps offline answers free of forbidden phrases and covers at least 80%", () => {
    const failures: string[] = [];
    let passed = 0;
    for (const item of items) {
      const ctx = readExpertContext(item.route, new URLSearchParams(`entity=${item.entity}&period=${item.period}`));
      const answer = normalize(answerOffline(item.question, ctx, emptyBundle).content);
      const forbidden = hits(answer, item.must_not_include);
      const missing = misses(answer, item.must_include);
      for (const pattern of forbidden) failures.push(`${item.id} forbidden /${pattern}/`);
      if (forbidden.length === 0 && missing.length === 0) passed += 1;
      else if (missing.length) failures.push(`${item.id} offline missing ${missing.join(" | ")}`);
    }
    const rate = passed / items.length;
    console.log(`OFFLINE_AFTER ${passed}/${items.length}`);
    expect(failures.filter((row) => row.includes("forbidden")), failures.join("\n")).toEqual([]);
    expect(rate).toBeGreaterThanOrEqual(0.8);
  });

  it("routes the four former misroutes to the right how-to", () => {
    const cases = [
      {
        question: "The month-end is soft-closed and I need to repost the journals that are already in the month.",
        route: "/deals/SPE-WBG/close",
        id: "close.month-end",
      },
      {
        question: "The distribution was refused: That period is before the latest distribution (2026-07).",
        route: "/deals/SPE-WBG/distributions",
        id: "distributions.ledger",
      },
      {
        question: "Add Deal upload is too large and returns 413.",
        route: "/deals/new",
        id: "add-deal.intake",
      },
      {
        question: "How is G&A % of AM fee income calculated?",
        route: "/dashboard/RCP-OPCO",
        id: "dashboard.tiles",
      },
    ];
    for (const row of cases) {
      const best = findHowTos(row.question, row.route, 8).find((entry) =>
        entry.keywords.some((keyword) => keyword.test(row.question)),
      );
      expect(best?.id, row.question).toBe(row.id);
      const ctx = readExpertContext(row.route, new URLSearchParams("entity=RCP-OPCO&period=2026-08"));
      const answer = answerOffline(row.question, ctx, emptyBundle).content.toLowerCase();
      if (row.id === "close.month-end") expect(answer).toMatch(/soft-closed|controller/);
      if (row.id === "distributions.ledger") expect(answer).toMatch(/before the latest|2026-07|reverse/);
      if (row.id === "add-deal.intake") expect(answer).toMatch(/blob|4\.5|3\.5/);
      if (row.id === "dashboard.tiles") expect(answer).toMatch(/7010|g&a/);
      expect(answer).not.toMatch(/tax bridge/);
    }
  });
});
