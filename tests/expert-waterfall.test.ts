import { rankChips, rankSuggestedActions } from "@/lib/expert/actions";
import { answerOffline, type OfflineBundle } from "@/lib/expert/offline-coach";
import { listNavTargets, readExpertContext } from "@/lib/expert/nav";
import { EXPERT_SYSTEM_PROMPT } from "@/lib/expert/system-prompt";
import { describe, expect, it } from "vitest";

const emptyBundle: OfflineBundle = {
  entity: { ok: false, error: "skip" },
  period: { ok: false, error: "skip" },
  completeness: { ok: false, error: "skip" },
  anomalies: { ok: false, error: "skip" },
  kpis: { ok: false, error: "skip" },
};

describe("Expert deal waterfall coaching", () => {
  it("lists Deal waterfall as a nav target", () => {
    const row = listNavTargets().find((t) => t.id === "waterfall");
    expect(row?.label).toBe("Deal waterfall");
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/How do I set the deal waterfall/);
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/LP\/GP waterfall/);
  });

  it("teaches the Deals → SPE → LP/GP waterfall click path for SPE-HMTOS", () => {
    const ctx = readExpertContext("/deals", new URLSearchParams("entity=SPE-HMTOS&period=2026-08"));
    const reply = answerOffline("How do I set the deal waterfall?", ctx, emptyBundle);
    expect(reply.content).toMatch(/Gold nav \*\*Deals\*\*/);
    expect(reply.content).toMatch(/LP\/GP waterfall/);
    expect(reply.content).toMatch(/SPE-HMTOS/);
    expect(reply.content).toMatch(/\/deals\/SPE-HMTOS\/waterfall/);
    expect(reply.content).toMatch(/100% look-through/);
    expect(reply.content).toMatch(/Save waterfall/);
    expect(reply.content).toMatch(/after waterfall/);
    expect(reply.content).toMatch(/Co-GP/);
    expect(reply.content).toMatch(/\/deals\/SPE-HMTOS\/proforma/);
    expect(reply.content).toMatch(/\/opco\/proforma/);
    expect(reply.content).not.toMatch(/invent AR|delinquency rate/i);

    const chips = rankChips(ctx, emptyBundle, "How do I set the deal waterfall?");
    expect(chips.some((c) => /waterfall/i.test(c.id) || /waterfall/i.test(c.label))).toBe(true);
    const actions = rankSuggestedActions(ctx, emptyBundle, "How do I set the deal waterfall?");
    expect(actions.some((a) => a.href?.includes("/waterfall"))).toBe(true);
    expect(actions.some((a) => a.href?.includes("/proforma"))).toBe(true);
  });
});
