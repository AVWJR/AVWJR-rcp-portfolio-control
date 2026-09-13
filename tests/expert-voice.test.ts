import { rankChips } from "@/lib/expert/actions";
import { answerOffline, buildOpener, type OfflineBundle } from "@/lib/expert/offline-coach";
import { readExpertContext } from "@/lib/expert/nav";
import { buildSystemForTurn, summarizeExpertSnapshot } from "@/lib/expert/snapshot";
import { EXPERT_SYSTEM_PROMPT } from "@/lib/expert/system-prompt";
import { describe, expect, it } from "vitest";

const emptyBundle: OfflineBundle = {
  entity: { ok: false, error: "skip" },
  period: { ok: false, error: "skip" },
  completeness: { ok: false, error: "skip" },
  anomalies: { ok: false, error: "skip" },
  kpis: { ok: false, error: "skip" },
};

const flagHeavyBundle: OfflineBundle = {
  entity: {
    code: "RCP-OPCO",
    name: "RCP Operating Company",
    type: "OPCO",
    parentCode: "RCP-HOLD",
    unitCount: null,
    strategy: null,
    children: [{ code: "SPE-HRP", name: "Life at Harrington Park", type: "SPE", unitCount: 0 }],
  },
  period: {
    entityCode: "RCP-OPCO",
    periodLabel: "2026-08",
    status: "OPEN",
    statusLabel: "Open",
    exists: true,
    checklistDone: 0,
    checklistTotal: 4,
    openItems: [{ code: "TB", label: "TB feet", status: "OPEN" }],
  },
  completeness: {
    entityCode: "RCP-OPCO",
    periodLabel: "2026-08",
    score: 62,
    ready: 5,
    applicable: 8,
    items: [
      {
        id: "spe_SPE-HRP",
        label: "SPE-HRP look-through inputs",
        status: "missing",
        detail: "Missing rent roll, budget",
        href: "/dashboard/SPE-HRP",
        source: "From OpCo look-through stack",
      },
      {
        id: "spe_SPE-WBG",
        label: "SPE-WBG look-through inputs",
        status: "partial",
        detail: "Missing loan file",
        href: "/dashboard/SPE-WBG",
        source: "From OpCo look-through stack",
      },
      {
        id: "tax",
        label: "Tax-bridge adjustments",
        status: "missing",
        detail: "No tax adjustment rows",
        href: "/tax",
        source: "From Tax bridge",
      },
    ],
  },
  anomalies: {
    entityCode: "RCP-OPCO",
    periodLabel: "2026-08",
    flags: [
      {
        id: "watch_SPE-HCR",
        severity: "blocker",
        title: "SPE-HCR covenant watch",
        detail: "DSCR below the loan-file threshold",
        source: "From OpCo dashboard watchlist / Loan file",
        href: "/dashboard/SPE-HCR",
      },
      {
        id: "watch_SPE-WBG",
        severity: "watch",
        title: "SPE-WBG covenant watch",
        detail: "DSCR 1.16× · debt yield 8.25%",
        source: "From OpCo dashboard watchlist / Loan file",
        href: "/debt",
      },
      {
        id: "t12_incomplete",
        severity: "info",
        title: "Look-through T12 NOI is incomplete",
        detail: "Only 2 month(s) of SPE books. Not annualized.",
        source: "From Dashboard KPI T12 NOI",
        href: "/dashboard",
      },
      {
        id: "ltv_gated",
        severity: "info",
        title: "LTV is gated",
        detail: "Loan file has UPB but no appraisal. Do not divide UPB by book cost.",
        source: "From Dashboard KPI LTV",
        href: "/dashboard/ratios/ltv",
      },
    ],
  },
  kpis: {
    entityCode: "RCP-OPCO",
    entityName: "RCP Operating Company",
    periodLabel: "2026-08",
    kind: "opco",
    viewLabel: "Combined roll-up",
    tiles: [
      { id: "noi_period", display: "($16,410.00)", hint: "Period NOI", gated: false },
      { id: "dscr", display: "1.16x", hint: "Look-through DSCR", gated: false },
    ],
    notes: ["Covenant watchlist: SPE-WBG DSCR below threshold"],
  },
};

describe("expert coach voice", () => {
  it("locks query-first answers and forbids unsolicited acronym dumps", () => {
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/Answer the user's question first/i);
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/2–5 plain sentences/);
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/one concrete next click/i);
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/friendly, helpful, insightful, and patient/i);
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/Do not dump/i);
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/Do not recite related acronyms/i);
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/Do not spray flags on open/i);
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/clarifying question/i);
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/1–3/);
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/spacexai\/grok-4\.6/);
  });

  it("opens with a short greeting, not a watchlist essay", () => {
    const ctx = readExpertContext("/", new URLSearchParams("entity=RCP-OPCO&period=2026-08"));
    const opener = buildOpener(ctx, flagHeavyBundle);
    expect(opener.content).toMatch(/OpCo|Overview/i);
    expect(opener.content).not.toMatch(/LTV is gated/i);
    expect(opener.content).not.toMatch(/T12 NOI/i);
    expect(opener.content).not.toMatch(/DSCR 1\.16/i);
    expect(opener.content).not.toMatch(/Leading items/i);
    expect(opener.content).not.toMatch(/does not file/i);
    expect(opener.content).not.toMatch(/covenant watch/i);
    expect(opener.content.length).toBeLessThan(520);
    expect(opener.chips?.length).toBeLessThanOrEqual(3);
  });

  it("answers an OpCo NOI definition without DSCR / LTV / T12 spam", () => {
    const ctx = readExpertContext("/", new URLSearchParams("entity=RCP-OPCO&period=2026-08"));
    const reply = answerOffline("What does NOI mean on this OpCo card?", ctx, flagHeavyBundle);
    expect(reply.content).toMatch(/Net Operating Income/i);
    expect(reply.content).toMatch(/below\*{0,2} NOI/i);
    expect(reply.content).toMatch(/\$16,410|16,410/);
    expect(reply.content).not.toMatch(/DSCR/i);
    expect(reply.content).not.toMatch(/\bLTV\b/);
    expect(reply.content).not.toMatch(/\bT12\b/);
    expect(reply.chips?.length).toBeLessThanOrEqual(3);
    expect(reply.chips?.some((c) => /dscr|ltv|audience/i.test(c.id))).toBe(false);
  });

  it("keeps a Harrington missing-data question on Harrington gaps only", () => {
    const ctx = readExpertContext("/", new URLSearchParams("entity=RCP-OPCO&period=2026-08"));
    const reply = answerOffline("What's missing for Harrington?", ctx, flagHeavyBundle);
    expect(reply.content).toMatch(/Harrington|SPE-HRP|rent roll/i);
    expect(reply.content).not.toMatch(/SPE-WBG/);
    expect(reply.content).not.toMatch(/Tax-bridge/i);
    expect(reply.content).not.toMatch(/DSCR|LTV is gated|T12/i);
  });

  it("asks one clarifying question instead of dumping the product map", () => {
    const ctx = readExpertContext("/", new URLSearchParams("entity=RCP-OPCO&period=2026-08"));
    const reply = answerOffline("hmm", ctx, flagHeavyBundle);
    expect(reply.content).toMatch(/not sure|clarif|asking about/i);
    expect(reply.content).not.toMatch(/LTV is gated|completeness 62|Leading items/i);
  });

  it("summarizes the tool snapshot instead of stuffing every flag into the model turn", () => {
    const ctx = readExpertContext("/", new URLSearchParams("entity=RCP-OPCO&period=2026-08"));
    const snap = summarizeExpertSnapshot(ctx, flagHeavyBundle);
    expect(snap.blockers.map((row) => row.id)).toEqual(["watch_SPE-HCR"]);
    expect(snap.watchInfoFlagCount).toBe(3);
    expect(JSON.stringify(snap)).not.toMatch(/LTV is gated/);
    expect(JSON.stringify(snap)).not.toMatch(/uiHints/);
    const packed = buildSystemForTurn(ctx, flagHeavyBundle);
    expect(packed).toContain("Answer the user's question first");
    expect(packed).not.toContain("Loan file has UPB but no appraisal");
    expect(packed.length).toBeLessThan(JSON.stringify(flagHeavyBundle).length + EXPERT_SYSTEM_PROMPT.length);
  });

  it("caps chips at three and stays on the last question", () => {
    const ctx = readExpertContext("/dashboard/RCP-OPCO", new URLSearchParams("entity=RCP-OPCO&period=2026-08"));
    const chips = rankChips(ctx, flagHeavyBundle, "What does NOI mean on this OpCo card?");
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.length).toBeLessThanOrEqual(3);
    expect(chips.every((c) => !/dscr|audience|lender/i.test(c.id))).toBe(true);
  });
});
