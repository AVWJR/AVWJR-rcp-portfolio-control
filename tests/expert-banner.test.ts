import { chromeAlias, composeExpertChrome, rankChips, rankSuggestedActions } from "@/lib/expert/actions";
import { expertBannerLine, expertBannerState, inferExpertReplyMode } from "@/lib/expert/banner";
import { readExpertContext } from "@/lib/expert/nav";
import { answerOffline, type OfflineBundle } from "@/lib/expert/offline-coach";
import { describe, expect, it } from "vitest";

const skipBundle: OfflineBundle = {
  entity: { ok: false, error: "skip" },
  period: { ok: false, error: "skip" },
  completeness: { ok: false, error: "skip" },
  anomalies: { ok: false, error: "skip" },
  kpis: { ok: false, error: "skip" },
};

describe("expert banner follows last reply mode", () => {
  it("never paints Grok connected from a key alone", () => {
    const idle = expertBannerState({ keyPresent: true, pending: false, lastExpert: null });
    expect(idle.display).toBe("unconfirmed");
    expect(idle.liveReady).toBe(false);
    expect(expertBannerLine(idle.display)).not.toMatch(/Grok connected/);

    const connecting = expertBannerState({ keyPresent: true, pending: true, lastExpert: null });
    expect(connecting.display).toBe("connecting");
    expect(expertBannerLine(connecting.display)).not.toMatch(/Grok connected/);
  });

  it("stays gold when the last reply was the offline coach even if a Gateway key exists", () => {
    const state = expertBannerState({
      keyPresent: true,
      pending: false,
      lastExpert: {
        mode: "offline",
        sources: ["From live Expert tools (offline coach)"],
        fallbackReason: "Live Grok (spacexai/grok-4.6) failed — using offline coach. HTTP 402",
      },
    });
    expect(state.display).toBe("degraded");
    expect(state.liveReady).toBe(false);
    expect(expertBannerLine(state.display, state.fallbackReason)).toMatch(/Live Grok/);
    expect(expertBannerLine(state.display, state.fallbackReason)).not.toMatch(/Grok connected/);
  });

  it("infers offline from stored sources when mode was not persisted", () => {
    expect(
      inferExpertReplyMode({
        sources: ["From live Expert tools (offline coach)"],
      }),
    ).toBe("offline");
    const state = expertBannerState({
      keyPresent: true,
      pending: false,
      lastExpert: { sources: ["From live Expert tools (offline coach)"] },
    });
    expect(state.display).toBe("degraded");
  });

  it("paints Grok connected only after a live-mode reply", () => {
    const state = expertBannerState({
      keyPresent: true,
      pending: false,
      lastExpert: { mode: "ai", sources: ["From live Expert tools + Grok"] },
    });
    expect(state.display).toBe("grok");
    expect(state.liveReady).toBe(true);
    expect(expertBannerLine(state.display)).toMatch(/Grok connected/);
  });

  it("stays offline when no key is configured", () => {
    const state = expertBannerState({
      keyPresent: false,
      pending: false,
      lastExpert: { mode: "offline", sources: ["From live Expert tools (offline coach)"] },
    });
    expect(state.display).toBe("offline");
    expect(expertBannerLine(state.display)).toMatch(/Offline coach — add key/);
  });
});

describe("expert chrome dedupe", () => {
  it("collapses Open Deals / Open Deals list and Add Deal synonyms", () => {
    expect(chromeAlias("Open Deals", "/deals")).toBe(chromeAlias("Open Deals list"));
    expect(chromeAlias("Open Add Deal", "/deals/new")).toBe(chromeAlias("Add a new deal"));
    const composed = composeExpertChrome(
      [
        { id: "act_deals", kind: "navigate", label: "Open Deals", href: "/deals" },
        { id: "act_add_deal", kind: "navigate", label: "Open Add Deal", href: "/deals/new" },
      ],
      [
        { id: "deals_list", label: "Open Deals list", prompt: "Show deals" },
        { id: "add_deal", label: "Add a new deal", prompt: "Add deal" },
      ],
    );
    const labels = [...composed.actions, ...composed.chips].map((row) => row.label);
    expect(labels).toEqual(["Open Deals", "Open Add Deal"]);
  });

  it("dedupes delete-deal how-to to at most three unique chrome labels", () => {
    const ctx = readExpertContext("/dashboard/SPE-HCR", new URLSearchParams("entity=SPE-HCR&period=2026-08"));
    const reply = answerOffline("I need to delete a deal. How?", ctx, skipBundle);
    const labels = [...(reply.actions ?? []), ...(reply.chips ?? [])].map((row) => row.label);
    const aliases = [
      ...(reply.actions ?? []).map((action) => chromeAlias(action.label, action.href)),
      ...(reply.chips ?? []).map((chip) => chromeAlias(chip.label)),
    ];
    expect(labels.length).toBeLessThanOrEqual(3);
    expect(new Set(aliases).size).toBe(aliases.length);
    expect(labels.filter((label) => /^open deals\b/i.test(label) || /deals list/i.test(label)).length).toBeLessThanOrEqual(1);
    const raw = composeExpertChrome(
      rankSuggestedActions(ctx, skipBundle, "I need to delete a deal. How?"),
      rankChips(ctx, skipBundle, "I need to delete a deal. How?"),
    );
    expect(raw.actions.length + raw.chips.length).toBeLessThanOrEqual(3);
  });
});
