import { rankChips, rankSuggestedActions } from "@/lib/expert/actions";
import { answerOffline, type OfflineBundle } from "@/lib/expert/offline-coach";
import { describePage, entityFromPathname, listNavTargets, readExpertContext } from "@/lib/expert/nav";
import { EXPERT_SYSTEM_PROMPT } from "@/lib/expert/system-prompt";
import { describe, expect, it } from "vitest";

const emptyBundle: OfflineBundle = {
  entity: { ok: false, error: "skip" },
  period: { ok: false, error: "skip" },
  completeness: { ok: false, error: "skip" },
  anomalies: { ok: false, error: "skip" },
  kpis: { ok: false, error: "skip" },
};

describe("Expert distribution ledger coaching", () => {
  it("teaches how to record a distribution without inventing a screen", () => {
    const ctx = readExpertContext("/deals/SPE-WBG/distributions", new URLSearchParams("period=2026-08"));
    expect(entityFromPathname("/deals/SPE-WBG/distributions")).toBe("SPE-WBG");
    expect(describePage("/deals/SPE-WBG/distributions").title).toBe("Distribution ledger");
    expect(listNavTargets().some((row) => row.id === "distributions")).toBe(true);
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/How do I record a distribution/);
    const reply = answerOffline("How do I record a distribution?", ctx, emptyBundle);
    expect(reply.content).toMatch(/\/deals\/SPE-WBG\/distributions/);
    expect(reply.content).toMatch(/Preview allocation/);
    expect(reply.content).toMatch(/\$0 distributed/);
    expect(reply.content).toMatch(/cannot be edited or deleted/);
    const chips = rankChips(ctx, emptyBundle, "How do I record a distribution?");
    expect(chips.some((chip) => chip.id === "record_distribution")).toBe(true);
    const actions = rankSuggestedActions(ctx, emptyBundle, "How do I record a distribution?");
    expect(actions.some((action) => action.href?.includes("/deals/SPE-WBG/distributions"))).toBe(true);
  });

  it("explains unpaid pref from the ledger and does not invent a dollar", () => {
    const ctx = readExpertContext("/deals", new URLSearchParams("entity=SPE-CVC&period=2026-08"));
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/How much pref is still owed/);
    const reply = answerOffline("How much pref is still owed?", ctx, emptyBundle);
    expect(reply.content).toMatch(/\/deals\/SPE-CVC\/distributions/);
    expect(reply.content).toMatch(/will not invent a dollar/);
    expect(reply.content).toMatch(/LP pref unpaid/);
    expect(reply.content).not.toMatch(/\$[1-9]/);
    const actions = rankSuggestedActions(ctx, emptyBundle, "How much pref is still owed?");
    expect(actions[0]?.href).toContain("/deals/SPE-CVC/distributions");
  });
});
