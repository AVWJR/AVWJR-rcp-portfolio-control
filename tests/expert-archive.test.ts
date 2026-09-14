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

describe("Expert Deal Archive coaching", () => {
  it("lists Deal Archive as its own nav target, not nested under Deals", () => {
    const archive = listNavTargets().find((row) => row.id === "archive");
    expect(archive?.href).toBe("/archive");
    expect(archive?.label).toBe("Deal Archive");
    expect(archive?.hint).toMatch(/not under Deals/i);
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/gold nav \*\*Deal Archive\*\*/);
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/not\*\* a tab under Deals/);
  });

  it("teaches Delete on Deals row then find-on-Deal-Archive, never a hard wipe", () => {
    const ctx = readExpertContext("/deals", new URLSearchParams("entity=SPE-WBG&period=2026-08"));
    const reply = answerOffline("How do I delete a deal?", ctx, emptyBundle);
    expect(reply.content).toMatch(/\*\*Delete\*\*/);
    expect(reply.content).toMatch(/Deals/);
    expect(reply.content).toMatch(/Vault/);
    expect(reply.content).toMatch(/two-step|Type the SPE code/i);
    expect(reply.content).toMatch(/gold nav \*\*Deal Archive\*\*/);
    expect(reply.content).toMatch(/\/archive/);
    expect(reply.content).toMatch(/not a hard wipe|soft-archive/i);
    expect(reply.content).toMatch(/OpCo combined roll-up/);
    expect(reply.content).toMatch(/There is no Archive tab under Deals/);
    expect(reply.content).toMatch(/SPE-WBG/);
    expect(reply.content).toMatch(/cannot be deleted/i);
    expect(reply.content).not.toMatch(/Deals → \*\*Archive\*\*/);
    expect(reply.content).toMatch(/Partners/);

    const find = answerOffline("Where are archived deals?", ctx, emptyBundle);
    expect(find.content).toMatch(/gold nav \*\*Deal Archive\*\*/);
    expect(find.content).toMatch(/Not a tab under Deals|not a tab under Deals|There is no Archive tab under Deals/i);

    const chips = rankChips(ctx, emptyBundle, "Where are archived deals?");
    expect(chips.some((chip) => /archive/i.test(chip.id))).toBe(true);
  });
});
