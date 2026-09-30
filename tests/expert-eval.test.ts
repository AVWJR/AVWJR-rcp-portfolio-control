import { readFileSync } from "node:fs";
import path from "node:path";
import { answerOffline, type OfflineBundle } from "@/lib/expert/offline-coach";
import { answerFromHowTos, buildHowToReference, findHowTos } from "@/lib/expert/howtos";
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

/** Patterns already in the question, or the trivial tokens x / owned / test / ga, do not earn a pass. */
function countsTowardPass(pattern: string, question: string): boolean {
  if (/^(?:x|owned|test|ga)$/i.test(pattern.trim())) return false;
  return !new RegExp(pattern, "i").test(question);
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

  it("scores offline answers strictly and keeps forbidden phrases out", () => {
    const failures: string[] = [];
    let passed = 0;
    for (const item of items) {
      const ctx = readExpertContext(item.route, new URLSearchParams(`entity=${item.entity}&period=${item.period}`));
      const answer = normalize(answerOffline(item.question, ctx, emptyBundle).content);
      const forbidden = hits(answer, item.must_not_include);
      const required = item.must_include.filter((pattern) => countsTowardPass(pattern, item.question));
      const missing = misses(answer, required);
      for (const pattern of forbidden) failures.push(`${item.id} forbidden /${pattern}/`);
      const ok = forbidden.length === 0 && required.length > 0 && missing.length === 0;
      if (ok) passed += 1;
      else if (missing.length) failures.push(`${item.id} offline missing ${missing.join(" | ")}`);
      else if (required.length === 0) failures.push(`${item.id} no substantive must_include`);
    }
    console.log(`OFFLINE_STRICT ${passed}/${items.length}`);
    expect(failures.filter((row) => row.includes("forbidden")), failures.join("\n")).toEqual([]);
    // PK-1 and PK-3 only repeat patterns already in the question (or the trivial token "owned"), so they do not pass.
    expect(passed, failures.filter((row) => !row.includes("forbidden")).join("\n")).toBe(43);
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

  it("routes paraphrases to the right how-to and keeps waterfall catch-up off the tax bridge", () => {
    const cases: { question: string; route: string; id: string }[] = [
      { question: "reopen without a ticket", route: "/close", id: "close.month-end" },
      { question: "I need a ticket before I can reopen this month", route: "/deals/SPE-WBG/close", id: "close.month-end" },
      { question: "how do I reopen a hard-locked month", route: "/", id: "close.month-end" },
      { question: "change a deal from pipeline to owned", route: "/library", id: "library.statuses" },
      { question: "change status on a screened deal", route: "/deals/SPE-MPL", id: "library.statuses" },
      { question: "what cash is available to distribute", route: "/deals/SPE-WBG/waterfall", id: "waterfall.deal" },
      { question: "what does the catch-up percent mean", route: "/", id: "waterfall.deal" },
      { question: "undo a distribution I posted by mistake", route: "/deals/SPE-WBG/distributions", id: "distributions.ledger" },
      { question: "how do I reverse the latest distribution", route: "/", id: "distributions.ledger" },
      { question: "which accounts make up OpCo G&A", route: "/dashboard/RCP-OPCO", id: "dashboard.tiles" },
      { question: "why is a pipeline deal missing from the by spe table", route: "/opco/proforma", id: "proforma.forward" },
      { question: "why is a pipeline deal left out of the monthly pack", route: "/narratives", id: "packs.investor" },
    ];
    expect(cases.length).toBeGreaterThanOrEqual(12);
    for (const row of cases) {
      const best = findHowTos(row.question, row.route, 8).find((entry) =>
        entry.keywords.some((keyword) => keyword.test(row.question)),
      );
      expect(best?.id, row.question).toBe(row.id);
    }

    const library = readExpertContext("/library", new URLSearchParams("entity=RCP-OPCO&period=2026-08"));
    const statusAnswer = answerOffline("change a deal from pipeline to owned", library, emptyBundle).content;
    expect(statusAnswer).toMatch(/library/i);
    expect(statusAnswer).not.toMatch(/open deals|go to deals|deals page.{0,40}status|deals →/i);

    const waterfall = readExpertContext("/deals/SPE-WBG/waterfall", new URLSearchParams("entity=SPE-WBG&period=2026-08"));
    for (const question of ["what is the catch-up percent on this page", "why isn't catch-up a 50/50 split"]) {
      const answer = answerOffline(question, waterfall, emptyBundle).content;
      expect(answer, question).not.toMatch(/tax bridge/i);
    }

    const checklist = answerOffline("what is left on the checklist before hard lock", waterfall, emptyBundle).content;
    expect(checklist).toMatch(/checklist mode/i);
    const yieldAnswer = answerOffline("what is the debt yield for Willow Bend", waterfall, emptyBundle).content;
    expect(yieldAnswer).toMatch(/cannot read KPIs|debt yield|Live KPIs/i);
    expect(yieldAnswer).not.toMatch(/Only Owned SPEs can post a month-end close/);
  });

  it("keeps how-to answers and the system reference inside a sentence boundary", () => {
    const question = "Hard close is blocked: RR-1 Rent roll is missing. Reopen requires a non-empty reason and ticket.";
    const answer = answerFromHowTos(question, "/deals/SPE-WBG/close");
    expect(answer).toBeTruthy();
    expect(answer!.length).toBeLessThanOrEqual(1_200);
    expect(answer).toMatch(/[.!?]["')\]]?$/);
    const reference = buildHowToReference("/deals/SPE-WBG/close", question);
    expect(reference.length).toBeLessThanOrEqual(6_000);
    expect(reference).not.toMatch(/\.\.\.$/);
    expect(reference).toMatch(/[.!?]["')\]]?$/);
  });
});
